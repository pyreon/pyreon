import type { NativeItem, Props, VNode } from './types'

/**
 * Symbol used as the VNode type for a For list — runtime-dom handles it
 * via mountFor, bypassing the generic VNode reconciler.
 */
export const ForSymbol: unique symbol = Symbol('pyreon.For')

export interface ForProps<T> {
  each: () => T[]
  /** Keying function — use `by` not `key` (JSX extracts `key` for VNode reconciliation). */
  by: (item: T) => string | number
  children: (item: T) => VNode | NativeItem
  /**
   * @deprecated Use `by` instead of `key`. In Pyreon, `<For>` uses `by` for keying.
   * JSX reserves `key` for VNode reconciliation — it won't reach the component.
   */
  key?: never
}

/**
 * Efficient reactive list rendering.
 *
 * Unlike a plain `() => items().map(item => h(...))`, For never re-creates
 * VNodes for existing keys — only new keys invoke `children()`. Structural
 * mutations (swap, sort, filter) are O(n) key scan + O(k) DOM moves where k
 * is the number of actually displaced entries.
 *
 * Usage:
 *   <For each={items} by={r => r.id}>{r => <li>...</li>}</For>
 */
export function For<T>(props: ForProps<T>): VNode {
  return {
    type: ForSymbol as unknown as string,
    props: props as unknown as Props,
    children: [],
    key: null,
  }
}
