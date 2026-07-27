/**
 * Authorization middleware.
 *
 * `bearer` is the trivial case. `refresh` is the one that justifies the
 * onion shape: it must SEE the 401, refresh, and RE-ISSUE the original
 * request — three steps an interceptor pair structurally cannot express,
 * because a response interceptor has no way back into the chain.
 */

import type { HttpMiddleware } from '../types'

/**
 * Attach `Authorization: Bearer <token>`.
 *
 * `token` is called per request, so a signal read inside it stays current:
 * `bearer(() => session().token)`. Return a nullish value to send no header
 * (an anonymous request), rather than an empty `Bearer `.
 *
 * If you call the client from inside a TRACKED scope, wrap the body in
 * `untrack` — a request is imperative and must not subscribe the
 * surrounding effect to your token signal.
 */
export function bearer(token: () => string | null | undefined): HttpMiddleware {
  return async function bearerMiddleware(request, next) {
    const value = token()
    if (value) request.headers.set('authorization', `Bearer ${value}`)
    return next()
  }
}

export interface RefreshOptions {
  /** Performs the refresh. Resolve `false` to give up (e.g. logged out). */
  refresh: () => Promise<boolean | void>
  /** Statuses that trigger a refresh. Default `[401]`. */
  statuses?: readonly number[] | undefined
  /** Maximum consecutive refresh attempts per request. Default 1. */
  limit?: number | undefined
}

/**
 * Refresh-and-retry on 401.
 *
 * Concurrent 401s SHARE one refresh call — the classic bug here is a
 * stampede where ten parallel requests each trigger their own refresh and
 * nine of them invalidate the token the tenth just stored. The in-flight
 * promise is cleared in `finally` so a failed refresh does not wedge every
 * later request against a permanently-rejected promise.
 */
export function refresh(options: RefreshOptions): HttpMiddleware {
  const statuses = options.statuses ?? [401]
  const limit = options.limit ?? 1
  let inFlight: Promise<boolean | void> | null = null

  const runRefresh = (): Promise<boolean | void> => {
    inFlight ??= (async () => {
      try {
        return await options.refresh()
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  return async function refreshMiddleware(request, next) {
    let attempts = 0
    let response = await next()

    while (statuses.includes(response.status) && attempts < limit) {
      attempts += 1
      const ok = await runRefresh()
      if (ok === false) return response
      if (request.signal?.aborted) return response
      response = await next()
    }

    return response
  }
}
