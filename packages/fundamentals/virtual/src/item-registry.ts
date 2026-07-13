import { batch, type Signal, signal } from '@pyreon/reactivity'
import type { VirtualItem } from '@tanstack/virtual-core'

/**
 * Reactive per-index measurement accessors for a single virtual item.
 *
 * Each field is a signal-backed accessor that gates on numeric equality — so a
 * row reading `start()`/`size()` re-runs (and patches the DOM) ONLY when THAT
 * item's measurement actually changes. A fixed-size scroll leaves a staying
 * row's `start` invariant (`index * size`), so its accessor never re-fires; a
 * dynamic remeasure that shifts a row's position fires only the shifted rows.
 */
export interface VirtualItemMeasurement {
  /** Reactive pixel offset of this item along the scroll axis. */
  start: () => number
  /** Reactive pixel size of this item along the scroll axis. */
  size: () => number
  /** Reactive lane index (masonry / multi-column). `0` for single-lane lists. */
  lane: () => number
}

interface ItemSignals {
  // Per-field signals are created lazily on first read — a row that only reads
  // `start()` allocates one signal, not three. `null` = not yet observed.
  start: Signal<number> | null
  size: Signal<number> | null
  lane: Signal<number> | null
}

export interface ItemRegistry {
  /**
   * Push the latest visible measurements into the per-index signals.
   *
   * No-op until `item()` has been called at least once — so the captured-item
   * fast path (fixed-size lists that read `<For>`'s item directly) pays ZERO
   * extra cost. Once active, each update sets the numeric signals (Object.is
   * gate → unchanged rows don't fire) and prunes signals for indices that left
   * the window (their rows unmounted), keeping the map bounded to the window.
   */
  sync: (items: VirtualItem[]) => void
  /**
   * Get reactive `start`/`size`/`lane` accessors for `index`. Stable for the
   * lifetime of the calling row. Use inside a row's style/position accessor for
   * dynamically-measured lists so a staying row re-positions when a remeasure
   * above it shifts its `start`.
   */
  item: (index: number) => VirtualItemMeasurement
}

/**
 * Create the fine-grained per-item measurement registry shared by the element-
 * and window-scoped virtualizers. Zero-cost until `item()` is first used.
 */
export function createItemRegistry(): ItemRegistry {
  const byIndex = new Map<number, VirtualItem>()
  const sigs = new Map<number, ItemSignals>()
  let active = false

  const sync = (items: VirtualItem[]): void => {
    if (!active) return
    byIndex.clear()
    // Batch every per-index write so all rows flip atomically (a no-op nest when
    // called from the virtualizer's already-batched emit; self-contained otherwise).
    batch(() => {
      for (const it of items) {
        byIndex.set(it.index, it)
        const s = sigs.get(it.index)
        if (s) {
          // Object.is-gated: only the observed fields that changed notify.
          if (s.start) s.start.set(it.start)
          if (s.size) s.size.set(it.size)
          if (s.lane) s.lane.set(it.lane)
        }
      }
    })
    // Prune signals for indices that left the window. A row exists iff its index
    // is in `items` (the <For> renders exactly the visible set), so any signal
    // whose index is now absent belongs to an unmounting row — dropping it keeps
    // the map bounded to the window (no full-scroll-through leak, class C).
    if (sigs.size > byIndex.size) {
      for (const idx of sigs.keys()) {
        if (!byIndex.has(idx)) sigs.delete(idx)
      }
    }
  }

  const item = (index: number): VirtualItemMeasurement => {
    active = true
    let s = sigs.get(index)
    if (!s) {
      s = { start: null, size: null, lane: null }
      sigs.set(index, s)
    }
    const cur = s
    // Each accessor lazily materializes its own signal on first read, seeded
    // from the freshest measurement at that moment.
    return {
      start: () => (cur.start ??= signal(byIndex.get(index)?.start ?? 0))(),
      size: () => (cur.size ??= signal(byIndex.get(index)?.size ?? 0))(),
      lane: () => (cur.lane ??= signal(byIndex.get(index)?.lane ?? 0))(),
    }
  }

  return { sync, item }
}
