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

import { compose } from './chain'
import {
  defineEndpoint,
  type Endpoint,
  type EndpointConfig,
  type EndpointSpec,
  type ResponseOf,
} from './endpoint'
import { AbortError, HttpError, TimeoutError, httpErrorFor, isAbortError } from './errors'
import { createResponsePromise, type HttpResponsePromise, type ParseContext } from './response'
import { resolveAgainstAmbientOrigin } from './request-context'
import { linkSignals } from './signal'
import { fetchTransport } from './transport'
import type {
  HttpClientConfig,
  HttpMethod,
  HttpMiddleware,
  HttpRequest,
  HttpResponse,
  RequestOptions,
  Transport,
  Validator,
} from './types'
import { buildUrl } from './url'

type HeaderSource = HeadersInit | (() => HeadersInit)

/** Config after `extend()` folding — header/middleware sources accumulate. */
interface ResolvedConfig {
  baseUrl: string | undefined
  headerSources: readonly HeaderSource[]
  middleware: readonly HttpMiddleware[]
  transport: Transport
  timeout: number | false
  credentials: RequestCredentials | undefined
  throwHttpErrors: boolean
  meta: Record<string, unknown>
  parse: ParseContext
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
  endpoint<S extends EndpointSpec, V extends Validator<unknown> | undefined = undefined>(
    spec: S,
    options?: EndpointConfig<V>,
  ): Endpoint<S, ResponseOf<V>>
}

const DEFAULT_TIMEOUT = 30_000

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
    parse: {
      validate: config.validate ?? base?.parse.validate ?? 'strict',
      schema: config.schema ?? base?.parse.schema,
    },
  }
}

function applyHeaderSource(target: Headers, source: HeadersInit): void {
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
    target.set(key, (source as Record<string, string>)[key] as string)
  }
}

/** Encode the body and set `Content-Type` when the caller has not. */
function buildBody(options: RequestOptions, headers: Headers): BodyInit | null {
  if (options.json !== undefined) {
    if (options.body !== undefined && options.body !== null) {
      throw new Error(
        '[Pyreon] http: pass either `json` or `body`, not both — `json` serializes for you.',
      )
    }
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    return JSON.stringify(options.json)
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
        buildUrl(resolved.baseUrl, path, options.params, options.query),
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
        if (shouldThrow && !response.ok) throw httpErrorFor(response)
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

    return createResponsePromise(exec, resolved.parse)
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
    endpoint: (spec, endpointOptions) => defineEndpoint(client, spec, endpointOptions),
  }

  return client
}

export { HttpError }
