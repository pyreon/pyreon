import { nativeCompat } from './compat-marker'
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

  return h(Fragment, null, () => {
    const ch = props.children
    const childNode = typeof ch === 'function' ? ch() : ch

    // Check if the child is a VNode whose type is a lazy component still loading
    const isLoading =
      childNode != null &&
      typeof childNode === 'object' &&
      !Array.isArray(childNode) &&
      typeof (childNode as VNode).type === 'function' &&
      ((childNode as VNode).type as unknown as LazyComponent).__loading?.()

    if (isLoading) {
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
