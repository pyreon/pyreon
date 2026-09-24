import { describe, expect, it } from 'vitest'
import { renderSliderZoom, sliderRect } from './slider-zoom'
import type { SliderBox } from './slider-zoom'

const unset = { mode: '', amount: 0 }
const box = (over: Partial<SliderBox> = {}): SliderBox => ({ left: unset, top: unset, right: unset, bottom: unset, width: unset, height: unset, brush: false, ...over })
const plot = { x: 40, y: 10, w: 300, h: 200 }

describe('sliderRect — where the strip sits', () => {
  it('by default it spans the plot width, 30 tall, 45 above the chart bottom', () => {
    const r = sliderRect(box(), plot, 400, 300)
    expect(r.w).toBeCloseTo(300)
    expect(r.h).toBeCloseTo(30)
    expect(r.y).toBeCloseTo(300 - 30 - 15)
  })

  it('with the brush handle it sits 7px higher and shifts by the handle outline', () => {
    const plain = sliderRect(box(), plot, 400, 300)
    const brush = sliderRect(box({ brush: true }), plot, 400, 300)
    expect(brush.y - plain.y).toBeCloseTo(-7 + 6.5)
    expect(brush.x - plain.x).toBeCloseTo(0.3)
  })

  it('a set left, width and bottom replace the defaults', () => {
    const r = sliderRect(box({ left: { mode: 'px', amount: 10 }, width: { mode: 'px', amount: 100 }, bottom: { mode: 'px', amount: 5 }, height: { mode: 'px', amount: 20 } }), plot, 400, 300)
    expect(r.x).toBeCloseTo(12.5)
    expect(r.w).toBeCloseTo(100)
    expect(r.h).toBeCloseTo(20)
    expect(r.y).toBeCloseTo(300 - 5 - 20)
  })
})

describe('renderSliderZoom — the strip, its shadow and handles', () => {
  const strip = { x: 0, y: 0, w: 200, h: 30 }
  it('draws the data shadow and two handles, and moves the handles with the window', () => {
    const values = [1, 5, 3, 8, 2, 9, 4]
    const full = renderSliderZoom(values, { start: 0, end: 1 }, strip, false)
    const half = renderSliderZoom(values, { start: 0.5, end: 1 }, strip, false)
    expect(full.length).toBeGreaterThan(3)
    expect(half).not.toEqual(full)
  })

  it('draws the strip with no data, and with a single value', () => {
    expect(renderSliderZoom([], { start: 0, end: 1 }, strip, true).length).toBeGreaterThan(0)
    expect(renderSliderZoom([3], { start: 0.2, end: 0.8 }, strip, true).length).toBeGreaterThan(0)
  })

  it('skips a non-finite value in the shadow rather than drawing NaN', () => {
    const cmds = renderSliderZoom([1, Number.NaN, 3], { start: 0, end: 1 }, strip, false)
    expect(JSON.stringify(cmds)).not.toContain('null')
  })
})
