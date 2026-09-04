import { describe, expect, it } from 'vitest'
import { renderLegend } from './legend'
import type { LegendEntry } from './legend'
import { renderTitle } from './title'
import type { Double } from './types'

const measure = (t: string, _s: Double): Double => t.length * 6.0
const opts = { fontSize: 10.0, labelColor: '#333', swatch: 10.0, gap: 10.0, orientation: 'horizontal' as const }
const entries = (n: number): LegendEntry[] =>
  Array.from({ length: n }, (_, i) => ({ label: `series-${i}`, color: '#000' }))
const rowH = 20.0

describe('scrollable legend', () => {
  it('uncapped legends are byte-identical to before (no pager, all boxes real)', () => {
    const l = renderLegend(entries(12), { x: 0, y: 0, w: 300, h: 100 }, opts, measure)
    expect(l.pager).toBeUndefined()
    expect(l.boxes.every((b) => b.w > 0)).toBe(true)
    expect(l.height).toBeGreaterThan(rowH)
  })

  it('a cap that is not exceeded changes nothing', () => {
    const a = renderLegend(entries(3), { x: 0, y: 0, w: 600, h: 100 }, opts, measure)
    const b = renderLegend(entries(3), { x: 0, y: 0, w: 600, h: 100 }, { ...opts, maxRows: 2 }, measure)
    expect(b.pager).toBeUndefined()
    expect(b.height).toBe(a.height)
    expect(b.cmds).toEqual(a.cmds)
  })

  it('caps the height, pages the rest, and keeps boxes index-aligned', () => {
    const l = renderLegend(entries(12), { x: 0, y: 0, w: 300, h: 100 }, { ...opts, maxRows: 1 }, measure)
    expect(l.height).toBe(rowH)
    expect(l.pager).toBeDefined()
    expect(l.pager!.pages).toBeGreaterThan(1)
    expect(l.pager!.page).toBe(0)
    expect(l.boxes).toHaveLength(12)
    const visible = l.boxes.filter((b) => b.w > 0)
    const hidden = l.boxes.filter((b) => b.w < 0)
    expect(visible.length).toBeGreaterThan(0)
    expect(hidden.length).toBeGreaterThan(0)
    // Hidden entries are not DRAWN either: fewer swatches than entries.
    expect(l.cmds.filter((c) => c.kind === 'rect')).toHaveLength(visible.length)
  })

  it('the pager reserves width so the last row never runs under the arrows', () => {
    const l = renderLegend(entries(12), { x: 0, y: 0, w: 300, h: 100 }, { ...opts, maxRows: 1 }, measure)
    const pagerLeft = l.pager!.hasPrev ? l.pager!.prev.x : 300 - (10 * 5 + 10)
    for (const b of l.boxes) if (b.w > 0) expect(b.x + b.w).toBeLessThanOrEqual(pagerLeft + 1e-9)
  })

  it('page 1 shows different entries than page 0, and arrows reflect the ends', () => {
    const p0 = renderLegend(entries(12), { x: 0, y: 0, w: 300, h: 100 }, { ...opts, maxRows: 1, page: 0 }, measure)
    const p1 = renderLegend(entries(12), { x: 0, y: 0, w: 300, h: 100 }, { ...opts, maxRows: 1, page: 1 }, measure)
    const vis = (l: typeof p0) => l.boxes.map((b, i) => (b.w > 0 ? i : -1)).filter((i) => i >= 0)
    expect(vis(p1)[0]).toBeGreaterThan(vis(p0)[vis(p0).length - 1]!)
    expect(p0.pager!.hasPrev).toBe(false)
    expect(p0.pager!.hasNext).toBe(true)
    const last = renderLegend(entries(12), { x: 0, y: 0, w: 300, h: 100 }, { ...opts, maxRows: 1, page: 99 }, measure)
    expect(last.pager!.page).toBe(last.pager!.pages - 1)
    expect(last.pager!.hasNext).toBe(false)
    expect(last.pager!.hasPrev).toBe(true)
  })

  it('every entry is reachable across the pages (nothing is lost)', () => {
    const seen = new Set<number>()
    const first = renderLegend(entries(12), { x: 0, y: 0, w: 300, h: 100 }, { ...opts, maxRows: 1 }, measure)
    for (let p = 0; p < first.pager!.pages; p++) {
      const l = renderLegend(entries(12), { x: 0, y: 0, w: 300, h: 100 }, { ...opts, maxRows: 1, page: p }, measure)
      l.boxes.forEach((b, i) => { if (b.w > 0) seen.add(i) })
    }
    expect(seen.size).toBe(12)
  })

  it('vertical legends page by line', () => {
    const l = renderLegend(entries(10), { x: 0, y: 0, w: 300, h: 100 }, { ...opts, orientation: 'vertical', maxRows: 3 }, measure)
    expect(l.height).toBe(3 * rowH)
    expect(l.pager!.pages).toBe(4)
  })
})

describe('title block', () => {
  const t = { fontSize: 14.0, color: '#111' }
  it('empty text and subtitle consume nothing', () => {
    expect(renderTitle('', undefined, { x: 0, y: 0, w: 100, h: 50 }, t)).toEqual({ cmds: [], height: 0.0 })
  })
  it('title only: one command, height = size + gap', () => {
    const l = renderTitle('Revenue', undefined, { x: 0, y: 0, w: 100, h: 50 }, t)
    expect(l.cmds).toHaveLength(1)
    expect(l.height).toBe(14.0 + 8.0)
  })
  it('subtitle stacks below at 80% size; middle alignment centres both', () => {
    const l = renderTitle('Revenue', 'FY26', { x: 0, y: 0, w: 100, h: 50 }, { ...t, align: 'middle' })
    expect(l.cmds).toHaveLength(2)
    const a = l.cmds[0]!
    const b = l.cmds[1]!
    if (a.kind !== 'text' || b.kind !== 'text') throw new Error('title commands must be text')
    expect(a.at.x).toBe(50)
    expect(b.size).toBeCloseTo(11.2, 9)
    expect(b.at.y).toBeGreaterThan(a.at.y)
    expect(l.height).toBeCloseTo(14 + 4 + 11.2 + 8, 9)
  })
})
