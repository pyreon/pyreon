/**
 * Forward selected headers from the inbound SSR request.
 *
 * OPT-IN, and the allowlist is REQUIRED — there is deliberately no
 * "forward everything" mode and no default set. Blanket forwarding is an
 * SSRF-adjacent footgun the moment `baseUrl` points at a third party: your
 * user's session cookie leaves for someone else's server, silently, because
 * a config value changed. Naming the headers makes that impossible to do by
 * accident.
 *
 * No-op in the browser and in any server that has not called
 * `runWithRequest` — there is simply no ambient request to read.
 */

import { getAmbientRequest } from '../request-context'
import type { HttpMiddleware } from '../types'

export interface ForwardHeadersOptions {
  /**
   * Forward even when the request leaves your own origin.
   *
   * Default `false`: forwarding stops at the origin boundary, so a client
   * pointed at a third-party API never leaks the user's cookies there.
   * Set `true` only when the other origin is yours.
   */
  crossOrigin?: boolean | undefined
  /**
   * Overwrite a header the caller already set. Default `false` — an
   * explicit per-request header wins over an inherited one.
   */
  overwrite?: boolean | undefined
}

function sameOrigin(requestUrl: string, ambientUrl: string): boolean {
  // A relative URL has not been origin-resolved yet, which means it targets
  // our own server — treat it as same-origin.
  if (requestUrl.startsWith('/')) return true
  try {
    return new URL(requestUrl).origin === new URL(ambientUrl).origin
  } catch {
    return false
  }
}

/**
 * Copy the named headers from the inbound request onto outgoing requests.
 *
 * ```ts
 * createHttp({ baseUrl: '/api', use: [forwardHeaders(['cookie'])] })
 * ```
 */
export function forwardHeaders(
  names: readonly string[],
  options: ForwardHeadersOptions = {},
): HttpMiddleware {
  const lower = names.map((name) => name.toLowerCase())
  const overwrite = options.overwrite ?? false
  const crossOrigin = options.crossOrigin ?? false

  return async function forwardHeadersMiddleware(request, next) {
    const ambient = getAmbientRequest()
    if (!ambient) return next()
    if (!crossOrigin && !sameOrigin(request.url, ambient.url)) return next()

    for (const name of lower) {
      if (!overwrite && request.headers.has(name)) continue
      const value = ambient.headers.get(name)
      if (value !== null) request.headers.set(name, value)
    }

    return next()
  }
}
