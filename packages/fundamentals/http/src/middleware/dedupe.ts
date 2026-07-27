/**
 * In-flight request de-duplication — OPT-IN.
 *
 * `@pyreon/query` already dedupes by query key, so this is for the
 * non-query callers (a loader and a component asking for the same resource
 * in the same tick, an autocomplete firing per keystroke).
 *
 * ## Two traps this closes
 *
 * 1. **A `Response` body is single-use.** Handing the same `Response` to
 *    two callers means the second `.json()` throws "body already read".
 *    Every consumer therefore receives `raw.clone()`.
 * 2. **Leak class C** — a module-level `Map` keyed by URL with no eviction
 *    grows without bound. The entry is deleted in a `finally`, so it is
 *    released on BOTH the success and failure paths, and the map is
 *    per-middleware-instance rather than module-level so disposing the
 *    client releases it.
 */

import type { HttpMiddleware, HttpRequest, HttpResponse } from '../types'

export interface DedupeOptions {
  /** Methods eligible for sharing. Default `['GET', 'HEAD']`. */
  methods?: readonly string[] | undefined
  /** Custom key. Default: `METHOD url`. */
  key?: ((request: HttpRequest) => string) | undefined
}

function cloneFor(response: HttpResponse, request: HttpRequest): HttpResponse {
  return { ...response, raw: response.raw.clone(), request }
}

/** Build the de-duplication middleware. */
export function dedupe(options: DedupeOptions = {}): HttpMiddleware {
  const methods = options.methods ?? ['GET', 'HEAD']
  const keyOf = options.key ?? ((request: HttpRequest): string => `${request.method} ${request.url}`)
  const inFlight = new Map<string, Promise<HttpResponse>>()

  return async function dedupeMiddleware(request, next) {
    if (!methods.includes(request.method)) return next()

    const key = keyOf(request)
    const existing = inFlight.get(key)
    if (existing) return cloneFor(await existing, request)

    const promise = next()
    inFlight.set(key, promise)
    try {
      const response = await promise
      // Clone for THIS caller too — the shared promise may still be handed
      // to a joiner that arrived while the body was in flight.
      return cloneFor(response, request)
    } finally {
      inFlight.delete(key)
    }
  }
}
