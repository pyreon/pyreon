import {
  Virtualizer,
  observeElementOffset,
  observeElementRect,
  elementScroll,
} from '@tanstack/virtual-core'
import { createItemRegistry } from '../item-registry'
import { deferDetachedMeasurement, guardDetachedSize } from '../detached-measure'

// A <For> first window mounts into a DocumentFragment, so a row's ref (where
// measureElement is called) sees a DETACHED element — no layout box, height 0.
// These specs lock the two adapter-side guards against recording that 0.

function makeInstance(measure: (el: Element) => number) {
  const scroller = document.createElement('div')
  document.body.appendChild(scroller)
  const instance = new Virtualizer<HTMLElement, HTMLElement>({
    count: 100,
    getScrollElement: () => scroller,
    estimateSize: () => 40,
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    measureElement: guardDetachedSize<HTMLElement, HTMLElement>((el) => measure(el)),
  })
  deferDetachedMeasurement(instance)
  const row = (i: number) => {
    const el = document.createElement('div')
    el.setAttribute('data-index', String(i))
    return el
  }
  return { instance, scroller, row }
}

describe('guardDetachedSize', () => {
  it('never reports a DOM read from a detached element — cached size or estimate instead', () => {
    const measure = vi.fn(() => 0)
    const { instance, scroller, row } = makeInstance(measure)
    const guarded = instance.options.measureElement
    const detached = row(3)
    expect(guarded(detached, undefined, instance)).toBe(40)
    expect(measure).not.toHaveBeenCalled()
    instance.itemSizeCache.set(instance.options.getItemKey(3), 77)
    expect(guarded(detached, undefined, instance)).toBe(77)

    const attached = row(3)
    scroller.appendChild(attached)
    expect(guarded(attached, undefined, instance)).toBe(0)
    expect(measure).toHaveBeenCalledTimes(1)
    scroller.remove()
  })

  it('wraps the TanStack default when no measureElement is given', () => {
    const { instance, row } = makeInstance(() => 0)
    const guarded = guardDetachedSize<HTMLElement, HTMLElement>()
    expect(guarded(row(5), undefined, instance)).toBe(40)
  })
})

describe('deferDetachedMeasurement', () => {
  it('defers a detached node to a microtask and measures it once attached', async () => {
    const measure = vi.fn((el: Element) => (el.isConnected ? 55 : 0))
    const { instance, scroller, row } = makeInstance(measure)
    instance._willUpdate()
    const el = row(2)
    instance.measureElement(el)
    // Nothing recorded synchronously — a detached read would have been 0.
    expect(instance.itemSizeCache.has(instance.options.getItemKey(2))).toBe(false)
    scroller.appendChild(el) // <For> moves the fragment in before the microtask
    await Promise.resolve()
    expect(instance.itemSizeCache.get(instance.options.getItemKey(2))).toBe(55)
    scroller.remove()
  })

  it('falls back to the estimate (never 0) when the node is still detached', async () => {
    const { instance, row } = makeInstance(() => 0)
    instance._willUpdate()
    instance.measureElement(row(4))
    await Promise.resolve()
    // The estimate equals the current size, so nothing moves — crucially, no 0.
    expect(instance.itemSizeCache.get(instance.options.getItemKey(4))).not.toBe(0)
    expect(instance.getTotalSize()).toBe(100 * 40)
  })

  it('passes attached nodes and the null sweep through synchronously', () => {
    const { instance, scroller, row } = makeInstance(() => 33)
    instance._willUpdate()
    const el = row(1)
    scroller.appendChild(el)
    instance.measureElement(el)
    expect(instance.itemSizeCache.get(instance.options.getItemKey(1))).toBe(33)
    expect(() => instance.measureElement(null)).not.toThrow()
    scroller.remove()
  })
})

describe('createItemRegistry — activation seeds from the latest window', () => {
  // item() is first called from a row's render, AFTER the emit that produced the
  // row. Seeding from the pre-activation (empty) map pinned first-window rows at
  // start=0 until some later emit — which never comes when measured sizes equal
  // the estimate (no delta, no notify).
  it('item().start() reflects a sync that ran BEFORE item() was ever called', () => {
    const reg = createItemRegistry()
    reg.sync(
      [0, 1, 2, 3].map((i) => ({
        index: i,
        key: i,
        start: i * 40,
        end: i * 40 + 40,
        size: 40,
        lane: 0,
      })),
    )
    expect(reg.item(3).start()).toBe(120)
    expect(reg.item(2).size()).toBe(40)
  })

  it('reads 0 for an index outside the latest window', () => {
    const reg = createItemRegistry()
    reg.sync([{ index: 0, key: 0, start: 0, end: 40, size: 40, lane: 0 }])
    const m = reg.item(50)
    expect([m.start(), m.size(), m.lane()]).toEqual([0, 0, 0])
  })
})
