import { Fragment, h } from './h'
import type { Props, VNode, VNodeChild } from './types'

const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

/** Internal marker attached to lazy()-wrapped components */
export type LazyComponent<P extends Props = Props> = ((props: P) => VNodeChild) & {
  __loading: () => boolean
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
export function Suspense(props: { fallback: VNodeChild; children?: VNodeChild }): VNode {
  if (__DEV__ && props.fallback === undefined) {
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
