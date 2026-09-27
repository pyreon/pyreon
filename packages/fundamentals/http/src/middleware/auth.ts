/**
 * Authorization middleware.
 *
 * `bearer` is the trivial case. `refresh` is the one that justifies the
 * onion shape: it must SEE the 401, refresh, and RE-ISSUE the original
 * request — three steps an interceptor pair structurally cannot express,
 * because a response interceptor has no way back into the chain.
 */

import { resolveAgainstAmbientOrigin } from '../request-context'
import type { HttpMiddleware, HttpRequest } from '../types'
import { isAbsoluteUrl } from '../url'
import { discardBody, isReplayable } from './body'

type TokenSource = () => string | null | undefined

/**
 * The token source `bearer` used for a request, keyed by the request's
 * `Headers` object (which every middleware mutates in place, so it survives
 * a `next({ ...request })` spread). `refresh` reads it to put the NEW token
 * on the re-issued request when `bearer` sits ABOVE it in the chain — a
 * re-issue only replays what is below the refresh middleware.
 *
 * A `WeakMap` keyed by a per-request object: the entry dies with the
 * request, so there is nothing to evict (leak class C does not apply).
 */
const tokenSources = new WeakMap<Headers, TokenSource>()

const PLACEHOLDER_ORIGIN = 'http://pyreon.invalid'

function currentOrigin(): string {
  const location = (globalThis as { location?: { origin?: unknown } }).location
  return typeof location?.origin === 'string' && location.origin !== 'null'
    ? location.origin
    : PLACEHOLDER_ORIGIN
}

/**
 * True when the request targets the client's `baseUrl` origin.
 *
 * A path that is itself an absolute URL IGNORES `baseUrl` (that is the
 * documented routing rule), so `api.get(userSuppliedUrl)` can leave the
 * API's origin — and without this check it would take the user's bearer
 * token with it. With no `baseUrl` there is no boundary to enforce.
 */
function targetsBaseOrigin(request: HttpRequest): boolean {
  const base = request.baseUrl
  if (!base) return true
  // Fast path: the URL was joined under the base, so it starts with it.
  const trimmed = base.endsWith('/') ? base.slice(0, -1) : base
  if (request.url === trimmed || request.url.startsWith(`${trimmed}/`)) return true
  // A root-relative URL on a root-relative base is same-origin by definition.
  if (!isAbsoluteUrl(request.url) && !isAbsoluteUrl(base) && !request.url.startsWith('//')) {
    return true
  }
  const origin = currentOrigin()
  try {
    return (
      new URL(request.url, origin).origin ===
      new URL(resolveAgainstAmbientOrigin(base), origin).origin
    )
  } catch {
    return false
  }
}

export interface BearerOptions {
  /**
   * Attach the token even when the request leaves the `baseUrl` origin
   * (a path that is an absolute URL on another host).
   *
   * Default `false`: the token stays on the API it was issued for. Set
   * `true` only when every origin you call is yours.
   */
  crossOrigin?: boolean | undefined
}

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
export function bearer(token: TokenSource, options: BearerOptions = {}): HttpMiddleware {
  const crossOrigin = options.crossOrigin ?? false
  return async function bearerMiddleware(request, next) {
    if (!crossOrigin && !targetsBaseOrigin(request)) return next()
    tokenSources.set(request.headers, token)
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
    // A one-shot (stream) body was consumed by the first send; re-issuing
    // would turn the 401 into an unrelated "body already used" TypeError.
    if (!isReplayable(request)) return response

    while (statuses.includes(response.status) && attempts < limit) {
      attempts += 1
      const ok = await runRefresh()
      if (ok === false) return response
      if (request.signal?.aborted) return response
      // `bearer` ABOVE this middleware ran once, with the OLD token, and a
      // re-issue only replays what is below us — so re-read its source.
      // (Below us it re-runs on its own and this is a harmless repeat.)
      const source = tokenSources.get(request.headers)
      if (source) {
        const value = source()
        if (value) request.headers.set('authorization', `Bearer ${value}`)
        else request.headers.delete('authorization')
      }
      // The 401 is being replaced — release its connection.
      await discardBody(response)
      response = await next()
    }

    return response
  }
}
