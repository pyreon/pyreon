/**
 * The default transport — WHATWG `fetch`.
 *
 * Its one job beyond calling `fetch` is normalising the rejection channel:
 * `fetch` rejects with a bare `TypeError` for a network failure and a
 * `DOMException{name:'AbortError'}` for cancellation, and those two must not
 * be conflated (see `errors.ts`).
 */

import { AbortError, NetworkError, isAbortError } from './errors'
import type { HttpRequest, HttpResponse, Transport } from './types'

/** Wrap a WHATWG `Response` in the chain's response shape. */
export function toHttpResponse(raw: Response, request: HttpRequest): HttpResponse {
  return {
    raw,
    status: raw.status,
    ok: raw.ok,
    headers: raw.headers,
    request,
  }
}

/**
 * Build a `fetch`-backed transport.
 *
 * `fetchImpl` is injectable so tests, SSR, and a future in-process
 * dispatcher can substitute it — the same `fetchFn: typeof fetch` seam
 * `@pyreon/zero-content`'s search runtime already uses.
 */
/**
 * Internal marks `fetchTransport` leaves on the response it built: the raw
 * `Response` and the signal `fetch` was given. Aborting that signal also errors
 * the body stream (Fetch spec), so a body read needs no separate race against
 * it — see `readUnderSignal`. The mark is checked by IDENTITY against the
 * response's CURRENT `raw`: a middleware that swaps the body (a dedupe
 * `{ ...res, raw: res.raw.clone() }`, a mock, a cache) carries the old marks
 * over with the spread, but they no longer match its `raw`, so it keeps the race.
 */
interface WiredResponse extends HttpResponse {
  _wiredRaw?: Response
  _wiredSignal?: AbortSignal
}

/** @internal The signal a response's body is wired to, when `fetch` produced that body. */
export function bodySignalOf(response: HttpResponse): AbortSignal | undefined {
  const r = response as WiredResponse
  return r._wiredRaw === response.raw ? r._wiredSignal : undefined
}

export function createFetchTransport(fetchImpl?: typeof fetch): Transport {
  return async function fetchTransport(request: HttpRequest): Promise<HttpResponse> {
    const impl = fetchImpl ?? globalThis.fetch
    if (typeof impl !== 'function') {
      throw new NetworkError(
        new Error('no global `fetch` is available in this environment'),
        request,
      )
    }

    const init: RequestInit = {
      method: request.method,
      headers: request.headers,
      body: request.body,
    }
    // Node fetch and Chromium require half-duplex for a streamed request
    // body. The DOM RequestInit type does not expose it on every TS version;
    // the local intersection keeps the portable public request API unchanged.
    if (typeof ReadableStream !== 'undefined' && request.body instanceof ReadableStream) {
      ;(init as RequestInit & { duplex: 'half' }).duplex = 'half'
    }
    if (request.signal) init.signal = request.signal
    if (request.credentials) init.credentials = request.credentials

    try {
      const raw = await impl(request.url, init)
      const res = toHttpResponse(raw, request) as WiredResponse
      if (request.signal) {
        res._wiredRaw = raw
        res._wiredSignal = request.signal
      }
      return res
    } catch (cause) {
      if (isAbortError(cause)) throw new AbortError(request)
      throw new NetworkError(cause, request)
    }
  }
}

/** The shared default transport instance. */
export const fetchTransport: Transport = createFetchTransport()
