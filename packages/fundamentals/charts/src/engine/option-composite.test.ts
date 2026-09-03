import { describe, expect, it } from 'vitest'
import { composeSvg, gridRect, resolveTimeline, splitGrids, timelineCommands, timelineSteps } from './option-composite'
import { optionToSvg, planOption } from './option'

const twoGrids = {
  title: { text: 'Two grids' },
  grid: [{ left: 40, right: 20, top: 20, height: '35%' }, { left: 40, right: 20, top: '60%', height: '35%' }],
  xAxis: [{ type: 'category', data: ['a', 'b'], gridIndex: 0 }, { type: 'category', data: ['a', 'b'], gridIndex: 1 }],
  yAxis: [{ gridIndex: 0 }, { gridIndex: 1 }],
  series: [{ type: 'bar', data: [1, 2] }, { type: 'line', data: [3, 4], xAxisIndex: 1, yAxisIndex: 1 }],
}

const timeline = {
  baseOption: { timeline: { data: ['2019', { value: '2020' }, '2021'], currentIndex: 1 }, title: { text: 'Sales' }, xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', name: 'sales' }] },
  options: [{ series: [{ data: [1, 2] }] }, { title: { subtext: 'step two' }, series: [{ data: [3, 4] }] }, { series: [{ data: [5, 6] }] }],
}

describe('timeline', () => {
  it('reads the step labels and clamps currentIndex', () => {
    const steps = timelineSteps(timeline.baseOption)!
    expect(steps.labels).toEqual(['2019', '2020', '2021'])
    expect(steps.current).toBe(1)
    expect(timelineSteps({ timeline: { data: ['x'], currentIndex: 9 } })!.current).toBe(0)
    expect(timelineSteps({ series: [] })).toBeNull()
  })
  it('resolves a step: series merge BY INDEX over the base, objects merge shallowly, timeline keys vanish', () => {
    const r = resolveTimeline(timeline, 1)
    expect(r.warnings).toEqual([])
    const series = r.option['series'] as { type: string; name: string; data: number[] }[]
    expect(series[0]).toEqual({ type: 'bar', name: 'sales', data: [3, 4] })
    expect(r.option['title']).toEqual({ text: 'Sales', subtext: 'step two' })
    expect('baseOption' in r.option).toBe(false)
    expect('timeline' in r.option).toBe(false)
    // The caller's baseOption is untouched.
    expect('timeline' in timeline.baseOption).toBe(true)
    expect('options' in r.option).toBe(false)
    // Default step = currentIndex.
    expect((resolveTimeline(timeline).option['series'] as { data: number[] }[])[0]!.data).toEqual([3, 4])
  })
  it('a step past the list warns by name and renders the base', () => {
    const r = resolveTimeline(timeline, 7)
    expect(r.warnings.map((w) => w.code)).toEqual(['timeline-step-out-of-range'])
    expect((r.option['series'] as { data?: number[] }[])[0]!.data).toBeUndefined()
  })
  it('an option without a timeline comes back untouched', () => {
    const o = { series: [{ type: 'bar', data: [1] }] }
    expect(resolveTimeline(o).option).toBe(o)
  })
  it('optionToSvg reserves the strip and draws every label, the current one in the accent', () => {
    const svg = optionToSvg(timeline, { width: 400, height: 240 })
    expect(svg.startsWith('<svg')).toBe(true)
    for (const l of ['2019', '2020', '2021']) expect(svg).toContain('>' + l + '<')
    expect(svg).toContain('#2563eb')
    // The chosen step's bars are what got rendered: step 1 has data [3, 4]; step 2 would differ in bar height.
    expect(optionToSvg(timeline, { width: 400, height: 240, timelineIndex: 2 })).not.toBe(svg)
    const cmds = timelineCommands(timelineSteps(timeline.baseOption)!, 400, 200, 40)
    // One accent dot per step plus a white core on the two non-current ones.
    expect(cmds.filter((c) => c.kind === 'circle')).toHaveLength(5)
  })
})

describe('multi-grid', () => {
  it('gridRect parses px and % on every side, with ECharts defaults', () => {
    expect(gridRect({}, 400, 300)).toEqual({ x: 40, y: 60, w: 320, h: 180 })
    expect(gridRect({ left: 10, top: '10%', width: 100, height: 50 }, 400, 300)).toEqual({ x: 10, y: 30, w: 100, h: 50 })
    expect(gridRect({ right: 0, bottom: 0 }, 400, 300)).toEqual({ x: 40, y: 60, w: 360, h: 240 })
  })
  it('splits axes and series onto their grids and relocalises the axis indices', () => {
    const parts = splitGrids(twoGrids, 400, 300)!
    expect(parts).toHaveLength(2)
    const s0 = parts[0]!.option['series'] as Record<string, unknown>[]
    const s1 = parts[1]!.option['series'] as Record<string, unknown>[]
    expect(s0.map((s) => s['type'])).toEqual(['bar'])
    expect(s1.map((s) => s['type'])).toEqual(['line'])
    expect('xAxisIndex' in s1[0]!).toBe(false)
    expect('yAxisIndex' in s1[0]!).toBe(false)
    expect(parts[1]!.option['title']).toBeUndefined()
    expect(parts[0]!.option['title']).toEqual({ text: 'Two grids' })
    expect(parts[1]!.rect.y).toBe(180)
    expect(splitGrids({ grid: { left: 10 }, series: [] }, 400, 300)).toBeNull()
  })
  it('planOption returns one plan per grid and the corpus-clean parts compile without warnings', () => {
    const plan = planOption(twoGrids, { width: 400, height: 300 })
    expect(plan.kind).toBe('grids')
    if (plan.kind !== 'grids') return
    expect(plan.parts).toHaveLength(2)
    for (const p of plan.parts) {
      expect(p.plan.kind).toBe('cartesian')
      if (p.plan.kind === 'cartesian') expect(p.plan.compiled.warnings).toEqual([])
    }
  })
  it('optionToSvg lays both grids into ONE document at their rects, one accessible title', () => {
    const svg = optionToSvg(twoGrids, { width: 400, height: 300 })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.match(/<svg/g)).toHaveLength(1)
    expect(svg.match(/<title/g)).toHaveLength(1)
    expect(svg).toContain('translate(40 20)')
    expect(svg).toContain('translate(40 180)')
    expect(svg).toContain('<rect')
    expect(svg).toContain('<polyline')
  })
  it('composeSvg strips nested titles and places parts by offset', () => {
    const inner = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" role="img" aria-labelledby="a"><title id="a">x</title><rect x="0" y="0" width="1" height="1"/></svg>'
    const out = composeSvg([{ svg: inner, x: 5, y: 7 }], [], 20, 20, { title: 'outer' })
    expect(out.match(/<title/g)).toHaveLength(1)
    expect(out).toContain('outer')
    expect(out).toContain('<g transform="translate(5 7)"><rect')
  })
})
