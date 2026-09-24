import { describe, expect, it } from 'vitest'
import { gaugeDial, themedDial } from './dial'
import { renderDial } from './gauge-dial'
import { defaultTheme } from './render'
import { chartThemes } from './theme'

describe('gaugeDial() — every part defaulted', () => {
  it('a bare value is a 0..100 dial from 225° to -45° clockwise, ten labelled splits', () => {
    const d = gaugeDial({ data: [42] })
    expect(d.min).toBe(0)
    expect(d.max).toBe(100)
    expect(d.clockwise).toBe(true)
    expect(d.start).toBeCloseTo((-225 * Math.PI) / 180)
    expect(d.sweep).toBeCloseTo((270 * Math.PI) / 180)
    expect(d.labels).toEqual(['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'])
    expect(d.data).toHaveLength(1)
    expect(d.data[0]).toMatchObject({ value: 42, name: '', detail: '42', color: '' })
  })

  it('formats the axis labels and each detail through `format`, over a custom range', () => {
    const d = gaugeDial({ data: [{ value: 0.5, name: 'Load' }], min: 0, max: 1, splitNumber: 2, format: (v) => `${v * 100}%` })
    expect(d.labels).toEqual(['0%', '50%', '100%'])
    expect(d.data[0]).toMatchObject({ name: 'Load', detail: '50%' })
  })

  it('an explicit field wins over the default, and a datum keeps its own colour', () => {
    const d = gaugeDial({ data: [{ value: 7, color: '#ff0000' }], progressShow: true, lineWidth: 20, stops: [{ at: 1, color: '#00ff00' }] })
    expect(d.progressShow).toBe(true)
    expect(d.lineWidth).toBe(20)
    expect(d.stops).toEqual([{ at: 1, color: '#00ff00' }])
    expect(d.data[0]!.color).toBe('#ff0000')
  })

  it('custom angles set the sweep; counter-clockwise runs the other way', () => {
    const half = gaugeDial({ data: [1], startAngle: 180, endAngle: 0 })
    expect(half.sweep).toBeCloseTo(Math.PI)
    const ccw = gaugeDial({ data: [1], startAngle: 0, endAngle: 180, clockwise: false })
    expect(ccw.clockwise).toBe(false)
    expect(ccw.sweep).toBeCloseTo(Math.PI)
  })

  it('draws: a pointer and a detail per value', () => {
    const cmds = renderDial(gaugeDial({ data: [30, 70] }), { x: 100, y: 100 }, 80, ['#123456', '#654321'])
    const details = cmds.filter((c) => c.kind === 'text' && (c.text === '30' || c.text === '70'))
    expect(details.length).toBeGreaterThanOrEqual(2)
  })
})

describe('themedDial() — the defaults follow the theme, a set colour does not', () => {
  it('under the default theme it is the same object', () => {
    const d = gaugeDial({ data: [1] })
    expect(themedDial(d, defaultTheme)).toBe(d)
  })

  it('under a dark theme the default colours take its tokens', () => {
    const d = gaugeDial({ data: [1] })
    const dark = chartThemes.dark
    const t = themedDial(d, dark)
    expect(t.detailColor).toBe(dark.text)
    expect(t.labelColor).toBe(dark.label)
    expect(t.titleColor).toBe(dark.label)
    expect(t.splitColor).toBe(dark.axis)
    expect(t.tickColor).toBe(dark.axis)
    expect(t.anchorColor).toBe(dark.surface)
    expect(t.stops[0]!.color).toBe(dark.muted)
  })

  it('a colour set explicitly survives the theme', () => {
    const d = gaugeDial({ data: [1], detailColor: '#abcdef', stops: [{ at: 1, color: '#00ff00' }] })
    const t = themedDial(d, chartThemes.dark)
    expect(t.detailColor).toBe('#abcdef')
    expect(t.stops[0]!.color).toBe('#00ff00')
  })
})
