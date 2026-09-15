// Branch coverage for the linked-chart handle (`link.ts`): every arm of the
// `dispatchAction` vocabulary, paired with the state it must LEAVE ALONE.
// `dispatch` is the whole public surface of a handle, and every one of its ten
// cases has a "already in this state" arm that a naive test never reaches — a
// second `select` of the same index must not duplicate it, an `unselect` of an
// index that was never pinned must not rewrite the array.
import { describe, expect, it } from 'vitest'
import { createChartHandle, createChartLink } from './link'

describe('createChartLink', () => {
  it('starts with no window and no crosshair, and two links are independent', () => {
    const a = createChartLink()
    const b = createChartLink()
    expect(a.zoom()).toBeNull()
    expect(a.hover()).toBe(-1)
    a.hover.set(3)
    expect(b.hover(), 'each link owns its own signals').toBe(-1)
  })
})

describe('chart handle — crosshair actions', () => {
  it('highlight sets the visible-row index; downplay clears it back to -1', () => {
    const h = createChartHandle()
    h.dispatch({ type: 'highlight', index: 4 })
    expect(h.hover()).toBe(4)
    h.dispatch({ type: 'downplay' })
    expect(h.hover()).toBe(-1)
  })
  it('highlight -1 clears too — the same value downplay writes', () => {
    const h = createChartHandle()
    h.dispatch({ type: 'highlight', index: 2 })
    h.dispatch({ type: 'highlight', index: -1 })
    expect(h.hover()).toBe(-1)
  })
})

describe('chart handle — selection actions', () => {
  it('select appends in order; a repeat of the same index is a no-op, not a duplicate', () => {
    const h = createChartHandle()
    h.dispatch({ type: 'select', index: 2 })
    h.dispatch({ type: 'select', index: 5 })
    expect(h.selected()).toEqual([2, 5])
    const before = h.selected()
    h.dispatch({ type: 'select', index: 2 })
    expect(h.selected(), 'already pinned — the array must not grow').toEqual([2, 5])
    expect(h.selected(), 'and must not be rewritten at all').toBe(before)
  })
  it('unselect removes only that index; unselecting an unpinned index leaves the array untouched', () => {
    const h = createChartHandle()
    h.dispatch({ type: 'select', index: 2 })
    h.dispatch({ type: 'select', index: 5 })
    h.dispatch({ type: 'unselect', index: 2 })
    expect(h.selected()).toEqual([5])
    const before = h.selected()
    h.dispatch({ type: 'unselect', index: 99 })
    expect(h.selected()).toBe(before)
  })
  it('toggleSelect pins an absent index and unpins a present one', () => {
    const h = createChartHandle()
    h.dispatch({ type: 'toggleSelect', index: 7 })
    expect(h.selected()).toEqual([7])
    h.dispatch({ type: 'toggleSelect', index: 7 })
    expect(h.selected()).toEqual([])
  })
})

describe('chart handle — legend actions', () => {
  it('legendUnselect hides a series; a repeat does not duplicate it', () => {
    const h = createChartHandle()
    h.dispatch({ type: 'legendUnselect', series: 1 })
    expect(h.hidden()).toEqual([1])
    const before = h.hidden()
    h.dispatch({ type: 'legendUnselect', series: 1 })
    expect(h.hidden()).toBe(before)
  })
  it('legendSelect reveals a hidden series, and is a no-op for a visible one', () => {
    const h = createChartHandle()
    h.dispatch({ type: 'legendUnselect', series: 1 })
    h.dispatch({ type: 'legendUnselect', series: 3 })
    h.dispatch({ type: 'legendSelect', series: 1 })
    expect(h.hidden()).toEqual([3])
    const before = h.hidden()
    h.dispatch({ type: 'legendSelect', series: 1 })
    expect(h.hidden(), 'series 1 is already visible').toBe(before)
  })
  it('legendToggle flips a series both ways', () => {
    const h = createChartHandle()
    h.dispatch({ type: 'legendToggle', series: 2 })
    expect(h.hidden()).toEqual([2])
    h.dispatch({ type: 'legendToggle', series: 2 })
    expect(h.hidden()).toEqual([])
  })
})

describe('chart handle — dataZoom and restore', () => {
  it('a partial window is stored; a FULL window reads back as null', () => {
    const h = createChartHandle()
    h.dispatch({ type: 'dataZoom', start: 0.25, end: 0.75 })
    expect(h.zoom()).toEqual({ start: 0.25, end: 0.75 })
    h.dispatch({ type: 'dataZoom', start: 0, end: 1 })
    expect(h.zoom(), 'everything selected means no window').toBeNull()
  })
  it('an out-of-range window is clamped into 0..1 before it is stored', () => {
    const h = createChartHandle()
    // start below 0 slides the (unchanged) span back to the left edge.
    h.dispatch({ type: 'dataZoom', start: -0.25, end: 0.25 })
    expect(h.zoom()).toEqual({ start: 0, end: 0.5 })
    // A span WIDER than the data clamps to the whole range, which is `null`.
    h.dispatch({ type: 'dataZoom', start: -3, end: 0.5 })
    expect(h.zoom(), 'clamping to the full range means no window at all').toBeNull()
    // An end past 1 slides the span back from the right edge instead.
    h.dispatch({ type: 'dataZoom', start: 0.8, end: 1.4 })
    const slid = h.zoom()!
    expect(slid.start).toBeCloseTo(0.4, 9)
    expect(slid.end).toBe(1)
  })
  it('restore clears all four signals at once', () => {
    const h = createChartHandle()
    h.dispatch({ type: 'dataZoom', start: 0.1, end: 0.6 })
    h.dispatch({ type: 'highlight', index: 3 })
    h.dispatch({ type: 'select', index: 1 })
    h.dispatch({ type: 'legendUnselect', series: 0 })
    h.dispatch({ type: 'restore' })
    expect(h.zoom()).toBeNull()
    expect(h.hover()).toBe(-1)
    expect(h.selected()).toEqual([])
    expect(h.hidden()).toEqual([])
  })
})
