import { describe, expect, it } from 'vitest'
import { DEFAULT_ARCS } from './arc'
import { pieTipRowsWith, renderTooltipRows } from './chrome'
import { groupThousands } from './format'
import { tooltipNumber } from './tooltip-markup'

const measure = (text: string, size: number): number => text.length * size * 0.6
const OPTS = { fontSize: 14, fill: '#fff', border: '#ccc', text: '#6d6e73', pad: 10, radius: 4 }
const BOUNDS = { x: 0, y: 0, w: 400, h: 300 }

describe('groupThousands — the engine (native) twin of the web tooltipNumber', () => {
  it.each([0, 12, 999, 1000, 2500, 1234.5, -1234567, 1e9, 0.25])('%s', (v) => {
    expect(groupThousands(v)).toBe(tooltipNumber(v))
  })
})

describe('renderTooltipRows — ECharts default tooltip layout', () => {
  const rows = ['Traffic', '#ff0000', 'Search', '1,048', '#00ff00', 'Direct', '735']
  const cmds = renderTooltipRows(rows, { x: 50, y: 50 }, BOUNDS, OPTS, measure, true)
  const texts = cmds.filter((c) => c.kind === 'text') as { text: string; align?: string; weight?: string }[]

  it('header, then per row a swatch, the name and the value bold at the right', () => {
    expect(texts.map((t) => t.text)).toEqual(['Traffic', 'Search', '1,048', 'Direct', '735'])
    expect(texts.filter((t) => t.weight === 'bold').map((t) => t.text)).toEqual(['1,048', '735'])
    expect(texts.filter((t) => t.align === 'end').map((t) => t.text)).toEqual(['1,048', '735'])
    const dots = cmds.filter((c) => c.kind === 'circle') as { fill?: string; radius: number }[]
    expect(dots.map((d) => [d.fill, d.radius])).toEqual([['#ff0000', 5], ['#00ff00', 5]])
  })

  it("an item tooltip is edged in its row's colour; otherwise the theme border", () => {
    const edge = (c: typeof cmds) => (c.find((x) => x.kind === 'polyline') as { stroke?: string }).stroke
    expect(edge(cmds)).toBe('#ff0000')
    expect(edge(renderTooltipRows(rows, { x: 50, y: 50 }, BOUNDS, OPTS, measure, false))).toBe('#ccc')
  })

  it('an empty header draws no header line and takes no space', () => {
    const noHead = renderTooltipRows(['', '#f00', 'A', '3'], { x: 50, y: 50 }, BOUNDS, OPTS, measure, true)
    const withHead = renderTooltipRows(['S', '#f00', 'A', '3'], { x: 50, y: 50 }, BOUNDS, OPTS, measure, true)
    const h = (c: typeof cmds) => (c.find((x) => x.kind === 'rect') as { rect: { h: number } }).rect.h
    expect((noHead.filter((c) => c.kind === 'text') as { text: string }[]).map((t) => t.text)).toEqual(['A', '3'])
    expect(h(withHead) - h(noHead)).toBe(24)
  })

  it('draws nothing for an empty tip (a miss dismisses)', () => {
    expect(renderTooltipRows([], { x: 0, y: 0 }, BOUNDS, OPTS, measure, true)).toEqual([])
  })
})

describe('pieTipRowsWith', () => {
  const slices = [{ value: 2500, label: 'Search', color: '#f00' }]
  const box = { x: 0, y: 0, w: 100, h: 100 }
  it("a hit is the series name, the slice's colour, name and grouped value", () => {
    expect(pieTipRowsWith(slices, box, 0, DEFAULT_ARCS, 60, 50, 'Traffic')).toEqual(['Traffic', '#f00', 'Search', '2,500'])
  })
  it('a miss is empty', () => {
    expect(pieTipRowsWith(slices, box, 0, DEFAULT_ARCS, -50, -50, 'Traffic')).toEqual([])
  })
})
