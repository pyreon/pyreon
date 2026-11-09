// Hydration-stable unique ids. Kept OUT of `props.ts` on purpose: the JSX runtime imports `props.ts`, and this file needs
// `context.ts`, which has load-time side effects (it registers the owner snapshot hook). Sharing a module would make
// every minimal `@pyreon/core/jsx-runtime` import carry the context machinery it never calls (measured +141 B,
// `check-import-budgets`).
import { nativeCompat } from './compat-marker'
import { createContext, provide, useContext } from './context'
import type { VNodeChild } from './types'

// ─── Unique ID ───────────────────────────────────────────────────────────────

/**
 * A namespace + counter that `createUniqueId()` draws from. Ids only line up between the server render and
 * hydration if BOTH sides number the same components in the same order, which a process-wide counter cannot
 * give: the server's keeps growing across requests, the client's starts at 0 on every page load, and an
 * island hydrates later as a separate root.
 *
 * So the scope is a CONTEXT value:
 *  - the page uses the default scope on the client (a fresh page load starts it at 0) and a per-request scope
 *    on the server (the request stack's first frame, see `_requestIdFrame`), so both count 1, 2, 3 … through
 *    the same synchronous render order;
 *  - each island gets its OWN namespace (`pyreon-i1-…`) on both sides (`_IslandIds`), so its ids neither
 *    depend on the page's count (an island's subtree is not part of the client page walk) nor collide with it.
 */
interface IdScope {
  prefix: string
  n: number
  /** How many islands this scope has handed out (their prefixes nest: `pyreon-i1-i2-`). */
  islands: number
}

const IdScopeContext = /* @__PURE__ */ createContext<IdScope | undefined>(undefined)
const _defaultScope: IdScope = { prefix: 'pyreon-', n: 0, islands: 0 }
const currentScope = (): IdScope => useContext(IdScopeContext) ?? _defaultScope

/**
 * Generate a unique ID string for accessibility attributes (htmlFor, aria-describedby, etc.).
 *
 * Hydration-stable: a server-rendered `id` and the id the hydrated component holds are the same string, because
 * the server counts per request and each island has its own namespace (see {@link IdScope}). It holds while the
 * components that call it render in the same order on both sides — the synchronous page render and each island
 * are; a streamed Suspense boundary that resolves out of order is the exception.
 *
 * @example
 * const id = createUniqueId()
 * return <>
 *   <label for={id}>Name</label>
 *   <input id={id} />
 * </>
 */
export function createUniqueId(): string {
  const scope = currentScope()
  return `${scope.prefix}${++scope.n}`
}

/** Reset the DEFAULT scope's counter (test helper; the server scopes per request instead). */
export function _resetIdCounter(): void {
  _defaultScope.n = 0
  _defaultScope.islands = 0
}

/** The first frame of a server request stack: a fresh page scope, so every request counts from 1. */
export function _requestIdFrame(): Map<symbol, unknown> {
  return new Map<symbol, unknown>([[IdScopeContext.id, { prefix: 'pyreon-', n: 0, islands: 0 } satisfies IdScope]])
}

/** The id namespace for the next island under the current scope (`pyreon-i1-`, `pyreon-i2-`, …). */
export function _nextIslandIdPrefix(): string {
  const scope = currentScope()
  return `${scope.prefix}i${++scope.islands}-`
}

/**
 * Gives its subtree an id namespace of its own. Rendered around an island on the server and around the island's
 * root when it hydrates, with the same prefix on both sides (the server writes it to `data-id-prefix`).
 */
export const _IslandIds = /* @__PURE__ */ nativeCompat(function IslandIds(props: { prefix: string; children?: VNodeChild }): VNodeChild {
  provide(IdScopeContext, { prefix: props.prefix, n: 0, islands: 0 })
  return props.children ?? null
})
