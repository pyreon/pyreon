/**
 * `@pyreon/http/mock` — testing without touching the network.
 *
 * Because middleware can SHORT-CIRCUIT (return without calling `next`),
 * mocking needs no MSW, no service worker, and no `globalThis.fetch`
 * monkey-patch — which also means it cannot leak between test files the way
 * a patched global does.
 *
 * ```ts
 * const api = createHttp({ use: [mock([
 *   { path: '/users/1', json: { id: '1', name: 'Ada' } },
 *   { method: 'POST', path: '/users', status: 201, json: { id: '2' } },
 * ])] })
 * ```
 */

import type { HttpMethod, HttpMiddleware, HttpRequest } from './types'
import { toHttpResponse } from './transport'

/** One stubbed exchange. */
export interface MockRoute {
  /** Defaults to `GET`. */
  method?: HttpMethod | undefined
  /**
   * Matched against the request URL. A string matches when the URL's
   * path+query ENDS WITH it (so `baseUrl` need not be repeated); a RegExp
   * is tested against the whole URL.
   */
  path: string | RegExp
  /** Defaults to 200, or 204 when there is no body. */
  status?: number | undefined
  headers?: Record<string, string> | undefined
  /** Serialized as JSON with `Content-Type: application/json`. */
  json?: unknown
  /** Raw body — mutually exclusive with `json`. */
  body?: string | undefined
  /** Simulated latency, in ms. */
  delay?: number | undefined
  /** Reject with this instead of responding. */
  error?: unknown
}

/** A recorded request, for assertions. */
export interface MockCall {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body: BodyInit | null
}

/** The middleware plus its recorded calls. */
export interface MockHandle {
  middleware: HttpMiddleware
  /** Every request that reached the mock, in order. */
  calls: MockCall[]
  reset(): void
}

function matches(route: MockRoute, request: HttpRequest): boolean {
  const method = route.method ?? 'GET'
  if (method !== request.method) return false
  if (route.path instanceof RegExp) return route.path.test(request.url)
  return request.url.endsWith(route.path)
}

/**
 * Abort-aware delay.
 *
 * A mock whose latency ignores the signal is a mock that cannot reproduce
 * a timeout or a cancellation — the two behaviours most worth testing. So
 * the wait rejects the way a real transport does (a `DOMException` named
 * `AbortError`), and releases both the timer and the listener on every
 * path (leak classes I and D).
 */
function delayOrAbort(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const fail = (): void =>
      reject(
        typeof DOMException === 'function'
          ? new DOMException('The operation was aborted.', 'AbortError')
          : Object.assign(new Error('aborted'), { name: 'AbortError' }),
      )
    if (signal?.aborted) {
      fail()
      return
    }
    let onAbort: (() => void) | undefined
    const timer = setTimeout(() => {
      if (onAbort && signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    if (signal) {
      onAbort = () => {
        clearTimeout(timer)
        fail()
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

function record(request: HttpRequest): MockCall {
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })
  return { method: request.method, url: request.url, headers, body: request.body }
}

/**
 * Build a mock middleware.
 *
 * A request matching no route falls through to `next()`, so you can stub a
 * couple of endpoints and let the rest hit a real (or a second, stricter)
 * transport.
 */
export function createMock(routes: readonly MockRoute[]): MockHandle {
  const calls: MockCall[] = []

  const middleware: HttpMiddleware = async (request, next) => {
    const route = routes.find((candidate) => matches(candidate, request))
    if (!route) return next()

    calls.push(record(request))

    if (route.delay) await delayOrAbort(route.delay, request.signal)
    if (route.error) throw route.error

    const headers = new Headers(route.headers)
    let body: string | null = null
    if (route.json !== undefined) {
      body = JSON.stringify(route.json)
      if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    } else if (route.body !== undefined) {
      body = route.body
    }

    const status = route.status ?? (body === null ? 204 : 200)
    // 204/205/304 must be constructed with a null body or `Response` throws.
    const raw = new Response(status === 204 || status === 205 || status === 304 ? null : body, {
      status,
      headers,
    })
    return toHttpResponse(raw, request)
  }

  return {
    middleware,
    calls,
    reset: () => {
      calls.length = 0
    },
  }
}

/** Shorthand when you do not need the recorded calls. */
export function mock(routes: readonly MockRoute[]): HttpMiddleware {
  return createMock(routes).middleware
}
