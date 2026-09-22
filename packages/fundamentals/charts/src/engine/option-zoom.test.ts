import { compileOption, compiledCommands, optionToSvg, zoomedView } from './option'
import { limitWindow, readDataZoom, windowSpec } from './option-zoom'
import { measureApprox } from './svg'

const cats = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
const option = (dataZoom: unknown) => ({ xAxis: { type: 'category', data: cats }, yAxis: {}, dataZoom, series: [{ type: 'bar', data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 100], label: { show: true } }] })

describe('dataZoom on a compiled option', () => {
  it('reads inside + slider with start/end percent, or startValue/endValue by index or category', () => {
    const w: string[] = []
    const z = readDataZoom(option([{ type: 'inside', start: 20, end: 60 }, { type: 'slider' }]) as Record<string, unknown>, cats, (_c, p) => w.push(p))!
    expect(z).toMatchObject({ inside: true, slider: true, keepY: false, lock: false })
    expect(z.window.start).toBeCloseTo(0.2, 9)
    expect(z.window.end).toBeCloseTo(0.6, 9)
    const byValue = readDataZoom(option({ type: 'slider', startValue: 'c', endValue: 5 }) as Record<string, unknown>, cats, () => {})!
    expect(byValue.window).toEqual({ start: 0.2, end: 0.6 })
    expect(w).toEqual([])
  })

  it('names a y-axis zoom and never applies it to x', () => {
    const w: string[] = []
    expect(readDataZoom(option([{ type: 'inside', yAxisIndex: 0 }]) as Record<string, unknown>, cats, (_c, p) => w.push(p))).toBeUndefined()
    expect(w).toEqual(['dataZoom[0]'])
  })

  it('compiles without the old "no mapping" warning and windows the rows it draws', () => {
    const c = compileOption(option({ type: 'slider', start: 0, end: 30 }), { width: 400, height: 300 })
    expect(c.warnings).toEqual([])
    const view = zoomedView(c, 0)
    expect(view.spec.categories).toEqual(['a', 'b', 'c'])
    expect(view.spec.series[0]!.values).toEqual([1, 2, 3])
    expect(view.navigator).not.toBeNull()
    expect(view.spec.height).toBe(300 - view.navigator!.height)
    // The navigator is drawn, and the label texts are sliced with the values.
    const texts = compiledCommands(c, option({}), measureApprox()).cmds.filter((d) => d.kind === 'text').map((d) => (d.kind === 'text' ? d.text : ''))
    expect(texts).toContain('a')
    expect(texts).not.toContain('j')
    expect(optionToSvg(option({ type: 'slider', start: 0, end: 30 }), { width: 400, height: 300 })).not.toContain('>j<')
  })

  it("filterMode 'none' keeps the y extent of every row; the default lets the visible rows set it", () => {
    const c = compileOption(option({ type: 'inside', start: 0, end: 30 }), { width: 400, height: 300 })
    const filtered = windowSpec(c.spec, c.zoom!.window, false).spec
    const kept = windowSpec(c.spec, c.zoom!.window, true).spec
    expect(filtered.yDomain).toBeUndefined()
    expect(kept.yDomain!.max).toBeGreaterThanOrEqual(100)
  })

  it('shifts and drops point markers with the window, and reports the first row as the offset', () => {
    const c = compileOption(option({ type: 'inside', start: 50, end: 100 }), { width: 400, height: 300 })
    const r = windowSpec({ ...c.spec, markers: [{ atIndex: 2 }, { atIndex: 7 }, { at: 'max' }] }, c.zoom!.window, false)
    expect(r.offset).toBe(5)
    expect(r.spec.markers).toEqual([{ atIndex: 2 }, { at: 'max' }])
  })

  it('zoomLock keeps the span; minSpan / maxSpan bound it', () => {
    const z = readDataZoom(option({ type: 'inside', zoomLock: true, minSpan: 20, maxSpan: 50 }) as Record<string, unknown>, cats, () => {})!
    const locked = limitWindow(z, { start: 0.1, end: 0.4 }, { start: 0.3, end: 0.35 })
    expect(locked.start).toBeCloseTo(0.175, 9)
    expect(locked.end).toBeCloseTo(0.475, 9)
    const free = { ...z, lock: false }
    const narrow = limitWindow(free, { start: 0, end: 1 }, { start: 0.5, end: 0.51 })
    expect(narrow.end - narrow.start).toBeCloseTo(0.2, 9)
    const wide = limitWindow(free, { start: 0, end: 1 }, { start: 0, end: 1 })
    expect(wide.end - wide.start).toBeCloseTo(0.5, 9)
  })
})
