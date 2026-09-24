import { describe, expect, it } from 'vitest'
import { compileFamily, familyToSvg } from './option-family'
import { sankeyToSvg } from './family-svg'

/**
 * `orient: 'vertical'` (sankey, calendar) and `parallel.layout: 'vertical'`
 * lay the family out top-to-bottom: the horizontal layout reflected across
 * the diagonal. The svg proves it geometrically — a vertical sankey's node
 * rects run down the page instead of across it.
 */
const sankey = (orient?: string) => ({
  series: [{ type: 'sankey', ...(orient === undefined ? {} : { orient }), data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], links: [{ source: 'a', target: 'b', value: 5 }, { source: 'b', target: 'c', value: 5 }] }],
})

const rects = (svg: string): { x: number; y: number; w: number; h: number }[] =>
  [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) }))

describe('vertical orient', () => {
  it('sankey / calendar / parallel no longer warn and carry the orient into their plans', () => {
    const s = compileFamily(sankey('vertical'))!
    expect(s.warnings).toEqual([])
    expect(s.plan).toMatchObject({ kind: 'sankey', orient: 'vertical' })
    expect(compileFamily(sankey())!.plan).not.toHaveProperty('orient')
    const c = compileFamily({ calendar: { range: '2024-01', orient: 'vertical' }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2024-01-02', 3]] }] })!
    expect(c.warnings).toEqual([])
    expect(c.plan).toMatchObject({ kind: 'calendar', orient: 'vertical' })
    const p = compileFamily({ parallel: { layout: 'vertical' }, parallelAxis: [{ dim: 0, name: 'a' }, { dim: 1, name: 'b' }], series: [{ type: 'parallel', data: [[1, 2], [3, 4]] }] })!
    expect(p.warnings).toEqual([])
    expect(p.plan).toMatchObject({ kind: 'parallel', orient: 'vertical' })
  })

  it('a vertical sankey runs down the page: node rects stack in y where the horizontal ones stack in x', () => {
    const horizontal = rects(sankeyToSvg({ nodes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], links: [{ source: 'a', target: 'b', value: 5 }, { source: 'b', target: 'c', value: 5 }], width: 400, height: 200 }))
    const vertical = rects(sankeyToSvg({ nodes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], links: [{ source: 'a', target: 'b', value: 5 }, { source: 'b', target: 'c', value: 5 }], width: 400, height: 200, orient: 'vertical' }))
    expect(horizontal.length).toBeGreaterThanOrEqual(3)
    expect(vertical.length).toBe(horizontal.length)
    const xs = new Set(horizontal.map((r) => r.x))
    const ys = new Set(vertical.map((r) => r.y))
    expect(xs.size, 'horizontal nodes sit at distinct x').toBeGreaterThanOrEqual(3)
    expect(ys.size, 'vertical nodes sit at distinct y').toBeGreaterThanOrEqual(3)
    // Every vertical node is the transpose of a horizontal one, laid out in the transposed box.
    for (const r of vertical) expect(r.x + r.w, 'inside the 400-wide canvas').toBeLessThanOrEqual(400.01)
    // The option facade's svg path carries the orient too.
    const viaOption = rects(familyToSvg(compileFamily(sankey('vertical'))!.plan, { width: 400, height: 200 }))
    expect(new Set(viaOption.map((r) => r.y)).size).toBeGreaterThanOrEqual(3)
  })
})
