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
 * Attach the decoder methods to an in-flight response promise.
 *
 * `Object.assign` onto the promise (rather than a Promise subclass) keeps
 * `.then` chaining, `await`, and `Promise.all` behaving exactly like a
 * native promise.
 */
export function createResponsePromise(
  exec: Promise<HttpResponse>,
  ctx: ParseContext,
): HttpResponsePromise {
  const json = async (validator?: Validator<unknown>): Promise<unknown> => {
    const response = await exec
    const raw = await readJson(response)
    return applyValidator(raw, validator, ctx, response)
  }

  return Object.assign(exec, {
    json,
    text: async (): Promise<string> => readBody<string>(await exec, 'text'),
    blob: async (): Promise<Blob> => readBody<Blob>(await exec, 'blob'),
    arrayBuffer: async (): Promise<ArrayBuffer> =>
      readBody<ArrayBuffer>(await exec, 'arrayBuffer'),
    formData: async (): Promise<FormData> => readBody<FormData>(await exec, 'formData'),
    void: async (): Promise<void> => {
      const response = await exec
      // Drain the body so the connection can be reused.
      if (!isBodyless(response.status)) await response.raw.text().catch(() => undefined)
    },
  }) as HttpResponsePromise
}

export type { StandardSchemaShape }
