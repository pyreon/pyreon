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
    if (request.signal) init.signal = request.signal
    if (request.credentials) init.credentials = request.credentials

    try {
      const raw = await impl(request.url, init)
      return toHttpResponse(raw, request)
    } catch (cause) {
      if (isAbortError(cause)) throw new AbortError(request)
      throw new NetworkError(cause, request)
    }
  }
}

/** The shared default transport instance. */
export const fetchTransport: Transport = createFetchTransport()
