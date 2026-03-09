import type { VNode, VNodeChild, Props } from "./types"
import { h } from "./h"
import { Fragment } from "./h"

/** Internal marker attached to lazy()-wrapped components */
export type LazyComponent<P extends Props = Props> = ((props: P) => VNode | null) & {
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
  return h(Fragment, null, () => {
    const ch = props.children
    const childNode = typeof ch === "function" ? ch() : ch

    // Check if the child is a VNode whose type is a lazy component still loading
    const isLoading =
      childNode != null &&
      typeof childNode === "object" &&
      !Array.isArray(childNode) &&
      typeof (childNode as VNode).type === "function" &&
      ((childNode as VNode).type as unknown as LazyComponent).__loading?.()

    if (isLoading) {
      const fb = props.fallback
      return typeof fb === "function" ? fb() : fb
    }
    return childNode
  })
}
