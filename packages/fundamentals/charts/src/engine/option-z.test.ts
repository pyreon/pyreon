/**
 * ECharts' `zlevel` / `z` on cartesian series: a higher one paints over a
 * lower one. The legend, palette and hit test keep series order; only the
 * paint order moves.
 */
import { describe, expect, it } from 'vitest'
import { compileOption } from './option'
import { renderChart, validDrawOrder } from './render'
import type { EChartsOption } from './option'

const measure = (t: string) => t.length * 6
const bars = (a: Record<string, unknown>, b: Record<string, unknown>): EChartsOption => ({
  animation: false,
  xAxis: { type: 'category', data: ['x', 'y'] },
  yAxis: { type: 'value', min: 0, max: 10 },
  series: [
    { type: 'line', name: 'A', data: [5, 6], lineStyle: { color: '#aa0000' }, ...a },
    { type: 'line', name: 'B', data: [5, 6], lineStyle: { color: '#0000bb' }, ...b },
  ],
})
/** Index in the draw list of the first command stroked with a colour. */
const firstAt = (cmds: unknown[], color: string): number => cmds.findIndex((c) => JSON.stringify(c).includes(color))

describe('series z / zlevel', () => {
  it('no z: series paint in order, and no draw order is set', () => {
    const c = compileOption(bars({}, {}))
    expect(c.spec.drawOrder).toBeUndefined()
    const cmds = renderChart(c.spec, measure)
    expect(firstAt(cmds, '#aa0000')).toBeLessThan(firstAt(cmds, '#0000bb'))
  })

  it('a higher z on the first series paints it last', () => {
    const c = compileOption(bars({ z: 5 }, {}))
    expect(c.spec.drawOrder).toEqual([1, 0])
    const cmds = renderChart(c.spec, measure)
    expect(firstAt(cmds, '#aa0000')).toBeGreaterThan(firstAt(cmds, '#0000bb'))
    // Only the paint order moved: the legend and series stay A, B.
    expect(c.spec.series.map((s) => s.label)).toEqual(['A', 'B'])
  })

  it('zlevel outranks z', () => {
    expect(compileOption(bars({ zlevel: 1, z: 0 }, { z: 9 })).spec.drawOrder).toEqual([1, 0])
    // B on a higher zlevel already paints last: no reorder needed.
    expect(compileOption(bars({ z: 9 }, { zlevel: 1 })).spec.drawOrder).toBeUndefined()
  })

  it('z and zlevel are known keys: no "no mapping" warning', () => {
    expect(compileOption(bars({ z: 1, zlevel: 0 }, {})).warnings.map((w) => w.path)).toEqual([])
  })

  it('validDrawOrder accepts only a permutation of every series', () => {
    expect(validDrawOrder([1, 0], 2)).toEqual([1, 0])
    expect(validDrawOrder([0], 2)).toEqual([])
    expect(validDrawOrder([0, 0], 2)).toEqual([])
    expect(validDrawOrder([0, 2], 2)).toEqual([])
    expect(validDrawOrder([-1, 0], 2)).toEqual([])
  })
})
