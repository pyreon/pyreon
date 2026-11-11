import type { VNode } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, runUntracked, signal, watch } from '@pyreon/reactivity'
import { flattenChildren, isVNodeLike } from './child-shape'

/** One rendered row of a keyed group: present, or leaving until its animation ends. */
export type PresenceEntry = {
  readonly key: string | number
  /** The element from the render that introduced the key (as `<For>` keeps a row). */
  readonly element: VNode
  /** Drives the row's transition: `false` while it leaves. */
  readonly show: Signal<boolean>
  /** Present at the group's first render (animates on mount only with `appear`). */
  readonly initial: boolean
}

type Keyed = { key: string | number; element: VNode }

// Index fallback for a child with no `key`. A string the user's own keys
// (numbers, ids) do not produce, so the two cannot collide.
const indexKey = (index: number): string => `\u0000kinetic-index:${index}`

const keyedChildren = (children: unknown, warnState: { warned: boolean }): Keyed[] => {
  const out: Keyed[] = []
  const seen = new Set<string | number>()
  const list = flattenChildren(children)
  for (let i = 0; i < list.length; i++) {
    const element = list[i] as VNode
    const own = isVNodeLike(element) ? (element as { key?: string | number | null }).key : null
    const key = own ?? indexKey(i)
    if (seen.has(key)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[Pyreon] kinetic group: duplicate key "${String(key)}". Give each child a unique \`key\`; the duplicate is skipped.`,
        )
      }
      continue
    }
    if (
      own == null &&
      isVNodeLike(element) &&
      !warnState.warned &&
      process.env.NODE_ENV !== 'production'
    ) {
      // Compiled static markup and server HTML cannot carry a key, so only a
      // VNode is asked for one. Without it the row is tracked by POSITION,
      // which animates the wrong row when a list changes.
      warnState.warned = true
      console.warn(
        '[Pyreon] kinetic group: a child has no `key`, so it is tracked by its position. Give every child of a group a stable `key` (e.g. `<li key={item.id}>`).',
      )
    }
    seen.add(key)
    out.push({ key, element })
  }
  return out
}

/**
 * The order to render after a change: the new children in their new order,
 * with each LEAVING row kept just before the row it preceded last time (the
 * merge react-transition-group uses), so a removed row animates out in place.
 */
const mergeOrder = (previous: PresenceEntry[], next: Keyed[]): (string | number)[] => {
  const nextKeys = new Set(next.map((c) => c.key))
  const leavingBefore = new Map<string | number, (string | number)[]>()
  let pending: (string | number)[] = []
  for (const entry of previous) {
    if (nextKeys.has(entry.key)) {
      if (pending.length > 0) {
        leavingBefore.set(entry.key, pending)
        pending = []
      }
    } else {
      pending.push(entry.key)
    }
  }
  const order: (string | number)[] = []
  for (const { key } of next) {
    const before = leavingBefore.get(key)
    if (before) order.push(...before)
    order.push(key)
  }
  order.push(...pending)
  return order
}

/**
 * Key-based presence for `<TransitionGroup>` and `kinetic(tag).group()`.
 *
 * Each key keeps ONE row for as long as it is on screen: a new key adds a row
 * that enters, a removed key flips its row's `show` to `false` so it leaves,
 * and `leave(entry)` (called from the row's `onAfterLeave`) drops the row once
 * its animation has finished. A key that comes back while leaving re-enters
 * the same row. Render `entries` with `<For by={(e) => e.key}>`, so rows that
 * stay are never rebuilt (rebuilding every row on each change is what lost the
 * per-row transition state before).
 *
 * Must be called during component setup: the watch is owned by the component
 * and stops with it.
 */
export const createGroupPresence = (
  children: () => unknown,
): {
  entries: Signal<PresenceEntry[]>
  leave: (entry: PresenceEntry) => void
} => {
  const byKey = new Map<string | number, PresenceEntry>()
  const warnState = { warned: false }
  const make = (child: Keyed, initial: boolean): PresenceEntry => {
    const entry: PresenceEntry = {
      key: child.key,
      element: child.element,
      show: signal(true),
      initial,
    }
    byKey.set(child.key, entry)
    return entry
  }

  const entries = signal<PresenceEntry[]>(
    runUntracked(() => keyedChildren(children(), warnState)).map((c) => make(c, true)),
  )

  watch(
    () => keyedChildren(children(), warnState),
    (next) => {
      // One batch: the leaving rows' `show`, the re-entering rows' `show` and
      // the new row order settle together.
      runUntracked(() =>
        batch(() => {
          const nextKeys = new Set(next.map((c) => c.key))
          for (const entry of entries()) {
            if (!nextKeys.has(entry.key) && entry.show()) entry.show.set(false)
          }
          for (const child of next) {
            const existing = byKey.get(child.key)
            if (!existing) make(child, false)
            else if (!existing.show()) existing.show.set(true)
          }
          const order = mergeOrder(entries(), next)
          entries.set(order.map((key) => byKey.get(key) as PresenceEntry))
        }),
      )
    },
  )

  const leave = (entry: PresenceEntry): void => {
    // Re-added while leaving: the row stays and enters again.
    if (entry.show.peek()) return
    if (byKey.get(entry.key) !== entry) return
    byKey.delete(entry.key)
    entries.set(entries.peek().filter((e) => e !== entry))
  }

  return { entries, leave }
}
