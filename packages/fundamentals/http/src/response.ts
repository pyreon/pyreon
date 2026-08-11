/**
 * The `HttpResponsePromise` — a promise you can either await for the
 * response, or ask for a decoded body directly.
 *
 * ```ts
 * const res  = await api.get('users/1')                  // HttpResponse
 * const user = await api.get('users/1').json(UserSchema) // decoded + validated
 * ```
 *
 * The request fires EAGERLY (like `ky`), so `.json()` never re-issues it
 * and two consumers of the same promise share one network call.
 */

import { ParseError, ResponseValidationError } from './errors'
import type {
  HttpResponse,
  ParseFn,
  SchemaResolver,
  StandardSchemaShape,
  ValidateMode,
  Validator,
  ValidatorOutput,
} from './types'

/** Context the parsers need from the owning client. */
export interface ParseContext {
  validate: ValidateMode
  schema: SchemaResolver | undefined
}

/** A promise for the response, with body decoders attached. */
export interface HttpResponsePromise extends Promise<HttpResponse> {
  /** Decode as JSON. With no argument the type is an unchecked cast. */
  json<T = unknown>(): Promise<T>
  /** Decode as JSON and validate with a parse function or Standard Schema. */
  json<V extends Validator<unknown>>(validator: V): Promise<ValidatorOutput<V>>
  text(): Promise<string>
  blob(): Promise<Blob>
  arrayBuffer(): Promise<ArrayBuffer>
  formData(): Promise<FormData>
  /** Discard the body — for `204 No Content` style endpoints. */
  void(): Promise<void>
}

/** Statuses that are defined to carry no body. */
function isBodyless(status: number): boolean {
  return status === 204 || status === 205 || status === 304
}

/**
 * Pick the parse function for a validator.
 *
 * ORDER IS LOAD-BEARING: the schema resolver runs BEFORE the
 * `typeof === 'function'` fallback, because **an ArkType schema IS a
 * function** (`type({...})` is callable) that happens to carry
 * `~standard`. Checking `typeof === 'function'` first claims it as a
 * Tier-1 parse function and calls it directly — and since ArkType RETURNS
 * its errors rather than throwing, the caller then receives an `ArkErrors`
 * array *as though it were valid data*. Silent, and type-safe-looking.
 *
 * This is the same trap `@pyreon/form`'s `resolveSchemaValidator`
 * documents (`isStandardSchema` before the bare-function fallback) and
 * that `isStandardSchema` itself was fixed for. A plain function without
 * `~standard` still falls through to Tier 1, because the resolver returns
 * `null` for it.
 */
function resolveValidator(
  validator: Validator<unknown>,
  ctx: ParseContext,
): ParseFn<unknown> {
  const resolved = ctx.schema?.(validator)
  if (resolved) return resolved

  if (typeof validator === 'function') return validator as ParseFn<unknown>

  throw new Error(
    '[Pyreon] http: a schema object was passed to `.json()` but no schema resolver is configured. ' +
      "Either pass a plain parse function (e.g. `.json(MySchema.parse)`), or enable Tier-2 support:\n" +
      "  import { standardSchema } from '@pyreon/http/schema'\n" +
      '  const api = createHttp({ schema: standardSchema })',
  )
}

/** Run a validator honouring the client's {@link ValidateMode}. */
export function applyValidator(
  raw: unknown,
  validator: Validator<unknown> | undefined,
  ctx: ParseContext,
  response: HttpResponse,
): unknown {
  if (!validator || ctx.validate === 'off') return raw

  const parse = resolveValidator(validator, ctx)
  try {
    return parse(raw)
  } catch (cause) {
    if (ctx.validate === 'warn') {
      // NOT dev-guarded, deliberately. `validate: 'warn'` is an explicit
      // opt-in whose entire purpose is to keep a drifting backend visible
      // in PRODUCTION while degrading instead of white-screening. Wrapping
      // it in a dev gate would tree-shake the mode into a silent no-op in
      // exactly the environment it exists for — the same reasoning behind
      // the adapters' missing-env warnings, which also fire regardless of
      // NODE_ENV because they report a real misconfiguration.
      // pyreon-lint-disable-next-line pyreon/dev-guard-warnings
      console.warn(
        `[Pyreon] http: response from ${response.request.method} ${response.request.url} ` +
          `did not match its schema — passing the raw body through because ` +
          `\`validate: 'warn'\` is set. ${cause instanceof Error ? cause.message : String(cause)}`,
      )
      return raw
    }
    throw new ResponseValidationError(cause, raw, response.request)
  }
}

async function readJson(response: HttpResponse): Promise<unknown> {
  if (isBodyless(response.status)) return undefined
  // Read as text first: an empty 200 body makes `res.json()` throw, and a
  // proxy returning an HTML error page should produce a ParseError naming
  // the URL rather than a bare `Unexpected token <`.
  let text: string
  try {
    text = await response.raw.text()
  } catch (cause) {
    throw new ParseError('text', cause, response.request)
  }
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new ParseError('JSON', cause, response.request)
  }
}

async function readBody<T>(
  response: HttpResponse,
  as: 'text' | 'blob' | 'arrayBuffer' | 'formData',
): Promise<T> {
  try {
    return (await response.raw[as]()) as T
  } catch (cause) {
    throw new ParseError(as, cause, response.request)
  }
}

/**
 * The response-promise wrapper — a THENABLE class, not `Object.assign`
 * onto the promise.
 *
 * The original shape (`Object.assign(exec, { json, text, … })`) mutated a
 * LIVE native promise's shape, which is a measured ~260ns/request penalty
 * under JSC (the object leaves its fast shape; six fresh closures are the
 * cheap part). A class instance with the decoders on the PROTOTYPE and
 * `then`/`catch`/`finally` delegating to the inner promise costs ~2 field
 * writes per request instead, and preserves every behaviour the old
 * comment cared about: `await p`, `p.then(...)` chaining, `Promise.all`,
 * and rejection routing all work identically because the platform awaits
 * any thenable. The one observable difference: `p instanceof Promise` is
 * now `false` — never part of the documented contract (the contract is
 * the {@link HttpResponsePromise} interface), and `.then()` still returns
 * a REAL native promise.
 */
class ResponsePromise implements HttpResponsePromise {
  declare readonly [Symbol.toStringTag]: string
  private readonly _exec: Promise<HttpResponse>
  private readonly _ctx: ParseContext

  constructor(exec: Promise<HttpResponse>, ctx: ParseContext) {
    this._exec = exec
    this._ctx = ctx
  }

  // Deliberately thenable: this class IS the promise-like the public contract
  // exposes (the rule exists to catch ACCIDENTAL thenables; `await` /
  // `Promise.all` routing to `_exec` is the point).
  // oxlint-disable-next-line unicorn/no-thenable
  then<TResult1 = HttpResponse, TResult2 = never>(
    onfulfilled?: ((value: HttpResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this._exec.then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<HttpResponse | TResult> {
    return this._exec.catch(onrejected)
  }

  finally(onfinally?: (() => void) | null): Promise<HttpResponse> {
    return this._exec.finally(onfinally)
  }

  async json<T = unknown>(validator?: Validator<unknown>): Promise<T> {
    const response = await this._exec
    const raw = await readJson(response)
    return applyValidator(raw, validator, this._ctx, response) as T
  }

  async text(): Promise<string> {
    return readBody<string>(await this._exec, 'text')
  }

  async blob(): Promise<Blob> {
    return readBody<Blob>(await this._exec, 'blob')
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return readBody<ArrayBuffer>(await this._exec, 'arrayBuffer')
  }

  async formData(): Promise<FormData> {
    return readBody<FormData>(await this._exec, 'formData')
  }

  async void(): Promise<void> {
    const response = await this._exec
    // Drain the body so the connection can be reused.
    if (!isBodyless(response.status)) await response.raw.text().catch(() => undefined)
  }
}

Object.defineProperty(ResponsePromise.prototype, Symbol.toStringTag, {
  value: 'HttpResponsePromise',
  configurable: true,
})

/** Attach the decoder methods to an in-flight response promise. */
export function createResponsePromise(
  exec: Promise<HttpResponse>,
  ctx: ParseContext,
): HttpResponsePromise {
  return new ResponsePromise(exec, ctx)
}

export type { StandardSchemaShape }
