import type { ComponentFn, Props, VNode, VNodeChild } from "./types"

/** Marker for fragment nodes — renders children without a wrapper element */
export const Fragment: unique symbol = Symbol("Nova.Fragment")

/**
 * Hyperscript function — the compiled output of JSX.
 * `<div class="x">hello</div>` → `h("div", { class: "x" }, "hello")`
 *
 * Generic on P so TypeScript validates props match the component's signature
 * at the call site, then stores the result in the loosely-typed VNode.
 */
export function h<P extends Props>(
  type: string | ComponentFn<P> | symbol,
  props: P | null,
  ...children: VNodeChild[]
): VNode {
  return {
    type: type as string | ComponentFn | symbol,
    props: (props ?? {}) as Props,
    children: normalizeChildren(children),
    key: (props?.key as string | number | null) ?? null,
  }
}

function normalizeChildren(children: VNodeChild[]): VNodeChild[] {
  const result: VNodeChild[] = []
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...normalizeChildren(child as VNodeChild[]))
    } else {
      result.push(child)
    }
  }
  return result
}
