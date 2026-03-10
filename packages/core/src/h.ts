import type { ComponentFn, Props, VNode, VNodeChild } from "./types"

/** Marker for fragment nodes — renders children without a wrapper element */
export const Fragment: unique symbol = Symbol("Pyreon.Fragment")

/**
 * Hyperscript function — the compiled output of JSX.
 * `<div class="x">hello</div>` → `h("div", { class: "x" }, "hello")`
 *
 * Generic on P so TypeScript validates props match the component's signature
 * at the call site, then stores the result in the loosely-typed VNode.
 */
/** Shared empty props sentinel — identity-checked in mountElement to skip applyProps. */
export const EMPTY_PROPS: Props = {} as Props

export function h<P extends Props>(
  type: string | ComponentFn<P> | symbol,
  props: P | null,
  ...children: VNodeChild[]
): VNode {
  return {
    type: type as string | ComponentFn | symbol,
    props: (props ?? EMPTY_PROPS) as Props,
    children: normalizeChildren(children),
    key: (props?.key as string | number | null) ?? null,
  }
}

function normalizeChildren(children: VNodeChild[]): VNodeChild[] {
  // Fast path: no nested arrays — return as-is without allocating
  for (let i = 0; i < children.length; i++) {
    if (Array.isArray(children[i])) {
      return flattenChildren(children)
    }
  }
  return children
}

function flattenChildren(children: VNodeChild[]): VNodeChild[] {
  const result: VNodeChild[] = []
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...flattenChildren(child as VNodeChild[]))
    } else {
      result.push(child)
    }
  }
  return result
}
