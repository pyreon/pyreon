/**
 * `@pyreon/http/server` — per-request isolation for SSR.
 *
 * This is the ONLY entry that imports `node:async_hooks`. It must stay a
 * separate subpath: a top-level `node:*` import in the client-safe entry
 * pulls a Node-only module into every browser bundle, which is the exact
 * failure `scripts/check-client-bundle-node-imports.ts` gates against and
 * that PR #1125 shipped once already.
 *
 * Wire it once, at the top of your request handler:
 *
 * ```ts
 * import { runWithRequest } from '@pyreon/http/server'
 *
 * export const middleware = (ctx) => runWithRequest(ctx.req, () => next(ctx))
 * ```
 *
 * After that, a relative `api.get('/api/users')` resolves against the
 * inbound origin instead of rejecting, and `forwardHeaders()` can copy
 * cookies through — each concurrent request seeing only its own.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { _setRequestSource, type AmbientRequest } from './request-context'

const als = new AsyncLocalStorage<AmbientRequest>()

// Registered at module load. Import order does not matter: the client-safe
// half holds `null` until this runs, and every consumer treats `null` as
// "no ambient request", which is the correct browser behaviour anyway.
_setRequestSource(() => als.getStore())

/**
 * Run `fn` with `request` as the ambient request.
 *
 * Accepts anything with `url` and `headers` — a WHATWG `Request`, a
 * `MiddlewareContext`'s `req`, or a hand-built object in a test.
 *
 * Nesting is safe: an inner call shadows the outer for its own subtree only.
 */
export function runWithRequest<T>(
  request: AmbientRequest,
  fn: () => T,
): T {
  return als.run({ url: request.url, headers: request.headers }, fn)
}

/**
 * The request in scope, or `undefined` outside `runWithRequest`.
 *
 * Prefer letting the client resolve origins and headers for you; reach for
 * this only when you need the inbound request directly.
 */
export function getRequest(): AmbientRequest | undefined {
  return als.getStore()
}

/**
 * Detach the accessor. Only useful in tests that assert the un-wired
 * behaviour; production never needs it.
 *
 * @internal
 */
export function _resetRequestSource(): void {
  _setRequestSource(null)
}

export type { AmbientRequest }
