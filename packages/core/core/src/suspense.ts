import { isServer, signal } from '@pyreon/reactivity'
import { nativeCompat } from './compat-marker'
import { createContext, provide } from './context'
import { Fragment, h } from './h'
import type { Props, VNode, VNodeChild } from './types'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
/** Internal marker attached to lazy()-wrapped components */
export type LazyComponent<P extends object = Props> = ((props: P) => VNodeChild) & {
  __loading: () => boolean
  /**
   * Resolves once the chunk has settled (loaded or failed; never rejects).
   * Optional: `@pyreon/core`'s `lazy()` provides it, and the SSR renderers use
   * it to WAIT for a still-loading lazy instead of rendering it as nothing.
   * A lazy without it keeps the fallback on the server.
   */
  __load?: () => Promise<void>
  /**
   * True while the component's real content is not available yet. Optional;
   * defaults to `__loading`. It exists for a lazy whose `__loading` is
   * deliberately false while loading (vue-compat's `suspensible: false`, which
   * must not put a client `<Suspense>` into its fallback) but whose server
   * content hydration must still wait for.
   */
  __pending?: () => boolean
}

// ─── Hydration awareness ─────────────────────────────────────────────────────
// `@pyreon/runtime-dom` sets this for the duration of each SYNCHRONOUS
// hydration walk (save/restore — hydration walks nest via islands and deferred
// lazy ranges). Core cannot import the renderer, so the renderer pushes the
// state down. While it is set, the server has ALREADY rendered this boundary's
// content — it waits for a loading lazy before it renders — so showing the
// fallback would discard the server nodes the walk is about to adopt.
let _hydrating = false

/**
 * @internal Set by `@pyreon/runtime-dom`'s hydration walk; returns the previous
 * value so the caller can restore it.
 */
export function _setSuspenseHydrating(v: boolean): boolean {
  const prev = _hydrating
  _hydrating = v
  return prev
}

// ─── Boundary registration (the React / Vue model) ───────────────────────────
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
  /** Register a load; the fallback shows until it settles. A promise that rejects counts as settled. */
  register(settled: Promise<unknown>): void
  /** Number of registered loads that have not settled. */
  readonly pending: () => number
  /** The boundary's `fallback` prop, resolved. */
  readonly fallback: () => VNodeChild
}

/** @internal See {@link SuspenseBoundary}. */
export const SuspenseBoundaryContext = createContext<SuspenseBoundary | null>(null)

function createSuspenseBoundary(fallback: () => VNodeChild): SuspenseBoundary {
  const count = signal(0)
  const settle = () => count.update((n) => n - 1)
  return {
    register(settled) {
      // Hydrating over server content: the server already waited for this load
      // and the DOM holds its content — the descendant's own hydration keeps
      // that content standing until the chunk lands. Showing the fallback
      // would hide exactly what hydration is adopting. The server itself never
      // needs to show anything either.
      if (_hydrating || isServer) return
      count.update((n) => n + 1)
      settled.then(settle, settle)
    },
    pending: count,
    fallback,
  }
}

/**
 * Suspense — shows `fallback` while a lazy child component is still loading.
 *
 * Works in tandem with `lazy()` from `@pyreon/react-compat` (or `@pyreon/core/lazy`).
 * The child VNode's `.type.__loading()` signal drives the switch.
 *
 * Usage:
 *   const Page = lazy(() => import("./Page"))
 *
 *   h(Suspense, { fallback: h(Spinner, null) }, h(Page, null))
 *   // or with JSX:
 *   <Suspense fallback={<Spinner />}><Page /></Suspense>
 */
function Suspense(props: { fallback: VNodeChild; children?: VNodeChild }): VNode {
  if (process.env.NODE_ENV !== 'production' && props.fallback === undefined) {
    // oxlint-disable-next-line no-console
    console.warn(
      '[Pyreon] <Suspense> is missing a `fallback` prop. Provide fallback UI to show while loading.',
    )
  }

  const fallback = (): VNodeChild => {
    const fb = props.fallback
    return typeof fb === 'function' ? (fb as () => VNodeChild)() : fb
  }
  // Descendants below the direct child register with this boundary (see
  // `SuspenseBoundary`); the DOM renderer shows the fallback while any is pending.
  provide(SuspenseBoundaryContext, createSuspenseBoundary(fallback))

  return h(Fragment, null, () => {
    const ch = props.children
    const childNode = typeof ch === 'function' ? ch() : ch

    // Check if the child is a VNode whose type is a lazy component still loading
    const lazyType =
      childNode != null &&
      typeof childNode === 'object' &&
      !Array.isArray(childNode) &&
      typeof (childNode as VNode).type === 'function'
        ? ((childNode as VNode).type as unknown as Partial<LazyComponent>)
        : null

    // Hydrating over server content: render the CHILD, never the fallback,
    // and do not subscribe to its loading state. The server waited for the
    // chunk, so the DOM already holds the child's content; the child's own
    // hydration keeps that range standing until its chunk lands (a lazy that
    // offers `__load`). Subscribing would re-run this accessor when the chunk
    // lands and REMOUNT the child over the nodes it just adopted.
    if (_hydrating && typeof lazyType?.__load === 'function') return childNode

    if (lazyType?.__loading?.()) {
      const fb = props.fallback
      return typeof fb === 'function' ? fb() : fb
    }
    return childNode
  })
}

// Mark as native so the compat-mode jsx() runtimes (react/preact/vue-compat)
// route it through h() directly instead of wrapCompatComponent. Wrapped, the
// vnode's type is the compat WRAPPER, so runtime-server's `type === Suspense`
// check never matches (a still-loading lazy child is not waited for) and the
// accessor above runs inside a compat render frame rather than Pyreon's setup
// frame. solid/svelte-compat already hard-code Suspense as native; this makes
// the other three agree. PURE assignment form for the same tree-shake reason
// as ErrorBoundary: returns the SAME function with the marker applied.
const _Suspense = /* @__PURE__ */ nativeCompat(Suspense)
export { _Suspense as Suspense }
