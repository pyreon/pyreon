import {
  measureElement as defaultMeasureElement,
  type Virtualizer,
  type VirtualizerOptions,
} from '@tanstack/virtual-core'

/**
 * Measuring a DETACHED element is never a measurement.
 *
 * Pyreon's `<For>` builds a fresh batch of rows into a `DocumentFragment` and
 * only then moves the fragment into the live parent, so a row's `ref` callback
 * — the documented place to call `instance.measureElement(el)` — fires while
 * the element is still detached. A detached element has no layout box:
 * `getBoundingClientRect().height` and `offsetHeight` both read `0`. Handing
 * that `0` to TanStack records every initially-mounted row as ZERO-sized.
 *
 * On `@tanstack/virtual-core` ≤3.17.4 that was a harmless glitch the
 * ResizeObserver corrected a frame later. From 3.17.11 the re-measure anchor
 * predicate is `itemStart + itemSize <= scrollOffset` (entirely-above-the-fold),
 * which a zero-sized row at the viewport top satisfies (`0 + 0 <= 0`): each
 * 0→real correction then shifts scrollTop by the row's size, cascading down
 * the list until the viewport has scrolled past every fake-zero row. Visible
 * result: the list mounts scrolled to row ~8 with rows 0..7 collapsed.
 *
 * React never hits this because a ref fires after commit, on an attached
 * node. Two layers restore that contract here:
 *
 * 1. `deferDetachedMeasurement` — a detached node's `measureElement(node)` is
 *    deferred one microtask, by which point `<For>` has inserted the fragment,
 *    so TanStack's FIRST measurement is the real size (and gets its
 *    first-measure anchoring semantics).
 * 2. `guardDetachedSize` — if a node is STILL detached (a consumer holding it
 *    off-document), the sizing function reports the cached size or the
 *    estimate instead of reading a `0` from a box that does not exist. The
 *    node is still observed, so the ResizeObserver delivers its true size once
 *    it connects.
 */
export function guardDetachedSize<
  TScrollElement extends Element | Window,
  TItemElement extends Element,
>(
  measure: VirtualizerOptions<
    TScrollElement,
    TItemElement
  >['measureElement'] = defaultMeasureElement,
): NonNullable<VirtualizerOptions<TScrollElement, TItemElement>['measureElement']> {
  return (element, entry, instance) => {
    if (!entry && !element.isConnected) {
      const index = instance.indexFromElement(element)
      return (
        instance.itemSizeCache.get(instance.options.getItemKey(index)) ??
        instance.options.estimateSize(index)
      )
    }
    return measure(element, entry, instance)
  }
}

export function deferDetachedMeasurement<
  TScrollElement extends Element | Window,
  TItemElement extends Element,
>(instance: Virtualizer<TScrollElement, TItemElement>): void {
  const measure = instance.measureElement
  instance.measureElement = (node: TItemElement | null): void => {
    if (node && !node.isConnected) {
      // Still detached after the microtask → measure anyway; the size guard
      // reports the estimate and the ResizeObserver corrects it on connect.
      queueMicrotask(() => measure(node))
      return
    }
    measure(node)
  }
}
