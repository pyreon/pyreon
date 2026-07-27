/**
 * Core vocabulary for `@pyreon/http`.
 *
 * Deliberately built on WHATWG primitives (`Headers`, `AbortSignal`,
 * `BodyInit`, `Response`) rather than a bespoke config universe — the
 * SERVER half of the framework already speaks them (`ApiContext` is
 * `{ request: Request, url: URL, params, headers: Headers }`, and every
 * deploy adapter is `fetch`-shaped), so a middleware written for the
 * client and one written for the server share a vocabulary.
 *
 * This module has ZERO runtime dependencies — every schema-shaped type
 * here is structural, so it is fully erased at compile time and the core
 * never imports `@pyreon/validation`.
 */

/** HTTP methods the client can issue. Mirrors zero's `HttpMethod`. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

/**
 * A value accepted for a query-string entry. `undefined` / `null` entries
 * are DROPPED (not serialized as the strings `"undefined"` / `"null"` —
 * the classic hand-rolled `URLSearchParams` bug); arrays repeat the key.
 */
export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean)[]

/** Path parameters substituted into a `:name` placeholder. */
export type PathParams = Record<string, string | number>

/** Query-string parameters. */
export type QueryParams = Record<string, QueryValue>

/**
 * How a response-validation failure is handled.
 *
 * - `'strict'` (default) — throw {@link ResponseValidationError}.
 * - `'warn'` — `console.warn` and pass the RAW body through. Useful when a
 *   backend drifts and you would rather degrade than white-screen.
 * - `'off'` — skip validation entirely.
 *
 * NOTE `'off'` is only safe for NON-TRANSFORMING schemas. A schema that
 * coerces (`z.coerce.number()`, a `.transform()`) does real work, so
 * skipping it changes the VALUE, not just the check — the declared type
 * then lies. Prefer `'warn'` when in doubt.
 */
export type ValidateMode = 'strict' | 'warn' | 'off'

/**
 * A plain parse function — the Tier-1 validation primitive.
 *
 * Any `(raw: unknown) => T` fits: a hand-written type guard, a
 * `superstruct` assert, or a detached `zodSchema.parse`. Because it is
 * just a function, Tier 1 costs the core ZERO dependencies.
 */
export type ParseFn<T> = (raw: unknown) => T

/**
 * Structural shape of a Standard Schema (`~standard`) — Tier 2.
 *
 * Declared structurally ON PURPOSE: it is a TYPE, so it is erased and the
 * core keeps its zero-dependency guarantee. The RUNTIME half (detecting +
 * invoking `~standard.validate`) lives in the separate `@pyreon/http/schema`
 * entry, which may depend on `@pyreon/validation`.
 */
export interface StandardSchemaShape<Output = unknown> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => unknown
    readonly types?: { readonly output: Output } | undefined
  }
}

/**
 * Recover the output type from the `validate` RETURN.
 *
 * The `~standard.types` phantom is OPTIONAL in the spec, and
 * `@pyreon/validate`'s `s` omits it — so a `types`-only reader silently
 * degrades Pyreon's OWN validator to `unknown`. The success branch of the
 * result is the one WITHOUT issues; valibot's failure branch carries a
 * `value` too, which is why the discriminant is `issues`, not `value`
 * (the same rule the runtime follows).
 */
type InferFromValidate<S> = S extends {
  readonly '~standard': { readonly validate: (value: never) => infer R }
}
  ? Extract<Awaited<R>, { issues?: undefined }> extends { value: infer O }
    ? O
    : unknown
  : unknown

/**
 * Extract a schema's output type.
 *
 * Three stages, mirroring `@pyreon/validation`'s `InferSchema`:
 * 1. `_infer` — a `@pyreon/validation` TYPED ADAPTER (`zodSchema(...)`).
 * 2. `~standard.types.output` — zod / valibot / arktype instances.
 * 3. the `validate` return — `@pyreon/validate`'s `s`, which omits (1) and (2).
 */
export type SchemaOutput<S> = S extends { readonly _infer: infer T }
  ? T
  : S extends { readonly '~standard': { readonly types?: infer TY } }
    ? NonNullable<TY> extends { readonly output: infer O }
      ? O
      : InferFromValidate<S>
    : InferFromValidate<S>

/**
 * True for a value carrying the Standard Schema brand.
 *
 * Kept as a distinct helper because the ORDER in which it is applied is
 * load-bearing — see {@link ValidatorOutput}.
 */
export type IsStandardSchema<V> = V extends { readonly '~standard': { readonly validate: unknown } }
  ? true
  : V extends { readonly _infer: unknown }
    ? // A `@pyreon/validation` TYPED ADAPTER — a schema, not a parse fn.
      // Keyed on `_infer` ALONE: `TypedSchemaAdapter.parse` is OPTIONAL,
      // so also requiring `parse` makes every adapter fall through to the
      // `unknown` arm.
      true
    : false

/**
 * The type `.json(validator)` resolves to.
 *
 * ORDER IS LOAD-BEARING, and for the same reason as the runtime's
 * `resolveValidator`: **an ArkType schema is CALLABLE**, so it satisfies
 * `ParseFn<infer T>`. Testing the function branch first infers
 * `T = ArkErrors | Output` — the error type unioned into your data — which
 * type-checks, looks strict, and is wrong. Branding wins over shape.
 */
export type ValidatorOutput<V> =
  IsStandardSchema<V> extends true
    ? SchemaOutput<V>
    : V extends ParseFn<infer T>
      ? T
      : unknown

/**
 * Anything `.json()` accepts as a validator: a plain parse function
 * (Tier 1, dependency-free) or a Standard Schema object (Tier 2, requires
 * a resolver — see {@link HttpClientConfig.schema}).
 */
export type Validator<T> =
  | ParseFn<T>
  | StandardSchemaShape<T>
  /**
   * A `@pyreon/validation` typed adapter — `zodSchema(...)` et al.
   * `parse` is OPTIONAL on `TypedSchemaAdapter` (only the sync-parse
   * consumers need it), so it is optional here too; the resolver reports
   * a clear error when an adapter arrives without one.
   */
  | { readonly _infer: T; readonly parse?: ((value: unknown) => unknown) | undefined }

/**
 * Turns a schema object into a plain parse function, or returns `null`
 * when the value is not a schema this resolver understands.
 *
 * This is the INJECTION SEAM that keeps schema support optional: the core
 * never imports a validation library, it only calls a resolver the user
 * supplied. Omit it and the core tree-shakes with zero schema code.
 */
export type SchemaResolver = (schema: unknown) => ParseFn<unknown> | null

/** A request as it flows through the middleware chain. */
export interface HttpRequest {
  method: HttpMethod
  /** Fully-resolved absolute-or-root-relative URL (base + path + query). */
  url: string
  headers: Headers
  body: BodyInit | null
  signal: AbortSignal | undefined
  credentials: RequestCredentials | undefined
  /** Arbitrary per-request data for middleware. Never sent over the wire. */
  meta: Record<string, unknown>
}

/** The response as it flows back through the middleware chain. */
export interface HttpResponse {
  /** The underlying WHATWG response. */
  raw: Response
  status: number
  /** True for a 2xx status — named to match `Response.ok`. */
  ok: boolean
  headers: Headers
  /** The request that produced this response. */
  request: HttpRequest
}

/** Invokes the rest of the chain. Safe to call MORE than once (retry). */
export type Next = (request?: HttpRequest) => Promise<HttpResponse>

/**
 * Onion middleware — `(req, next) => res`.
 *
 * Chosen over axios-style interceptor arrays because it is the only shape
 * that expresses the three things people actually need:
 * - RETRY — call `next()` in a loop (an interceptor pair cannot re-enter
 *   the chain, which is why axios users end up with `config.__isRetry`).
 * - REFRESH — inspect the response, refresh, re-issue.
 * - SHORT-CIRCUIT — return WITHOUT calling `next` (mock, cache, offline).
 *
 * Order is lexical (the `use: [...]` array), so there is no registration
 * registry and no `eject()` handle to leak.
 */
export type HttpMiddleware = (request: HttpRequest, next: Next) => Promise<HttpResponse>

/** The bottom of the chain — actually performs the request. */
export type Transport = (request: HttpRequest) => Promise<HttpResponse>

/** Per-call request options. */
export interface RequestOptions {
  /** Substituted into `:name` placeholders in the path. */
  params?: PathParams | undefined
  /** Appended as a query string. */
  query?: QueryParams | undefined
  headers?: HeadersInit | undefined
  /** Serialized with `JSON.stringify` + `Content-Type: application/json`. */
  json?: unknown
  /** Raw body — passed through untouched. Mutually exclusive with `json`. */
  body?: BodyInit | null | undefined
  /** Caller cancellation. Composed with the timeout signal. */
  signal?: AbortSignal | undefined
  /** Milliseconds before the request aborts. `false` disables. */
  timeout?: number | false | undefined
  credentials?: RequestCredentials | undefined
  /** Throw {@link HttpError} on a non-2xx status. Defaults to `true`. */
  throwHttpErrors?: boolean | undefined
  /** Per-request middleware data. */
  meta?: Record<string, unknown> | undefined
}

/** Client-level configuration. Every field is optional. */
export interface HttpClientConfig
  extends Omit<RequestOptions, 'params' | 'json' | 'body' | 'headers'> {
  /**
   * Prefix for relative paths. A path starting with `http://`/`https://`
   * ignores it.
   */
  baseUrl?: string | undefined
  /**
   * Static headers, or an ACCESSOR evaluated per request (the seam for a
   * token signal: `headers: () => ({ Authorization: \`Bearer ${token()}\` })`).
   *
   * If you call the client from inside a TRACKED scope (an `effect`), wrap
   * the body in `untrack` — a request is imperative and must not subscribe
   * the surrounding effect to your token signal.
   */
  headers?: HeadersInit | (() => HeadersInit) | undefined
  /** Middleware, outermost first. */
  use?: readonly HttpMiddleware[] | undefined
  /** Overrides the bottom of the chain. Defaults to `fetch`. */
  transport?: Transport | undefined
  /**
   * Enables Tier-2 schema objects in `.json(schema)` / `endpoint`.
   * Omit it and schemas are unsupported (a clear error tells you how to
   * enable them) — which is exactly why the core costs zero bytes of
   * validation code when you do not use it.
   */
  schema?: SchemaResolver | undefined
  /** How a validation failure is handled. Defaults to `'strict'`. */
  validate?: ValidateMode | undefined
}
