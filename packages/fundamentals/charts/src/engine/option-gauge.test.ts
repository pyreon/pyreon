/**
 * ECharts' gauge keys read into a dial, and the dial's own drawing where the
 * differential (echarts-differential.test.ts) cannot see it: round caps,
 * icons, the detail box, bold text, the SVG path.
 */
import { describe, expect, it } from 'vitest'
import { dialColor, iconPoints, renderDial, sausagePolygon } from './gauge-dial'
import { gaugeText, readDialLen, readGaugeDial } from './option-gauge'
import { compileFamily } from './option-family'
import { optionToSvg } from './option'
import type { EChartsOption } from './option'
import { renderSvg } from './svg'

const at = { x: 100, y: 100 }

describe('readGaugeDial', () => {
  it('ECharts 6 defaults: 225° to -45°, 0..100 in ten, the token colours', () => {
    const d = readGaugeDial({ data: [{ value: 42, name: 'Speed' }] }, [])
    expect(d.start).toBeCloseTo((-225 * Math.PI) / 180, 9)
    expect(d.sweep).toBeCloseTo((270 * Math.PI) / 180, 9)
    expect(d).toMatchObject({ clockwise: true, min: 0, max: 100, splitNumber: 10, lineWidth: 10, splitColor: '#54555a', tickColor: '#6d6e73', labelColor: '#54555a', titleColor: '#54555a', detailColor: '#3c3c41', detailSize: 30, detailBold: true, pointerShow: true, anchorShow: false, progressShow: false })
    expect(d.stops).toEqual([{ at: 1, color: '#e8ebf0' }])
    expect(d.labels).toEqual(['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'])
    expect(d.pointerLength).toEqual({ v: 0.6, pct: true })
    expect(d.data[0]).toMatchObject({ value: 42, name: 'Speed', detail: '42', color: '' })
  })

  it('reads stops, percent lengths, per-datum offsets and colours', () => {
    const d = readGaugeDial({
      axisLine: { lineStyle: { color: [[0.4, '#0f0'], [1, '#f00']] } },
      splitLine: { length: '15%' },
      pointer: { itemStyle: { color: 'auto' } },
      data: [{ value: 5, itemStyle: { color: '#123' }, title: { offsetCenter: ['10%', 20] } }],
    }, ['#aaa'])
    expect(d.stops).toEqual([{ at: 0.4, color: '#0f0' }, { at: 1, color: '#f00' }])
    expect(d.splitLength).toEqual({ v: 0.15, pct: true })
    expect(d.data[0]).toMatchObject({ color: '#123', pointerColor: 'auto', titleX: { v: 0.1, pct: true }, titleY: { v: 20, pct: false } })
  })

  it('prints tick values rounded to ten places, through a formatter', () => {
    expect(readGaugeDial({ min: 0, max: 0.3, splitNumber: 3 }, []).labels).toEqual(['0', '0.1', '0.2', '0.3'])
    expect(readGaugeDial({ axisLabel: { formatter: (v: number) => `v${v}` }, splitNumber: 2 }, []).labels).toEqual(['v0', 'v50', 'v100'])
    expect(gaugeText(7, '{value} km/h')).toBe('7 km/h')
    expect(gaugeText(null, '{value}')).toBe('')
  })

  it('an icon it cannot draw warns and keeps the default', () => {
    const warned: string[] = []
    const d = readGaugeDial({ pointer: { icon: 'path://M0 0L1 1' }, anchor: { icon: 'image://x.png' } }, [], (p) => warned.push(p))
    expect(d.pointerIcon).toBe('')
    expect(d.anchorIcon).toBe('circle')
    expect(warned).toEqual(['series[0].pointer.icon', 'series[0].anchor.icon'])
    expect(readGaugeDial({ pointer: { icon: 'triangle' } }, []).pointerIcon).toBe('triangle')
  })

  it('readDialLen: numbers, pixel strings and percents', () => {
    expect(readDialLen(12, { v: 0, pct: false })).toEqual({ v: 12, pct: false })
    expect(readDialLen('30%', { v: 0, pct: false })).toEqual({ v: 0.3, pct: true })
    expect(readDialLen('8', { v: 0, pct: false })).toEqual({ v: 8, pct: false })
    expect(readDialLen(undefined, { v: 3, pct: true })).toEqual({ v: 3, pct: true })
  })
})

describe('renderDial', () => {
  const base = readGaugeDial({ data: [{ value: 50, name: 'n' }] }, ['#00f'])

  it('dialColor: the band a fraction falls in', () => {
    const stops = [{ at: 0.3, color: 'a' }, { at: 0.7, color: 'b' }, { at: 1, color: 'c' }]
    expect([0, 0.2, 0.3, 0.5, 0.9, 1].map((t) => dialColor(stops, t))).toEqual(['a', 'a', 'a', 'b', 'c', 'c'])
  })

  it('a round cap reaches past the angle by half the band', () => {
    const pts = sausagePolygon({ x: 0, y: 0 }, 110, 90, 0, Math.PI / 2)
    // The start cap at angle 0 bulges to negative y by up to 10 (half the band).
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(-10, 1)
    const plain = renderDial({ ...base, lineRound: false }, at, 80)
    const round = renderDial({ ...base, lineRound: true }, at, 80)
    expect(round[0]!.kind === 'polygon' && plain[0]!.kind === 'polygon' && round[0]!.points.length).toBeGreaterThan(plain[0]!.kind === 'polygon' ? plain[0]!.points.length : 0)
  })

  it('a pointer icon fills the pointer box, turned to the value', () => {
    const tri = renderDial({ ...base, pointerIcon: 'triangle' }, at, 100).filter((c) => c.kind === 'polygon' && c.fill === '#00f')
    expect(tri).toHaveLength(1)
    // Value 50 on the default dial points straight up: the triangle's apex is 60px above the centre.
    const pts = tri[0]!.kind === 'polygon' ? tri[0]!.points : []
    expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(40, 6)
  })

  it('the arrow starts at its cell centre, as ECharts\' does', () => {
    const pts = iconPoints('arrow', { x: 0, y: 0, w: 6, h: 12 })
    expect(pts[0]).toEqual({ x: 3, y: 6 })
    expect(pts[1]).toEqual({ x: 7, y: 18 })
  })

  it('an anchor draws with its icon and border; the detail box with its fill and border', () => {
    const cmds = renderDial({ ...base, anchorShow: true, anchorIcon: 'diamond', anchorBorderWidth: 2, detailBg: '#eee', detailBorderWidth: 1 }, at, 100)
    const box = cmds.find((c) => c.kind === 'rect')
    expect(box).toMatchObject({ kind: 'rect', fill: '#eee', rect: { w: 120, h: 40 } })
    expect(cmds.filter((c) => c.kind === 'polyline')).toHaveLength(2)
  })

  it('the detail is bold, and the SVG says so', () => {
    const cmds = renderDial(base, at, 100)
    const detail = cmds.find((c) => c.kind === 'text' && c.text === '50' && c.size === 30)
    expect(detail).toMatchObject({ weight: 'bold', size: 30 })
    expect(renderSvg(cmds, 200, 200)).toContain('font-weight="bold"')
  })
})

describe('the facade paths', () => {
  const option: EChartsOption = { series: [{ type: 'gauge', progress: { show: true, roundCap: true }, anchor: { show: true }, data: [{ value: 64, name: 'Load' }] }] }

  it('compileFamily carries the dial, with no warnings for ECharts\' gauge keys', () => {
    const fam = compileFamily(option)!
    expect(fam.warnings).toEqual([])
    if (fam.plan.kind !== 'gauge') throw new Error('gauge')
    expect(fam.plan.dial.progressRound).toBe(true)
  })

  it('optionToSvg draws the dial where ECharts places it: a 75% radius at the centre', () => {
    const svg = optionToSvg(option, { width: 400, height: 300 })
    expect(svg).toContain('>Load<')
    expect(svg).toContain('>64<')
    // The zero label sits 77.5px (112.5 - 10 - 25) out from the centre (200, 150) at 225°.
    const m = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>0</.exec(svg)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeCloseTo(200 - 77.5 * Math.SQRT1_2, 1)
    expect(Number(m![2])).toBeCloseTo(150 + 77.5 * Math.SQRT1_2, 1)
  })
})
