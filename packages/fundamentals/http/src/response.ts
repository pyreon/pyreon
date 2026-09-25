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

import {
  type HttpError,
  ParseError,
  ResponseValidationError,
  describeRequest,
  httpErrorFor,
  isAbortError,
} from './errors'
import type {
  ErrorSchemas,
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

/**
 * Ties a request's abort link (caller signal × timeout) to the BODY read.
 *
 * Headers arriving is not the end of a request: `.json()` still has to
 * stream the body, and a slow or hung body is exactly what a timeout and a
 * caller's `abort()` exist for. So the client does not release its link
 * when the headers land if a decoder has CLAIMED the body — the decoder
 * releases it once the read settles, on every path.
 *
 * @internal Wired by `createHttp`; not part of the public API.
 */
export interface BodyLink {
  /** The composed request signal (caller × timeout). */
  readonly signal: AbortSignal | undefined
  /** Called SYNCHRONOUSLY by a decoder, before the response settles. */
  claim(): void
  /** Called once the claimed body read has settled. */
  release(): void
  /** The typed error for an abort observed during the body read. */
  abortError(): Error
}

const noop = (): void => {}

/**
 * Read the body under the request's signal.
 *
 * Racing (rather than only relying on `fetch` to error the stream) matters
 * for every body that is NOT wired to the request signal: a dedupe clone, a
 * mock, a custom transport. The underlying stream is cancelled best-effort
 * so the connection is released.
 */
function readUnderSignal<T>(
  response: HttpResponse,
  read: () => Promise<T>,
  link: BodyLink | undefined,
): Promise<T> {
  const signal = link?.signal
  if (!link || !signal) return read()
  if (signal.aborted) {
    void response.raw.body?.cancel().catch(noop)
    return Promise.reject(link.abortError())
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      void response.raw.body?.cancel().catch(noop)
      reject(link.abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    read().then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        // The stream erroring BECAUSE the signal fired surfaces as a
        // ParseError wrapping a DOM abort — report it as the abort it is.
        reject(signal.aborted ? link.abortError() : error)
      },
    )
  })
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
        `[Pyreon] http: response from ${describeRequest(response.request)} ` +
          `did not match its schema — passing the raw body through because ` +
          `\`validate: 'warn'\` is set. ${cause instanceof Error ? cause.message : String(cause)}`,
      )
      return raw
    }
    throw new ResponseValidationError(cause, raw, response.request)
  }
}

/**
 * Read a clone's text under the request signal. Same reasoning as
 * `readUnderSignal`: a mock / custom transport's body is not wired to the
 * request signal, so without the race a hung error body outlives the
 * caller's `abort()` and the `timeout`. Rejects with a DOM-shaped
 * `AbortError`, which the client re-labels as `AbortError`/`TimeoutError`.
 */
function readCloneUnderSignal(response: HttpResponse, signal: AbortSignal | undefined): Promise<string> {
  const clone = response.raw.clone()
  if (!signal) return clone.text()
  const aborted = (): Error => Object.assign(new Error('The error-body read was aborted.'), { name: 'AbortError' })
  if (signal.aborted) {
    void clone.body?.cancel().catch(noop)
    return Promise.reject(aborted())
  }
  return new Promise<string>((resolve, reject) => {
    const onAbort = (): void => {
      void clone.body?.cancel().catch(noop)
      reject(aborted())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    clone.text().then(
      (text) => {
        signal.removeEventListener('abort', onAbort)
        resolve(text)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(signal.aborted ? aborted() : error)
      },
    )
  })
}

/**
 * Read an error response's body without consuming it: parsed JSON when it
 * parses, the text otherwise, `undefined` when empty or unreadable (a body
 * cut off by the request's own timeout included). Reads a CLONE, so the
 * caller can still read `error.response.raw`.
 */
async function readErrorBody(
  response: HttpResponse,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  if (isBodyless(response.status)) return undefined
  let text: string
  try {
    text = await readCloneUnderSignal(response, signal)
  } catch (cause) {
    // An abort / timeout during the read is NOT "unreadable": it is the
    // request being cancelled, and the client reports it as such.
    if (isAbortError(cause)) throw cause
    return undefined
  }
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

/**
 * The declared error schema for a status: the exact code, then its range
 * (`4XX`, either case), then `default`. `undefined` when none applies.
 */
export function errorSchemaFor(
  errors: ErrorSchemas,
  status: number,
): [key: string, validator: Validator<unknown>] | undefined {
  const exact = String(status)
  const range = `${exact.charAt(0)}XX`
  for (const key of [exact, range, range.toLowerCase(), 'default']) {
    const v = errors[key]
    if (v !== undefined) return [key, v]
  }
  return undefined
}

/**
 * The {@link HttpError} a non-2xx response throws, with its body decoded and,
 * when the request declared `errors`, validated against the matching schema.
 *
 * A body that fails its schema is NOT turned into a `ResponseValidationError`:
 * the caller's question is "what did the server say went wrong", and replacing
 * the HTTP failure with a schema failure would hide it. It stays an
 * `HttpError` with `matched: undefined` and the raw body -- and `'warn'` logs.
 */
export async function buildHttpError(
  response: HttpResponse,
  errors: ErrorSchemas | undefined,
  ctx: ParseContext,
  signal?: AbortSignal | undefined,
): Promise<HttpError> {
  const body = await readErrorBody(response, signal)
  const match = errors ? errorSchemaFor(errors, response.status) : undefined
  if (match === undefined) return httpErrorFor(response, body)
  const [key, validator] = match
  if (ctx.validate === 'off') return httpErrorFor(response, body, key)
  const parse = resolveValidator(validator, ctx)
  try {
    return httpErrorFor(response, parse(body), key)
  } catch (cause) {
    if (ctx.validate === 'warn') {
      // Same reasoning as `applyValidator`: 'warn' exists for production.
      // pyreon-lint-disable-next-line pyreon/dev-guard-warnings
      console.warn(
        `[Pyreon] http: the ${response.status} body from ${describeRequest(response.request)} ` +
          `did not match its declared \`${key}\` error schema — \`matched\` is undefined. ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }
    return httpErrorFor(response, body)
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
  private readonly _link: BodyLink | undefined

  constructor(exec: Promise<HttpResponse>, ctx: ParseContext, link?: BodyLink) {
    this._exec = exec
    this._ctx = ctx
    this._link = link
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

  /**
   * Claim the body SYNCHRONOUSLY (so the client keeps its abort link alive
   * past the headers), then read it under the request signal and release.
   */
  private _read<T>(read: (response: HttpResponse) => Promise<T>): Promise<T> {
    const link = this._link
    link?.claim()
    return (async () => {
      try {
        const response = await this._exec
        return await readUnderSignal(response, () => read(response), link)
      } finally {
        link?.release()
      }
    })()
  }

  json<T = unknown>(validator?: Validator<unknown>): Promise<T> {
    return this._read(async (response) => {
      const raw = await readJson(response)
      return applyValidator(raw, validator, this._ctx, response) as T
    })
  }

  text(): Promise<string> {
    return this._read((response) => readBody<string>(response, 'text'))
  }

  blob(): Promise<Blob> {
    return this._read((response) => readBody<Blob>(response, 'blob'))
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    return this._read((response) => readBody<ArrayBuffer>(response, 'arrayBuffer'))
  }

  formData(): Promise<FormData> {
    return this._read((response) => readBody<FormData>(response, 'formData'))
  }

  void(): Promise<void> {
    return this._read(async (response) => {
      // Drain the body so the connection can be reused.
      if (!isBodyless(response.status)) await response.raw.text().catch(() => undefined)
    })
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
  link?: BodyLink,
): HttpResponsePromise {
  return new ResponsePromise(exec, ctx, link)
}

export type { StandardSchemaShape }
