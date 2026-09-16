// Every family entry ends in the same two decisions: the vertical orientation
// arm, and the accessible description it generates when the caller supplies
// none. The description is the ONLY thing a screen-reader user gets from an
// `<svg>`, and its no-data and untitled halves are exactly the states a live
// chart passes through, so an unasserted arm there is an a11y regression
// waiting rather than a cosmetic gap.
import { describe, expect, it } from 'vitest'
import { calendarToSvg, candlestickToSvg, gaugeToSvg, heatmapToSvg, parallelToSvg, treemapToSvg } from './family-svg'

const desc = (svg: string): string => {
  const m = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(svg)
  return m === null ? '' : m[1]!
}

describe('candlestick — the description it generates', () => {
  const bars = [
    { open: 1, high: 4, low: 0, close: 3 },
    { open: 3, high: 6, low: 2, close: 5 },
  ]

  it('summarises the period count, range and last close', () => {
    const d = desc(candlestickToSvg({ data: bars, open: (c) => c.open, high: (c) => c.high, low: (c) => c.low, close: (c) => c.close, title: 'Prices' }))
    expect(d).toContain('Prices')
    expect(d).toContain('2 periods')
    expect(d).toContain('last close 5')
  })

  it('says so plainly when there is nothing to plot, titled or not', () => {
    const named = desc(candlestickToSvg({ data: [], open: () => 0, high: () => 0, low: () => 0, close: () => 0, title: 'Prices' }))
    expect(named).toBe('Prices: no data.')
    // Untitled, `svgTail` never calls the deriver at all — there is no
    // description rather than a generically-named one.
    const bare = desc(candlestickToSvg({ data: [], open: () => 0, high: () => 0, low: () => 0, close: () => 0 }))
    expect(bare).toBe('')
  })

  it('an explicit description wins over the generated one', () => {
    const d = desc(candlestickToSvg({ data: [], open: () => 0, high: () => 0, low: () => 0, close: () => 0, description: 'mine' }))
    expect(d).toBe('mine')
  })
})

describe('heatmap — the description it generates', () => {
  const rows = [{ x: 'a', y: 'r', v: 1 }, { x: 'b', y: 'r', v: 3 }]
  const opts = { data: rows, x: (d: (typeof rows)[number]) => d.x, y: (d: (typeof rows)[number]) => d.y, value: (d: (typeof rows)[number]) => d.v }

  it('summarises the grid shape and value range', () => {
    const d = desc(heatmapToSvg({ ...opts, title: 'Load' }))
    expect(d).toContain('Load')
    expect(d).toContain('2 columns by 1 rows')
  })

  it('says so when empty, and describes nothing at all when untitled', () => {
    expect(desc(heatmapToSvg({ ...opts, data: [], title: 'Load' }))).toBe('Load: no data.')
    expect(desc(heatmapToSvg({ ...opts, data: [] }))).toBe('')
  })

  it('a non-finite value is zeroed rather than poisoning the range', () => {
    const d = desc(heatmapToSvg({ ...opts, data: [{ x: 'a', y: 'r', v: Number.NaN }] }))
    expect(d).not.toContain('NaN')
  })
})

describe('gauge — the description it generates', () => {
  it('reads the value against its maximum when titled, and is silent otherwise', () => {
    expect(desc(gaugeToSvg({ value: 30, max: 60, title: 'CPU' }))).toBe('CPU: 30 of 60.')
    expect(desc(gaugeToSvg({ value: 30, max: 60 }))).toBe('')
  })
})

describe('treemap — the description it generates', () => {
  const node = [{ name: 'a', value: 3 }, { name: 'b', value: 7 }]

  it('names the largest leaf when titled', () => {
    const d = desc(treemapToSvg({ data: node, title: 'Disk' }))
    expect(d).toContain('2 leaves')
    expect(d).toContain('largest b')
  })

  it('generates nothing at all when untitled — a bare summary would not help', () => {
    expect(desc(treemapToSvg({ data: node }))).toBe('')
  })

  it('reports `none` rather than throwing when there is no leaf to name', () => {
    expect(desc(treemapToSvg({ data: [], title: 'Disk' }))).toContain('none')
  })
})

describe('orientation — the transposed arm renders the same content', () => {
  it('a vertical calendar produces a document, as the horizontal one does', () => {
    const args = { start: '2026-01-01', end: '2026-01-20', values: { '2026-01-02': 5 } }
    const h = calendarToSvg(args)
    const v = calendarToSvg({ ...args, orient: 'vertical' })
    expect(h.startsWith('<svg')).toBe(true)
    expect(v.startsWith('<svg')).toBe(true)
    // Transposed, not identical — otherwise the arm did nothing.
    expect(v).not.toBe(h)
  })

  it('a vertical parallel plot produces a document, and keeps its description', () => {
    const args = {
      axes: [{ name: 'p' }, { name: 'q' }],
      rows: [[1, 2], [3, 4]],
      title: 'Runs',
    }
    const v = parallelToSvg({ ...args, orient: 'vertical' })
    expect(v.startsWith('<svg')).toBe(true)
    expect(desc(v)).toContain('2 rows across 2 axes')
    // Untitled, the entry generates no description rather than a bare one.
    expect(desc(parallelToSvg({ axes: args.axes, rows: args.rows }))).toBe('')
  })
})
