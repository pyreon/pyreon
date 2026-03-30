import type { NativeItem, Props, VNode } from "./types";

/**
 * Symbol used as the VNode type for a For list — runtime-dom handles it
 * via mountFor, bypassing the generic VNode reconciler.
 */
export const ForSymbol: unique symbol = Symbol("pyreon.For");

export interface ForProps<T> {
  each: () => T[];
  by: (item: T) => string | number;
  children: (item: T) => VNode | NativeItem;
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
  };
}
