import { describe, expect, it } from 'vitest'
import { boxRect, circleRect, layoutLength, splitLayers } from './option-layers'
import { optionToSvg, planOption } from './option'
import type { EChartsOption } from './option'

const pie = (center: [string, string], radius: string, name = 'p') => ({ type: 'pie', name, center, radius, data: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }] })

describe('splitLayers — several charts in one option', () => {
  it('one chart is not layered', () => {
    expect(splitLayers({ series: [{ type: 'bar', data: [1] }, { type: 'line', data: [2] }] }, 400, 300)).toBeNull()
    expect(splitLayers({ series: [pie(['50%', '50%'], '50%')] }, 400, 300)).toBeNull()
    expect(splitLayers({ radar: { indicator: [] }, series: [{ type: 'radar', data: [] }, { type: 'radar', data: [] }] }, 400, 300)).toBeNull()
  })

  it('two pies are two layers, each where its center and radius put it', () => {
    const layers = splitLayers({ title: { text: 'T' }, legend: {}, series: [pie(['25%', '50%'], '40%', 'left'), pie(['75%', '50%'], '40%', 'right')] }, 400, 200)!
    expect(layers.map((l) => l.kind)).toEqual(['family', 'family'])
    // radius 40% of half the shorter side (100) = 40 px → a 80 px square around each centre
    expect(layers[0]!.rect).toEqual({ x: 60, y: 60, w: 80, h: 80 })
    expect(layers[1]!.rect).toEqual({ x: 260, y: 60, w: 80, h: 80 })
    expect(layers.map((l) => (l.option['series'] as { name: string }[])[0]!.name)).toEqual(['left', 'right'])
    // Title on the first layer; with no cartesian layer the legend stays there too.
    expect('title' in layers[0]!.option).toBe(true)
    expect('title' in layers[1]!.option).toBe(false)
    expect('legend' in layers[1]!.option).toBe(false)
  })

  it('a pie beside a line chart: the cartesian layer spans the box and keeps the legend', () => {
    const layers = splitLayers({ title: { text: 'T' }, legend: {}, xAxis: { data: ['a'] }, yAxis: {}, series: [{ type: 'line', data: [1] }, pie(['85%', '20%'], '15%')] }, 400, 300)!
    expect(layers.map((l) => l.kind)).toEqual(['cartesian', 'family'])
    expect(layers[0]!.rect).toEqual({ x: 0, y: 0, w: 400, h: 300 })
    expect('legend' in layers[0]!.option).toBe(true)
    expect('legend' in layers[1]!.option).toBe(false)
    // A family layer carries no axes.
    expect('xAxis' in layers[1]!.option).toBe(false)
  })

  it('series that share a coordinate system share a layer; standalone families each get one', () => {
    const layers = splitLayers({
      radar: { indicator: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
      series: [{ type: 'radar', data: [] }, { type: 'radar', data: [] }, { type: 'gauge', data: [{ value: 3 }] }, { type: 'funnel', data: [] }],
    }, 400, 300)!
    expect(layers.map((l) => l.kind)).toEqual(['radar', 'family', 'family'])
    expect((layers[0]!.option['series'] as unknown[]).length).toBe(2)
  })

  it('candlestick and volume bars on two grids stay one cartesian layer (the grids split it)', () => {
    expect(splitLayers({ grid: [{}, {}], series: [{ type: 'candlestick', data: [] }, { type: 'bar', data: [], xAxisIndex: 1 }] }, 400, 300)).toBeNull()
  })

  it('a family layer\'s box keys are consumed by the placement, so its compile does not name them', () => {
    const layers = splitLayers({ series: [{ type: 'funnel', left: 10, top: 20, width: 100, height: 80, data: [] }, pie(['75%', '50%'], '20%')] }, 400, 300)!
    expect(layers[0]!.rect).toEqual({ x: 10, y: 20, w: 100, h: 80 })
    const placed = (layers[0]!.option['series'] as Record<string, unknown>[])[0]!
    expect(['left', 'top', 'width', 'height'].filter((k) => k in placed)).toEqual([])
  })

  it('each family gets ECharts\' default box when it names none', () => {
    const rectOf = (type: string) => splitLayers({ series: [{ type, data: [] }, pie(['90%', '90%'], '5%')] }, 1000, 500)![0]!.rect
    // ECharts' funnel margins are 80 / 60 / 80 / 65 (its SSR puts a 300px chart's funnel bottom at 235).
    expect(rectOf('funnel')).toEqual({ x: 80, y: 60, w: 840, h: 375 })
    expect(rectOf('treemap')).toEqual({ x: 100, y: 50, w: 800, h: 400 })
    expect(rectOf('tree')).toEqual({ x: 120, y: 60, w: 760, h: 380 })
    expect(rectOf('sankey')).toEqual({ x: 50, y: 25, w: 750, h: 450 })
    expect(rectOf('graph')).toEqual({ x: 0, y: 0, w: 1000, h: 500 })
    expect(rectOf('map')).toEqual({ x: 0, y: 0, w: 1000, h: 500 })
    expect(rectOf('gauge')).toEqual({ x: 312.5, y: 62.5, w: 375, h: 375 })
    expect(rectOf('sunburst').w).toBe(375)
    // Chord: ECharts' default radius is ['70%', '80%'].
    expect(rectOf('chord').w).toBe(400)
    // Pie: [0, '50%'].
    expect(splitLayers({ series: [{ type: 'pie', data: [] }, { type: 'funnel', data: [] }] }, 1000, 500)![0]!.rect).toEqual({ x: 375, y: 125, w: 250, h: 250 })
  })

  it('whole-canvas overlays never ride on a layer', () => {
    const layers = splitLayers({ graphic: [{ type: 'rect' }], visualMap: {}, series: [pie(['25%', '50%'], '20%'), pie(['75%', '50%'], '20%')] }, 400, 300)!
    for (const l of layers) {
      expect('graphic' in l.option).toBe(false)
      expect('visualMap' in l.option).toBe(false)
    }
  })
})

describe('layout lengths and boxes', () => {
  it('reads pixels and percents', () => {
    expect(layoutLength(12, 400, 0)).toBe(12)
    expect(layoutLength('25%', 400, 0)).toBe(100)
    expect(layoutLength('30', 400, 0)).toBe(30)
    expect(layoutLength(undefined, 400, 7)).toBe(7)
    expect(layoutLength('nope', 400, 7)).toBe(7)
  })
  it('boxRect honours left/top/right/bottom/width/height and the keywords', () => {
    expect(boxRect({ left: 10, top: 20, right: 30, bottom: 40 }, 400, 300)).toEqual({ x: 10, y: 20, w: 360, h: 240 })
    expect(boxRect({ left: 'center', width: 100, top: 'bottom', height: 50 }, 400, 300)).toEqual({ x: 150, y: 250, w: 100, h: 50 })
    expect(boxRect({ right: 10, width: 100, bottom: 5, height: 20 }, 400, 300)).toEqual({ x: 290, y: 275, w: 100, h: 20 })
    expect(boxRect({}, 400, 300, { left: 80, top: 60, right: 80, bottom: 60 })).toEqual({ x: 80, y: 60, w: 240, h: 180 })
  })
  it('circleRect reads [inner, outer] radius and defaults the centre', () => {
    expect(circleRect({ radius: ['20%', '50%'] }, 200, 100, '75%')).toEqual({ x: 75, y: 25, w: 50, h: 50 })
    expect(circleRect({}, 200, 200, '75%')).toEqual({ x: 25, y: 25, w: 150, h: 150 })
  })
})

describe('the facade draws every layer', () => {
  const twoPies: EChartsOption = { animation: false, series: [pie(['25%', '50%'], '40%', 'left'), pie(['75%', '50%'], '40%', 'right')] }
  it('planOption routes a layered option to a layers plan, one plan per layer', () => {
    const plan = planOption(twoPies, { width: 400, height: 200 })
    expect(plan.kind).toBe('layers')
    if (plan.kind !== 'layers') return
    expect(plan.parts.map((p) => p.plan.kind)).toEqual(['family', 'family'])
    // Each pie compiled as a single series: no "only one pie is rendered" warning.
    for (const p of plan.parts) if (p.plan.kind === 'family') expect(p.plan.compiled.warnings).toEqual([])
  })
  it('optionToSvg composes both pies into one document', () => {
    const svg = optionToSvg(twoPies, { width: 400, height: 200 })
    expect(svg.match(/<svg/g)!.length).toBe(1)
    expect(svg).toContain('translate(60 60)')
    expect(svg).toContain('translate(260 60)')
  })
})
