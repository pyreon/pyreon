import { createContext } from './context'
import type { VNodeChild } from './types'

/**
 * The parts of `<Suspense>` the renderers need even when an app never renders
 * a `<Suspense>`: the boundary context an async component registers with, and
 * the key the component's DOM handler hangs under. Kept apart from
 * `suspense.ts` so that a bundle with no `<Suspense>` does not carry the
 * component or its DOM handler.
 */
/**
 * The nearest `<Suspense>`, as seen by an async DESCENDANT. A still-loading
 * `lazy()` (or async component) anywhere below the boundary — not only its
 * direct child — registers its settle promise here, and the boundary shows its
 * fallback until every registered load has settled.
 *
 * `pending()` is a signal (the number of unsettled registrations). Only the
 * DOM renderer acts on it: it keeps the boundary's content MOUNTED but moves it
 * off-screen and shows the fallback in its place, so a descendant that suspends
 * costs neither its siblings' state nor a second mount. The server needs none
 * of this — both renderers already wait for every lazy / async component
 * before rendering it.
 *
 * @internal Consumed by `lazy()`, the compat lazies and `@pyreon/runtime-dom`.
 */
export interface SuspenseBoundary {
  register(settled: Promise<unknown>): void
  readonly pending: () => number
  readonly fallback: () => VNodeChild
}

export const SuspenseBoundaryContext = /* @__PURE__ */ createContext<SuspenseBoundary | null>(null)

/**
 * The key under which `<Suspense>` carries `attachSuspenseBoundary`. A registry
 * symbol, so `@pyreon/runtime-dom` reads it without importing `Suspense` (an
 * identity check against the component would put it in every bundle).
 */
export const SUSPENSE_ATTACH: unique symbol = /* @__PURE__ */ Symbol.for('pyreon:suspense-attach') as never
