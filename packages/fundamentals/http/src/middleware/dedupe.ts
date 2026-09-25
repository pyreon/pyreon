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
 *
 * ## Two more it closes (2026-09)
 *
 * 3. **Credentials are identity.** Two concurrent requests to the same URL
 *    with DIFFERENT `authorization` / `cookie` headers are two different
 *    users. Under SSR (`forwardHeaders(['cookie'])`, a per-request
 *    `bearer`) sharing one response hands user A's data to user B. The
 *    default key therefore includes both headers — and because credentials
 *    are often attached BELOW this middleware (`use: [dedupe(), bearer()]`),
 *    a joiner that discovers the leader's request gained credentials after
 *    the key was computed does NOT take its response; it issues its own.
 * 4. **One caller's abort is not everyone's abort.** The shared request runs
 *    on its OWN controller. Each caller races its own signal (rejecting only
 *    itself), and the shared request is cancelled only once every caller has
 *    left.
 */

import { AbortError } from '../errors'
import type { HttpMiddleware, HttpRequest, HttpResponse } from '../types'

export interface DedupeOptions {
  /** Methods eligible for sharing. Default `['GET', 'HEAD']`. */
  methods?: readonly string[] | undefined
  /**
   * Custom key. Default: `METHOD url` plus the `authorization` and `cookie`
   * header values. A custom key takes over that responsibility — requests
   * with the same key WILL share a response, whoever sent them.
   */
  key?: ((request: HttpRequest) => string) | undefined
}

function cloneFor(response: HttpResponse, request: HttpRequest): HttpResponse {
  return { ...response, raw: response.raw.clone(), request }
}

/** The credential headers, as one comparable string. */
function credentialsOf(headers: Headers): string {
  const auth = headers.get('authorization')
  const cookie = headers.get('cookie')
  return auth === null && cookie === null ? '' : `${auth ?? ''}\n${cookie ?? ''}`
}

function defaultKey(request: HttpRequest): string {
  const credentials = credentialsOf(request.headers)
  return credentials
    ? `${request.method} ${request.url}\n${credentials}`
    : `${request.method} ${request.url}`
}

interface Shared {
  promise: Promise<HttpResponse>
  controller: AbortController
  /** Callers still waiting on the shared response (not aborted). */
  waiting: number
  /** Credentials on the leader's request when the key was computed. */
  credentialsAtEntry: string
}

/**
 * Wait for the shared response, but let THIS caller leave on its own signal.
 * The shared request is aborted when the last waiting caller leaves.
 */
function awaitShared(
  shared: Shared,
  request: HttpRequest,
  onEmpty: () => void,
): Promise<HttpResponse> {
  shared.waiting++
  const signal = request.signal
  if (!signal) {
    return shared.promise.finally(() => {
      shared.waiting--
    })
  }
  return new Promise<HttpResponse>((resolve, reject) => {
    let done = false
    const leave = (): void => {
      if (done) return
      done = true
      shared.waiting--
      signal.removeEventListener('abort', onAbort)
    }
    const onAbort = (): void => {
      if (done) return
      leave()
      if (shared.waiting === 0) {
        onEmpty()
        shared.controller.abort()
      }
      reject(new AbortError(request))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    shared.promise.then(
      (response) => {
        if (done) return
        leave()
        resolve(response)
      },
      (error: unknown) => {
        if (done) return
        leave()
        reject(error)
      },
    )
  })
}

/** Build the de-duplication middleware. */
export function dedupe(options: DedupeOptions = {}): HttpMiddleware {
  const methods = options.methods ?? ['GET', 'HEAD']
  const customKey = options.key
  const keyOf = customKey ?? defaultKey
  const inFlight = new Map<string, Shared>()
  let warnedOrder = false

  return async function dedupeMiddleware(request, next) {
    if (!methods.includes(request.method)) return next()

    const key = keyOf(request)
    let shared = inFlight.get(key)
    const joined = shared !== undefined

    if (!shared) {
      const controller = new AbortController()
      const entry: Shared = {
        controller,
        waiting: 0,
        credentialsAtEntry: credentialsOf(request.headers),
        // The shared request runs on its OWN signal, so the leader aborting
        // does not cancel the joiners — see `awaitShared`.
        promise: next({ ...request, signal: controller.signal }),
      }
      shared = entry
      inFlight.set(key, entry)
      const release = (): void => {
        if (inFlight.get(key) === entry) inFlight.delete(key)
      }
      // Released on BOTH paths (leak class C).
      entry.promise.then(release, release)
    }

    const entry = shared
    const response = await awaitShared(entry, request, () => {
      if (inFlight.get(key) === entry) inFlight.delete(key)
    })

    if (
      joined &&
      customKey === undefined &&
      credentialsOf(response.request.headers) !== entry.credentialsAtEntry
    ) {
      // Credentials were attached BELOW this middleware, after the key was
      // computed — the leader's response belongs to the leader's user.
      if (process.env.NODE_ENV !== 'production' && !warnedOrder) {
        warnedOrder = true
        console.warn(
          '[Pyreon] http: dedupe() runs before the middleware that attaches credentials ' +
            '(bearer / forwardHeaders), so it cannot tell users apart and is not sharing ' +
            'credentialed requests. Place dedupe() AFTER them in `use: [...]`.',
        )
      }
      return next()
    }

    // Clone for EVERY caller — the shared response's body is single-use and
    // a joiner may still arrive while it is in flight.
    return cloneFor(response, request)
  }
}
