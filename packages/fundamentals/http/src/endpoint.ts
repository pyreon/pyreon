/**
 * Endpoints — one declaration, three consumption modes.
 *
 * The biggest real pain with `axios` + TanStack Query is that the
 * `queryKey` and the URL drift apart, and the response type is a cast.
 * An endpoint makes both derived from a single source:
 *
 * ```ts
 * const getUser = api.endpoint('GET /users/:id', { response: UserSchema })
 *
 * await getUser({ params: { id: '1' } })            // typed + validated
 * useQuery(() => getUser.query({ params: { id: id() } }))  // key + fn + signal
 * getUser.key.prefix                                 // ['GET', '/users/:id']
 * ```
 *
 * `params` is REQUIRED by the type system exactly when the path contains
 * `:placeholders`, and its keys are extracted from the path string — so a
 * typo in `{ params: { userId } }` for `/users/:id` is a compile error.
 *
 * The query/mutation adapters below are structurally typed: they emit
 * plain objects that satisfy TanStack's option shapes, so this module has
 * NO dependency on `@pyreon/query`.
 */

import type { HttpClient } from './client'
import type {
  HttpMethod,
  PathParams,
  QueryParams,
  QueryStyle,
  Validator,
  ValidatorOutput,
} from './types'

type Alpha =
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm'
  | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z'
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z' | '_'
type AlphaNum = Alpha | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

/** The leading `[A-Za-z0-9_]*` run of `S`. Tail-recursive, one char per step. */
type TakeIdent<S extends string, Acc extends string = ''> = S extends `${infer C}${infer R}`
  ? C extends AlphaNum
    ? TakeIdent<R, `${Acc}${C}`>
    : Acc
  : Acc

/**
 * The parameter a `:` introduces — exactly what the runtime matcher
 * `:([A-Za-z_][A-Za-z0-9_]*)` captures, so `/f/:name.json` and
 * `/v1/:name\:cancel` both declare `name` on BOTH sides. A `:` not followed
 * by a letter or `_` (`:8080`) declares nothing, as at runtime.
 */
type ParamAt<S extends string> = S extends `${infer C}${string}`
  ? C extends Alpha
    ? TakeIdent<S>
    : never
  : never

/**
 * Every parameter in ONE segment. A segment can carry more than one
 * (`:a-:b`) and a parameter need not start it (`file:id`), because the
 * runtime scans the whole string. `\:` is a LITERAL colon and is skipped —
 * the escape for Google-style custom verbs, `/v1/:name\:cancel`.
 */
type SegmentParams<S extends string> = S extends `${infer Before}:${infer After}`
  ? Before extends `${string}\\`
    ? SegmentParams<After>
    : ParamAt<After> | SegmentParams<After>
  : never

/**
 * Extract `:name` placeholders from a path at the type level.
 *
 * Walks SEGMENTS (splitting on `/`) rather than scanning the whole path for
 * `:` with a leading `${string}`. The scanning form is the obvious one to
 * write and it is quadratic: `${string}:${infer Rest}` gives the compiler
 * many candidate split points per level, and nesting a second inference
 * inside it blows past the instantiation-depth limit at three parameters
 * (`TS2589`). A segment walk gives TypeScript exactly one split point per
 * level; the per-segment colon scan only ever sees one short segment.
 */
export type PathParamNames<S extends string> = S extends `${infer Head}/${infer Rest}`
  ? SegmentParams<Head> | PathParamNames<Rest>
  : SegmentParams<S>

/** `'GET /users/:id'` — method and path in one literal. */
export type EndpointSpec = `${HttpMethod} ${string}`

type MethodOf<S extends string> = S extends `${infer M} ${string}` ? M : never
type PathOf<S extends string> = S extends `${string} ${infer P}` ? P : never

/** Per-call arguments. `params` is required iff the path declares any. */
export type EndpointArgs<P extends string> = ([PathParamNames<P>] extends [never]
  ? { params?: undefined }
  : { params: Record<PathParamNames<P>, string | number> }) & {
  query?: QueryParams | undefined
  json?: unknown
  headers?: HeadersInit | undefined
  signal?: AbortSignal | undefined
  timeout?: number | false | undefined
  meta?: Record<string, unknown> | undefined
}

/** Makes the argument optional when nothing in it is required. */
export type CallArgs<A> = Record<string, never> extends A ? [args?: A] : [args: A]

/** A stable, structural cache key. */
export type EndpointKey = readonly unknown[]

/**
 * Options an endpoint is declared with, MINUS `response`.
 *
 * `response` is deliberately not a field here. Declaring it as
 * `Validator<TResponse>` and then intersecting `{ response?: V }` at the
 * call site makes `V` depend on `ResponseOf<V>` — a circular constraint
 * that TypeScript resolves for shallow schemas and gives up on for deep
 * ones (`TS2589` on an ArkType schema). Keeping the validator in its own
 * unconstrained slot breaks the cycle.
 */
export interface EndpointOptions {
  timeout?: number | false | undefined
  headers?: HeadersInit | undefined
  throwHttpErrors?: boolean | undefined
  /**
   * Per-key query serialization — OpenAPI's `style` / `explode`, stated once
   * on the endpoint so no call site has to know that `ids` goes out as
   * `ids=1,2`. See {@link QueryStyle}.
   *
   * @example
   * ```ts
   * const search = api.endpoint('GET /search', {
   *   queryStyle: { ids: { style: 'form', explode: false }, filter: { style: 'deepObject' } },
   * })
   * await search({ query: { ids: [1, 2], filter: { status: 'open' } } })
   * // GET /search?ids=1%2C2&filter%5Bstatus%5D=open
   * ```
   */
  queryStyle?: Readonly<Record<string, QueryStyle>> | undefined
}

/** {@link EndpointOptions} plus the validator slot that types the response. */
export type EndpointConfig<V> = EndpointOptions & {
  /** Validates and types the response. Omit for an unchecked `unknown`. */
  response?: V | undefined
}

/** Structural mirror of TanStack's query options — no dependency needed. */
export interface QueryOptionsLike<T> {
  queryKey: EndpointKey
  queryFn: (context: { signal: AbortSignal }) => Promise<T>
}

/** Structural mirror of TanStack's mutation options. */
export interface MutationOptionsLike<T, TVars> {
  mutationFn: (variables: TVars) => Promise<T>
  invalidates?: EndpointKey[] | undefined
}

/** A declared endpoint — callable, plus key/query/mutation helpers. */
export interface Endpoint<S extends EndpointSpec, TResponse> {
  (...args: CallArgs<EndpointArgs<PathOf<S>>>): Promise<TResponse>
  /** Narrowed to the literal from the spec — `'GET'`, not `HttpMethod`. */
  readonly method: MethodOf<S>
  /** The declared path, placeholders intact — `'/users/:id'`. */
  readonly path: PathOf<S>
  /** Build the cache key for these arguments; `.prefix` matches them all. */
  readonly key: ((...args: CallArgs<EndpointArgs<PathOf<S>>>) => EndpointKey) & {
    readonly prefix: EndpointKey
  }
  /** Options for `useQuery` — key, fetcher and cancellation all wired. */
  query(...args: CallArgs<EndpointArgs<PathOf<S>>>): QueryOptionsLike<TResponse>
  /**
   * Options for `useMutation`.
   *
   * NOTE `mutationFn` receives only `variables` — TanStack gives mutations
   * NO context and therefore no `AbortSignal`. Pass one in `variables` if
   * the mutation must be cancellable.
   */
  mutation<TVars extends EndpointArgs<PathOf<S>> = EndpointArgs<PathOf<S>>>(
    options?: { invalidates?: readonly { readonly key: { readonly prefix: EndpointKey } }[] },
  ): MutationOptionsLike<TResponse, TVars>
}

/**
 * Inferred response type.
 *
 * Delegates to {@link ValidatorOutput} so the schema-brand-before-callable
 * ordering is defined in exactly one place — an endpoint declared with an
 * ArkType schema must infer its OUTPUT, not `ArkErrors | Output`.
 */
export type ResponseOf<V> = [V] extends [undefined] ? unknown : ValidatorOutput<V>

function splitSpec(spec: string): { method: HttpMethod; path: string } {
  const gap = spec.indexOf(' ')
  if (gap === -1) {
    throw new Error(
      `[Pyreon] http: endpoint spec "${spec}" must be "<METHOD> <path>", e.g. "GET /users/:id".`,
    )
  }
  const method = spec.slice(0, gap).toUpperCase() as HttpMethod
  const path = spec.slice(gap + 1).trim()
  if (!path) {
    throw new Error(`[Pyreon] http: endpoint spec "${spec}" is missing a path.`)
  }
  return { method, path }
}

function isEmpty(value: object | undefined): boolean {
  return !value || Object.keys(value).length === 0
}

/**
 * The concrete, non-generic shape the implementation works against.
 *
 * The public {@link EndpointArgs} is generic over the path literal so that
 * `params` can be required-and-key-checked; erasing to this shape once,
 * here, keeps the single unavoidable generic→concrete cast contained in one
 * place instead of scattering casts through the body.
 */
interface RawArgs {
  params?: PathParams | undefined
  query?: QueryParams | undefined
  json?: unknown
  headers?: HeadersInit | undefined
  signal?: AbortSignal | undefined
  timeout?: number | false | undefined
  meta?: Record<string, unknown> | undefined
}

/** Build an {@link Endpoint} bound to `client`. */
export function defineEndpoint<
  S extends EndpointSpec,
  V extends Validator<unknown> | undefined = undefined,
>(
  client: HttpClient,
  spec: S,
  options: EndpointConfig<V> = {},
): Endpoint<S, ResponseOf<V>> {
  const { method, path } = splitSpec(spec)
  const prefix: EndpointKey = [method, path]

  const buildKey = (args?: RawArgs): EndpointKey => {
    const params = args?.params
    const query = args?.query
    if (isEmpty(params) && isEmpty(query)) return prefix
    const scope: Record<string, unknown> = {}
    if (!isEmpty(params)) scope.params = params
    if (!isEmpty(query)) scope.query = query
    return [method, path, scope]
  }

  const call = (args?: RawArgs): Promise<unknown> => {
    const request = client.request(method, path, {
      params: args?.params,
      query: args?.query,
      queryStyle: options.queryStyle,
      json: args?.json,
      headers: args?.headers ?? options.headers,
      signal: args?.signal,
      timeout: args?.timeout ?? options.timeout,
      meta: args?.meta,
      throwHttpErrors: options.throwHttpErrors,
    })
    return options.response
      ? request.json(options.response as Validator<unknown>)
      : request.json()
  }

  const key = Object.assign((args?: RawArgs) => buildKey(args), { prefix })

  const endpoint = Object.assign(call, {
    method,
    path,
    key,
    query: (args?: RawArgs) => ({
      queryKey: buildKey(args),
      queryFn: ({ signal }: { signal: AbortSignal }) => call({ ...args, signal }),
    }),
    mutation: (mutationOptions?: {
      invalidates?: readonly { readonly key: { readonly prefix: EndpointKey } }[]
    }) => ({
      mutationFn: (variables: RawArgs) => call(variables),
      invalidates: mutationOptions?.invalidates?.map((e) => e.key.prefix),
    }),
  })

  // The one generic→concrete bridge. `RawArgs` is the erasure of
  // `EndpointArgs<PathOf<S>>` and `unknown` the erasure of the inferred
  // response type; TypeScript cannot verify that relation through
  // `Object.assign`, so it is asserted once, here, rather than at each site.
  return endpoint as unknown as Endpoint<S, ResponseOf<V>>
}
