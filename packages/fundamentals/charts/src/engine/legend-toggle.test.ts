import { describe, expect, it } from 'vitest'
import { hideHiddenSeries, isHiddenSeries, legendHitIndex, legendToggle, pagerHit } from './legend-toggle'
import type { LegendPager } from './legend'
import type { Series } from './render'

const bars: Series = { kind: 'bars', values: [1, 2, 3], color: '#111', width: 1, radius: 0, label: 'a', showValues: true }
const stacked: Series = { kind: 'stacked', values: [4, 5], color: '#222', width: 1, radius: 0, label: 'b', radii: [1, 2], axis: 'right' }
const line: Series = { kind: 'line', values: [7, 8], color: '#333', width: 2, radius: 3, label: 'c', effect: true }

describe('legendToggle / isHiddenSeries — the hidden set', () => {
  it('adds an absent index and removes a present one, returning a NEW array each time', () => {
    const a = legendToggle([], 1)
    expect(a).toEqual([1])
    const b = legendToggle(a, 0)
    expect(b).toEqual([1, 0])
    expect(a).toEqual([1])
    expect(legendToggle(b, 1)).toEqual([0])
    expect(isHiddenSeries(b, 1)).toBe(true)
    expect(isHiddenSeries(b, 2)).toBe(false)
  })
})

describe('hideHiddenSeries — what a hidden series contributes', () => {
  it('nothing hidden → the same array (no copy)', () => {
    const s = [bars, line]
    expect(hideHiddenSeries(s, [])).toBe(s)
  })
  it('a hidden plain series keeps its slot, label and colour but has no values and draws no value labels', () => {
    const out = hideHiddenSeries([bars, line], [0])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ kind: 'bars', values: [], color: '#111', label: 'a', showValues: false })
    expect(out[0]!.radii).toBeUndefined()
    expect(out[1]).toBe(line)
  })
  it('a hidden stacked/grouped series is ZEROED, not emptied, so sibling layouts stay index-aligned', () => {
    const out = hideHiddenSeries([bars, stacked], [1])
    expect(out[1]).toMatchObject({ kind: 'stacked', values: [0, 0], axis: 'right', showValues: false })
    expect(out[1]!.radii).toBeUndefined()
    expect(out[0]).toBe(bars)
  })
  it('carries the optional channels that describe the SLOT (axis, effect, symbol, curve) through', () => {
    const curve = (p: { x: number; y: number }[]) => p
    const s: Series = { ...line, curve, symbol: 'circle', symbolRepeat: true }
    const out = hideHiddenSeries([s], [0])
    expect(out[0]!.curve).toBe(curve)
    expect(out[0]!.effect).toBe(true)
    expect(out[0]!.symbol).toBe('circle')
    expect(out[0]!.symbolRepeat).toBe(true)
  })
})

describe('legendHitIndex / pagerHit — the tap', () => {
  const boxes = [
    { x: 10, y: 5, w: 40, h: 12 },
    { x: 60, y: 5, w: 40, h: 12 },
  ]
  it('reports the entry under the point, edges inclusive, else -1', () => {
    expect(legendHitIndex(boxes, 12, 6)).toBe(0)
    expect(legendHitIndex(boxes, 100, 17)).toBe(1)
    expect(legendHitIndex(boxes, 55, 6)).toBe(-1)
    expect(legendHitIndex([], 1, 1)).toBe(-1)
  })
  const pager: LegendPager = {
    page: 1,
    pages: 3,
    hasPrev: true,
    prev: { x: 200, y: 5, w: 14, h: 12 },
    hasNext: true,
    next: { x: 216, y: 5, w: 14, h: 12 },
  }
  it('a live arrow yields its page delta; a dead one, or a miss, yields 0', () => {
    expect(pagerHit(pager, 205, 8)).toBe(-1)
    expect(pagerHit(pager, 220, 8)).toBe(1)
    expect(pagerHit(pager, 150, 8)).toBe(0)
    expect(pagerHit({ ...pager, hasPrev: false }, 205, 8)).toBe(0)
    expect(pagerHit({ ...pager, hasNext: false }, 220, 8)).toBe(0)
  })
})
