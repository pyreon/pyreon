/**
 * `createHttp` — the client factory.
 *
 * ## Immutable by design
 *
 * There is deliberately NO `client.defaults.headers.common.X = …`. Mutable
 * shared defaults are axios's worst property under SSR: one request
 * mutating the module-level default leaks into every concurrent request in
 * the same process. `extend()` returns a NEW client instead, which is the
 * same discipline `pyreon/prefer-request-context` enforces elsewhere.
 */

import { encodeCookies, encodeForm, encodeMultipart } from './body'
import { compose } from './chain'
import {
  defineEndpoint,
  type BodyOf,
  type Endpoint,
  type EndpointConfig,
  type EndpointInput,
  type EndpointSpec,
  type ResponseKind,
} from './endpoint'
import { AbortError, HttpError, TimeoutError, isAbortError } from './errors'
import { buildHttpError, createResponsePromise, type HttpResponsePromise, type ParseContext } from './response'
import { resolveAgainstAmbientOrigin } from './request-context'
import { linkSignals } from './signal'
import { fetchTransport } from './transport'
import type {
  ErrorSchemas,
  HeaderValues,
  HttpClientConfig,
  HttpMethod,
  HttpMiddleware,
  HttpRequest,
  HttpResponse,
  RequestOptions,
  Transport,
  ValidateMode,
  Validator,
} from './types'
import { buildUrl } from './url'

type HeaderSource = HeadersInit | (() => HeadersInit)

/** Config after `extend()` folding — header/middleware sources accumulate. */
interface ResolvedConfig {
  baseUrl: string | (() => string | undefined) | undefined
  headerSources: readonly HeaderSource[]
  middleware: readonly HttpMiddleware[]
  transport: Transport
  timeout: number | false
  credentials: RequestCredentials | undefined
  throwHttpErrors: boolean
  meta: Record<string, unknown>
  parse: ParseContext
  /** Set when `validate` is an accessor — read per request instead of once. */
  validateSource: (() => ValidateMode) | undefined
  keyScope: string | undefined
}

/** A configured HTTP client. Immutable — use {@link HttpClient.extend}. */
export interface HttpClient {
  get(path: string, options?: RequestOptions): HttpResponsePromise
  post(path: string, options?: RequestOptions): HttpResponsePromise
  put(path: string, options?: RequestOptions): HttpResponsePromise
  patch(path: string, options?: RequestOptions): HttpResponsePromise
  delete(path: string, options?: RequestOptions): HttpResponsePromise
  head(path: string, options?: RequestOptions): HttpResponsePromise
  options(path: string, options?: RequestOptions): HttpResponsePromise
  request(method: HttpMethod, path: string, options?: RequestOptions): HttpResponsePromise
  /** Derive a new client. Headers and middleware ACCUMULATE; scalars override. */
  extend(config: HttpClientConfig): HttpClient
  /** Declare a reusable endpoint — see {@link defineEndpoint}. */
  endpoint<
    S extends EndpointSpec,
    V extends Validator<unknown> | undefined = undefined,
    I extends EndpointInput<PathOfSpec<S>> = EndpointInput<PathOfSpec<S>>,
    K extends ResponseKind = 'json',
    E extends ErrorSchemas | undefined = undefined,
  >(
    spec: S,
    options?: EndpointConfig<V, K, E>,
  ): Endpoint<S, BodyOf<K, V>, I, E>
}

const DEFAULT_TIMEOUT = 30_000

type PathOfSpec<S extends string> = S extends `${string} ${infer P}` ? P : never

function toResolved(config: HttpClientConfig, base?: ResolvedConfig): ResolvedConfig {
  const headerSources = [...(base?.headerSources ?? [])]
  if (config.headers) headerSources.push(config.headers)

  return {
    baseUrl: config.baseUrl ?? base?.baseUrl,
    headerSources,
    middleware: [...(base?.middleware ?? []), ...(config.use ?? [])],
    transport: config.transport ?? base?.transport ?? fetchTransport,
    timeout: config.timeout ?? base?.timeout ?? DEFAULT_TIMEOUT,
    credentials: config.credentials ?? base?.credentials ?? 'same-origin',
    throwHttpErrors: config.throwHttpErrors ?? base?.throwHttpErrors ?? true,
    meta: { ...base?.meta, ...config.meta },
    keyScope: config.keyScope ?? base?.keyScope,
    parse: {
      validate:
        typeof config.validate === 'string' ? config.validate : (base?.parse.validate ?? 'strict'),
      schema: config.schema ?? base?.parse.schema,
    },
    validateSource:
      typeof config.validate === 'function'
        ? config.validate
        : config.validate === undefined
          ? base?.validateSource
          : undefined,
  }
}

function applyHeaderSource(target: Headers, source: HeadersInit | HeaderValues): void {
  if (source instanceof Headers) {
    source.forEach((value, key) => {
      target.set(key, value)
    })
    return
  }
  if (Array.isArray(source)) {
    // Keep the Headers-constructor round-trip for the pair-array form: the
    // constructor COMBINES duplicate keys (append semantics), which a naive
    // per-pair `set` loop would collapse to last-wins.
    new Headers(source).forEach((value, key) => {
      target.set(key, value)
    })
    return
  }
  // Plain-record fast path — the dominant shape. `Headers.set` performs the
  // same name/value validation + normalization the constructor would, so
  // this skips only the intermediate `Headers` allocation, not any check.
  for (const key of Object.keys(source)) {
    const value = (source as HeaderValues)[key]
    // An optional header left `undefined` is OMITTED. `Headers.set` would
    // otherwise stringify it and send the literal text "undefined".
    if (value === undefined || value === null) continue
    target.set(key, typeof value === 'string' ? value : String(value))
  }
}

/** Encode the body and set `Content-Type` when the caller has not. */
function buildBody(options: RequestOptions, headers: Headers): BodyInit | null {
  const given = [
    options.json !== undefined && 'json',
    options.form !== undefined && 'form',
    options.multipart !== undefined && 'multipart',
    options.body !== undefined && options.body !== null && 'body',
  ].filter((k): k is string => k !== false)
  if (given.length > 1) {
    throw new Error(
      `[Pyreon] http: pass ONE of \`json\`, \`form\`, \`multipart\` or \`body\` — got ${given.map((k) => `\`${k}\``).join(' and ')}. Each is a different encoding of the same body.`,
    )
  }
  if (options.cookies) {
    const cookie = encodeCookies(options.cookies)
    if (cookie) headers.set('cookie', headers.has('cookie') ? `${headers.get('cookie')}; ${cookie}` : cookie)
  }
  if (options.json !== undefined) {
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    return JSON.stringify(options.json)
  }
  if (options.form !== undefined) {
    if (!headers.has('content-type')) headers.set('content-type', 'application/x-www-form-urlencoded')
    return encodeForm(options.form, options.formEncoding).toString()
  }
  if (options.multipart !== undefined) {
    // No Content-Type: the platform writes it WITH the boundary it chose. A
    // caller-set `multipart/form-data` without a boundary breaks the body.
    return encodeMultipart(options.multipart)
  }
  return options.body ?? null
}

/** Create an HTTP client. Every option has a working default. */
export function createHttp(config: HttpClientConfig = {}): HttpClient {
  return fromResolved(toResolved(config))
}

function fromResolved(resolved: ResolvedConfig): HttpClient {
  const dispatch = compose(resolved.middleware, resolved.transport)

  // Fold the leading run of STATIC header sources ONCE — per request they
  // collapse to a single native `new Headers(folded)` clone (measured
  // ~360ns/request saved vs re-merging per call). Sources from the first
  // FUNCTION source onward stay dynamic so application order (later sources
  // override earlier keys) is preserved exactly. The fold is LAZY (first
  // request, memoized) so `createHttp`/`extend` stay allocation-lean for
  // clients that are configured but never used on a code path.
  //
  // OBSERVABLE CONSEQUENCE, and it is the intended one: a caller who passes a
  // MUTABLE record and mutates it later sees the value captured at the first
  // request, not the current one. That is this module's immutability rule
  // (see the file docblock) applied to header sources, and a function source
  // is the documented seam for a value that changes per request — it is
  // re-read every time. Because the fold is lazy, the capture point is the
  // FIRST REQUEST rather than `createHttp`; a mutation before any request has
  // gone out is still picked up. Do not "improve" that into an eager fold at
  // construction without reading `header-source-semantics.test.ts`, which
  // pins all three behaviours.
  interface FoldedState {
    base: Headers
    dynamic: readonly HeaderSource[]
    metaIsEmpty: boolean
  }
  let foldedState: FoldedState | null = null
  const fold = (): FoldedState => {
    let staticPrefix = 0
    while (
      staticPrefix < resolved.headerSources.length &&
      typeof resolved.headerSources[staticPrefix] !== 'function'
    ) {
      staticPrefix++
    }
    const base = new Headers()
    for (let i = 0; i < staticPrefix; i++) {
      applyHeaderSource(base, resolved.headerSources[i] as HeadersInit)
    }
    foldedState = {
      base,
      dynamic: resolved.headerSources.slice(staticPrefix),
      metaIsEmpty: Object.keys(resolved.meta).length === 0,
    }
    return foldedState
  }

  const request = (
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): HttpResponsePromise => {
    const folded = foldedState ?? fold()
    // An accessor `validate` is read per request (so a runtime switch between
    // 'strict' and 'warn' applies to the next call); the static form keeps
    // sharing the one context object. Resolved BEFORE dispatch because a
    // thrown HttpError validates its body against `errors` under it too.
    const parse = resolved.validateSource
      ? { validate: resolved.validateSource(), schema: resolved.parse.schema }
      : resolved.parse
    const exec = (async (): Promise<HttpResponse> => {
      const headers = new Headers(folded.base)
      for (const source of folded.dynamic) {
        applyHeaderSource(headers, typeof source === 'function' ? source() : source)
      }
      if (options.headers) applyHeaderSource(headers, options.headers)
      const body = buildBody(options, headers)
      // On the server a root-relative URL has no origin and `fetch`
      // rejects; resolve it against the inbound request when one is in
      // scope. A no-op in the browser, where the document supplies it.
      const url = resolveAgainstAmbientOrigin(
        buildUrl(
          typeof resolved.baseUrl === 'function' ? resolved.baseUrl() : resolved.baseUrl,
          path,
          options.params,
          options.query,
          options.queryStyle,
        ),
      )

      const link = linkSignals(options.signal, options.timeout ?? resolved.timeout)
      const httpRequest: HttpRequest = {
        method,
        url,
        headers,
        body,
        signal: link.signal,
        credentials: options.credentials ?? resolved.credentials,
        // Middleware may mutate `meta`, so every request gets a FRESH object —
        // but the dominant no-meta case gets a bare literal, not two spreads.
        meta: options.meta
          ? { ...resolved.meta, ...options.meta }
          : folded.metaIsEmpty
            ? {}
            : { ...resolved.meta },
      }

      try {
        // Never dispatch an already-cancelled request. `fetch` rejects
        // immediately on a pre-aborted signal, and a client that instead
        // performs the call would issue real traffic for work the caller
        // has already abandoned — the exact shape a rapidly-retyped
        // autocomplete produces.
        if (link.signal?.aborted) throw new AbortError(httpRequest)

        const response = await dispatch(httpRequest)
        const shouldThrow = options.throwHttpErrors ?? resolved.throwHttpErrors
        if (shouldThrow && !response.ok) throw await buildHttpError(response, options.errors, parse)
        return response
      } catch (cause) {
        // A timeout surfaces from the transport as an abort — re-label it,
        // because "timed out after 30000ms" and "the user navigated away"
        // demand opposite handling (retry vs. stay silent).
        if (link.timedOut() && isAbortError(cause)) {
          throw new TimeoutError(
            typeof (options.timeout ?? resolved.timeout) === 'number'
              ? (options.timeout ?? resolved.timeout) as number
              : 0,
            httpRequest,
          )
        }
        if (isAbortError(cause) && !(cause instanceof AbortError)) {
          throw new AbortError(httpRequest)
        }
        throw cause
      } finally {
        // Leak class I: the timeout timer AND the caller-signal listener
        // are released on every path, success included.
        link.cleanup()
      }
    })()

    return createResponsePromise(exec, parse)
  }

  const client: HttpClient = {
    get: (path, options) => request('GET', path, options),
    post: (path, options) => request('POST', path, options),
    put: (path, options) => request('PUT', path, options),
    patch: (path, options) => request('PATCH', path, options),
    delete: (path, options) => request('DELETE', path, options),
    head: (path, options) => request('HEAD', path, options),
    options: (path, options) => request('OPTIONS', path, options),
    request,
    extend: (next) => fromResolved(toResolved(next, resolved)),
    // The client's `keyScope` is the endpoint's DEFAULT; an endpoint may set
    // its own. Copied only when there is something to copy, so the dominant
    // unscoped client passes the caller's options object through untouched.
    endpoint: (spec, endpointOptions) =>
      defineEndpoint(
        client,
        spec,
        resolved.keyScope !== undefined && endpointOptions?.keyScope === undefined
          ? { ...endpointOptions, keyScope: resolved.keyScope }
          : endpointOptions,
      ),
  }

  return client
}

export { HttpError }
