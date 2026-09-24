// The composite facade's EDGE inputs: a timeline with no steps, a step that
// overrides a scalar, a grid with no axis of its own, a single-step strip, and
// a part whose svg cannot be spliced. Each is paired with the ordinary input
// beside it so a guard that stopped firing changes the answer.
import { describe, expect, it } from 'vitest'
import { composeSvg, gridRect, resolveTimeline, splitGrids, timelineCommands, timelineSteps } from './option-composite'

type Obj = Record<string, unknown>

describe('timelineSteps — the step list', () => {
  it('reads an object step by `value`, then by `name`, and empties out when it has neither', () => {
    const s = timelineSteps({ timeline: { data: ['plain', { value: 'v' }, { name: 'n' }, { other: 1 }] } })!
    expect(s.labels).toEqual(['plain', 'v', 'n', ''])
  })

  it('a timeline with no `data` has no steps at all — not one empty one', () => {
    const s = timelineSteps({ timeline: { currentIndex: 2 } })!
    expect(s.labels).toEqual([])
    // With no steps the clamp floors at 0 rather than following currentIndex.
    expect(s.current).toBe(0)
    expect(timelineSteps({ timeline: { data: 'nope' } })!.labels).toEqual([])
  })

  it('currentIndex defaults to 0, accepts a numeric STRING, and floors a fraction', () => {
    expect(timelineSteps({ timeline: { data: ['a', 'b'] } })!.current).toBe(0)
    expect(timelineSteps({ timeline: { data: ['a', 'b'], currentIndex: '1' } })!.current).toBe(1)
    expect(timelineSteps({ timeline: { data: ['a', 'b', 'c'], currentIndex: 1.9 } })!.current).toBe(1)
    expect(timelineSteps({ timeline: { data: ['a', 'b'], currentIndex: -3 } })!.current).toBe(0)
    // A non-finite index is unreadable and falls back to 0.
    expect(timelineSteps({ timeline: { data: ['a', 'b'], currentIndex: Number.NaN } })!.current).toBe(0)
  })

  it('reports autoPlay + playInterval, defaulting the interval to ECharts\' 2000ms', () => {
    const d = timelineSteps({ timeline: { data: ['a'] } })!
    expect(d.autoPlay).toBe(false)
    expect(d.playInterval).toBe(2000)
    const on = timelineSteps({ timeline: { data: ['a'], autoPlay: true, playInterval: 500 } })!
    expect(on.autoPlay).toBe(true)
    expect(on.playInterval).toBe(500)
  })
})

describe('resolveTimeline — a step merged over the base', () => {
  it('a timeline at the TOP level (no baseOption) still resolves, pulling the sibling keys in as the base', () => {
    const r = resolveTimeline({
      timeline: { data: ['one', 'two'], currentIndex: 1 },
      xAxis: { type: 'category', data: ['a'] },
      series: [{ type: 'bar', name: 'sales' }],
      options: [{ series: [{ data: [1] }] }, { series: [{ data: [9] }] }],
    })
    expect(r.warnings).toEqual([])
    expect((r.option['series'] as Obj[])[0]).toEqual({ type: 'bar', name: 'sales', data: [9] })
    // The timeline component itself never reaches a compiler.
    expect('timeline' in r.option).toBe(false)
    expect(r.option['xAxis']).toEqual({ type: 'category', data: ['a'] })
  })

  it('a key set in BOTH baseOption and at the top level keeps the baseOption one', () => {
    const r = resolveTimeline({
      baseOption: { title: { text: 'from base' }, series: [{ type: 'bar' }] },
      title: { text: 'from top' },
      options: [{ series: [{ data: [1] }] }],
    })
    expect(r.option['title']).toEqual({ text: 'from base' })
    // A key only at the top level still arrives.
    const only = resolveTimeline({ baseOption: { series: [{ type: 'bar' }] }, yAxis: { type: 'value' }, options: [{}] })
    expect(only.option['yAxis']).toEqual({ type: 'value' })
  })

  it('a step whose value is a SCALAR replaces the base value outright; two objects merge shallowly', () => {
    const r = resolveTimeline({
      baseOption: { title: { text: 'base', subtext: 'kept' }, backgroundColor: '#000', series: [] },
      options: [{ title: { text: 'step' }, backgroundColor: '#fff' }],
    })
    expect(r.option['title']).toEqual({ text: 'step', subtext: 'kept' })
    expect(r.option['backgroundColor']).toBe('#fff')
  })

  it('a step may add a series the base does not have, and may give series as a bare object', () => {
    const extra = resolveTimeline({ baseOption: { series: [{ type: 'bar' }] }, options: [{ series: [{ type: 'bar' }, { type: 'line', data: [1] }] }] })
    expect((extra.option['series'] as Obj[])).toHaveLength(2)
    expect((extra.option['series'] as Obj[])[1]).toEqual({ type: 'line', data: [1] })
    const single = resolveTimeline({ baseOption: { series: { type: 'bar' } }, options: [{ series: { data: [4] } }] })
    expect((single.option['series'] as Obj[])[0]).toEqual({ type: 'bar', data: [4] })
    // A series key that is neither an array nor an object contributes no entries.
    const junk = resolveTimeline({ baseOption: { series: [{ type: 'bar' }] }, options: [{ series: 'nope' }] })
    expect((junk.option['series'] as Obj[])).toEqual([{ type: 'bar' }])
  })

  it('a TOP-LEVEL timeline with steps but no options[] warns; one with no steps at all says nothing', () => {
    const withSteps = resolveTimeline({ timeline: { data: ['a', 'b'] }, series: [{ type: 'bar', data: [1] }] })
    expect(withSteps.warnings.map((w) => w.code)).toEqual(['timeline-step-out-of-range'])
    // No baseOption AND no labels: there is no strip and nothing to warn about.
    const bare = resolveTimeline({ timeline: {}, series: [{ type: 'bar', data: [1] }] })
    expect(bare.warnings).toEqual([])
    expect((bare.option['series'] as Obj[])[0]).toEqual({ type: 'bar', data: [1] })
  })

  it('a timeline with NO options[] warns by name and renders the base', () => {
    const r = resolveTimeline({ baseOption: { timeline: { data: ['a'] }, series: [{ type: 'bar', data: [1] }] } })
    expect(r.warnings.map((w) => w.code)).toEqual(['timeline-step-out-of-range'])
    expect((r.option['series'] as Obj[])[0]).toEqual({ type: 'bar', data: [1] })
    // And when `options` is present but unreadable, the same warning fires.
    expect(resolveTimeline({ baseOption: { series: [] }, options: 'nope' }).warnings).toHaveLength(1)
  })

  it('a baseOption with no timeline at all resolves silently — there is no strip to be out of range of', () => {
    const r = resolveTimeline({ baseOption: { series: [{ type: 'bar', data: [1] }] }, options: [{ series: [{ data: [2] }] }] })
    expect(r.warnings).toEqual([])
    // With no timeline the step index defaults to 0.
    expect((r.option['series'] as Obj[])[0]).toEqual({ type: 'bar', data: [2] })
  })
})

describe('gridRect — px, percent and an unreadable side', () => {
  it('an unreadable percentage falls back to the ECharts default rather than to NaN', () => {
    expect(gridRect({ left: 'x%' }, 400, 300).x).toBe(40)
    expect(gridRect({ left: '25%' }, 400, 300).x).toBe(100)
    expect(gridRect({ top: 'nonsense' }, 400, 300).y).toBe(60)
    const r = gridRect({ width: 'x%', height: 'x%' }, 400, 300)
    expect(Number.isNaN(r.w)).toBe(false)
    expect(Number.isNaN(r.h)).toBe(false)
  })

  it('never reports a negative extent when the sides overlap', () => {
    const r = gridRect({ left: 300, right: 300, top: 250, bottom: 250 }, 400, 300)
    expect(r.w).toBe(0)
    expect(r.h).toBe(0)
  })
})

describe('splitGrids — axes, series and the grids that own them', () => {
  it('a grid with NO axes of its own drops both axis keys rather than inheriting the other grid\'s', () => {
    const parts = splitGrids({
      grid: [{ top: 0, height: 100 }, { top: 120, height: 100 }],
      xAxis: [{ type: 'category', data: ['a'], gridIndex: 0 }],
      yAxis: [{ gridIndex: 0 }],
      series: [{ type: 'bar', data: [1] }],
    }, 400, 300)!
    expect('xAxis' in parts[0]!.option).toBe(true)
    expect('xAxis' in parts[1]!.option).toBe(false)
    expect('yAxis' in parts[1]!.option).toBe(false)
    expect(parts[1]!.option['series']).toEqual([])
  })

  it('a grid with SEVERAL axes keeps the array; one axis is flattened to a bare object', () => {
    const parts = splitGrids({
      grid: [{ top: 0, height: 100 }, { top: 120, height: 100 }],
      xAxis: [{ type: 'category', data: ['a'], gridIndex: 0 }, { type: 'category', data: ['b'], gridIndex: 0 }],
      yAxis: [{ gridIndex: 0 }, { name: 'right', gridIndex: 0 }, { gridIndex: 1 }],
      series: [{ type: 'bar', data: [1] }, { type: 'line', data: [2], yAxisIndex: 1 }],
    }, 400, 300)!
    expect(Array.isArray(parts[0]!.option['xAxis'])).toBe(true)
    expect(Array.isArray(parts[0]!.option['yAxis'])).toBe(true)
    // The second y axis of grid 0 is LOCAL index 1, so the series keeps a (relocalised) index.
    const s0 = parts[0]!.option['series'] as Obj[]
    expect(s0[0]!['yAxisIndex']).toBeUndefined()
    expect(s0[1]!['yAxisIndex']).toBe(1)
    // Grid 1 has a single y axis, flattened.
    expect(Array.isArray(parts[1]!.option['yAxis'])).toBe(false)
  })

  it('a series pointing at an axis index that does not exist falls to grid 0', () => {
    const parts = splitGrids({
      grid: [{ top: 0, height: 100 }, { top: 120, height: 100 }],
      xAxis: [{ gridIndex: 0 }, { gridIndex: 1 }],
      yAxis: [{ gridIndex: 0 }, { gridIndex: 1 }],
      series: [{ type: 'bar', data: [1], xAxisIndex: 9 }],
    }, 400, 300)!
    expect(parts[0]!.option['series']).toHaveLength(1)
    expect(parts[1]!.option['series']).toHaveLength(0)
  })

  it('an axis key that is neither an array nor an object contributes no axes at all', () => {
    const parts = splitGrids({
      grid: [{ top: 0, height: 100 }, { top: 120, height: 100 }],
      xAxis: 'nope',
      yAxis: 7,
      series: [{ type: 'bar', data: [1] }],
    }, 400, 300)!
    expect('xAxis' in parts[0]!.option).toBe(false)
    expect('yAxis' in parts[0]!.option).toBe(false)
    // With no x axis to place it, the series falls to grid 0.
    expect(parts[0]!.option['series']).toHaveLength(1)
  })

  it('an axis with NO gridIndex belongs to grid 0', () => {
    const parts = splitGrids({
      grid: [{ top: 0, height: 100 }, { top: 120, height: 100 }],
      xAxis: [{ type: 'category' }, { type: 'category', gridIndex: 1 }],
      yAxis: [{}],
      series: [{ type: 'bar', data: [1] }],
    }, 400, 300)!
    expect(parts[0]!.option['series']).toHaveLength(1)
    expect(parts[1]!.option['series']).toHaveLength(0)
    expect('yAxis' in parts[0]!.option).toBe(true)
  })

  it('an option with fewer than two grids takes the plain path', () => {
    expect(splitGrids({ series: [] }, 400, 300)).toBeNull()
    expect(splitGrids({ grid: { left: 10 }, series: [] }, 400, 300)).toBeNull()
    expect(splitGrids({ grid: 'nope', series: [] }, 400, 300)).toBeNull()
  })
})

describe('timelineCommands + composeSvg', () => {
  it('draws nothing for an empty step list, and centres a SINGLE step instead of dividing by zero', () => {
    expect(timelineCommands({ labels: [], current: 0, autoPlay: false, playInterval: 0 }, 400, 200, 40)).toEqual([])
    const one = timelineCommands({ labels: ['only'], current: 0, autoPlay: false, playInterval: 0 }, 400, 200, 40)
    const dot = one.find((c) => c.kind === 'circle')!
    if (dot.kind !== 'circle') throw new Error('circle')
    // Centred on the axis, which the play + previous buttons shorten on the left and next on the right: (72 + 352) / 2.
    expect(dot.center.x).toBeCloseTo(212, 9)
    expect(Number.isNaN(dot.center.x)).toBe(false)
    // Two steps span the strip instead.
    const two = timelineCommands({ labels: ['a', 'b'], current: 0, autoPlay: false, playInterval: 0 }, 400, 200, 40)
    const dots = two.filter((c) => c.kind === 'circle')
    expect(dots.length).toBeGreaterThan(1)
  })

  it('composeSvg skips a part whose markup has no svg body, and paints a background when asked', () => {
    const real = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect x="0" y="0" width="1" height="1"/></svg>'
    const out = composeSvg([{ svg: 'not an svg at all', x: 0, y: 0 }, { svg: real, x: 0, y: 0 }], [], 20, 20)
    // One part made it in — the unparseable one contributed nothing.
    expect(out.match(/<g>/g)).toHaveLength(1)
    expect(out).toContain('<rect')
    // A part at the origin needs no transform; one placed elsewhere gets one.
    expect(out).not.toContain('translate(')
    expect(composeSvg([{ svg: real, x: 3, y: 4 }], [], 20, 20)).toContain('translate(3 4)')
    // The background reaches the root document.
    expect(composeSvg([{ svg: real, x: 0, y: 0 }], [], 20, 20, { background: '#fafafa' })).toContain('#fafafa')
  })

  it('an overlay command layer is spliced ABOVE the parts', () => {
    const real = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect x="0" y="0" width="1" height="1"/></svg>'
    const out = composeSvg([{ svg: real, x: 0, y: 0 }], [{ kind: 'circle', center: { x: 1, y: 1 }, radius: 2, fill: '#abcdef' }], 20, 20)
    expect(out.indexOf('#abcdef')).toBeGreaterThan(out.indexOf('<rect'))
  })
})
