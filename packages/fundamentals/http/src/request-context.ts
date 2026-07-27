/**
 * The per-request seam — client-safe half.
 *
 * Two things break an HTTP client under SSR, and both are per-request:
 *
 * 1. A relative URL (`/api/users`) has no origin on the server, so `fetch`
 *    rejects. It needs the INBOUND request's origin.
 * 2. Forwarding auth (cookie, authorization) to an internal API requires
 *    the inbound headers.
 *
 * The naive fix — a module-level `let currentRequest` — leaks across
 * concurrent requests: request B overwrites A's value while A is still
 * rendering, and A then forwards B's cookies. That is a session-crossing
 * bug, not a glitch.
 *
 * So this module holds no per-request state at all. It holds an ACCESSOR,
 * evaluated lazily at each read, which `@pyreon/http/server` wires to an
 * `AsyncLocalStorage`. This is the same shape `@pyreon/storage`'s
 * `setCookieSource` uses, and the same reason: the accessor form is what
 * lets concurrent requests each resolve their own value.
 *
 * The `node:async_hooks` import lives ONLY in the `/server` entry. Putting
 * it here would drag a Node-only module into every browser bundle — the
 * failure `scripts/check-client-bundle-node-imports.ts` exists to catch.
 */

/** The subset of an inbound request this package needs. */
export interface AmbientRequest {
  /** Absolute URL of the inbound request — supplies the origin. */
  readonly url: string
  /** Inbound headers, for selective forwarding. */
  readonly headers: Headers
}

/** Resolves the request in scope right now, or `undefined`. */
export type RequestSource = () => AmbientRequest | undefined

let requestSource: RequestSource | null = null

/**
 * Register the per-request accessor. Called by `@pyreon/http/server`.
 *
 * @internal Not part of the public API — the wiring is done for you.
 */
export function _setRequestSource(source: RequestSource | null): void {
  requestSource = source
}

/**
 * The request currently in scope, if any.
 *
 * Always `undefined` in the browser and in any server that has not opted
 * in, which is what makes every consumer of this a no-op by default.
 */
export function getAmbientRequest(): AmbientRequest | undefined {
  return requestSource?.()
}

/**
 * Resolve a root-relative URL against the ambient request's origin.
 *
 * Returns `url` unchanged when it is already absolute, when there is no
 * ambient request (i.e. in the browser, where the document supplies the
 * origin), or when the ambient URL cannot be parsed — never throwing, so a
 * malformed inbound URL degrades to the previous behaviour instead of
 * failing the render.
 */
export function resolveAgainstAmbientOrigin(url: string): string {
  if (!url.startsWith('/')) return url
  const ambient = getAmbientRequest()
  if (!ambient) return url
  try {
    return new URL(url, new URL(ambient.url).origin).toString()
  } catch {
    return url
  }
}
