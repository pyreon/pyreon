import type { NativeItem, Props, VNode } from './types'

/**
 * Symbol used as the VNode type for a For list — runtime-dom handles it
 * via mountFor, bypassing the generic VNode reconciler.
 */
export const ForSymbol: unique symbol = Symbol('pyreon.For')

export interface ForProps<T> {
  /**
   * The list to iterate. Accepts EITHER a function returning the array
   * (preferred — keeps reactivity intact when the array comes from a
   * signal accessor) OR the array directly (convenient for static lists
   * or already-resolved arrays). The runtime in `runtime-dom/src/mount.ts`
   * normalizes both shapes; this type matches the runtime so users aren't
   * forced to write `each={() => items}` for a plain array.
   *
   * @example
   * <For each={items}>{r => <li>{r.label}</li>}</For>           // static
   * <For each={() => store.items()}>{r => <li>...</li>}</For>   // reactive
   */
  each: T[] | (() => T[])
  /** Keying function — use `by` not `key` (JSX extracts `key` for VNode reconciliation). */
  by: (item: T) => string | number
  /**
   * Render callback for each item. Runs ONCE per new key — `item` is the
   * value at first mount, not a live accessor. For reactivity-on-prop-
   * change, pass an ID via `children` and let the child look up its own
   * data from the store inside JSX accessors. See the For docstring for
   * the canonical pattern (W22).
   */
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
 * ## Reactive children pattern (W22)
 *
 * The `children: (item) => VNode` callback runs ONCE per new key when the
 * entry is first mounted. The `item` it receives is the THEN-CURRENT value
 * — subsequent mutations of `each` that produce the SAME `by` key DO NOT
 * call `children` again with the updated item. Components run once.
 *
 * That means:
 * ```tsx
 * // ⚠️ STALE: card.title shows the value at first mount; later updates
 * //    to the underlying store leave this stale.
 * <For each={() => store.cards()} by={c => c.id}>
 *   {card => <Card title={card.title} />}
 * </For>
 * ```
 *
 * The canonical Pyreon fix is to pass an ID and let the child look up
 * its own live data from the store:
 * ```tsx
 * // ✓ LIVE: Card looks up its data from the store via the ID,
 * //    reads inside JSX accessors so updates propagate.
 * <For each={() => store.cards().map(c => c.id)} by={id => id}>
 *   {id => <Card cardId={id} />}
 * </For>
 *
 * function Card(props: { cardId: string }) {
 *   const card = computed(() => store.cards().find(c => c.id === props.cardId))
 *   return <div>{() => card()?.title ?? ''}</div>
 * }
 * ```
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
