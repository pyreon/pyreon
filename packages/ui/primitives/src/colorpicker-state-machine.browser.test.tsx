/**
 * State-machine coverage for `ColorPickerBase` — the headless HSB color picker.
 * Drives the `ColorPickerState` object directly: hex↔rgb↔hsb round-trips
 * (setHex / setHSB), alpha clamping, the three ARIA-slider keyboard handlers
 * (hue / saturation-brightness / alpha, each Arrow/Page/Home/End), and the
 * slider/group prop helpers with their accessor-valued aria-value*. Pure math +
 * signal logic → identical in happy-dom and Chromium.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { ColorPickerBase, type ColorPickerState } from './index'

const mount = (props: Record<string, unknown> = {}): ColorPickerState => {
  let captured: ColorPickerState | undefined
  mountInBrowser(
    h(ColorPickerBase as never, {
      ...props,
      children: (s: ColorPickerState) => {
        captured = s
        return h('div', null)
      },
    }),
  )
  if (!captured) throw new Error('render child did not run')
  return captured
}

const kd = (key: string) => ({ key, preventDefault() {} }) as unknown as KeyboardEvent
const now = (accessor: unknown) => (accessor as () => number)()

describe('ColorPickerBase — color conversions', () => {
  it('setHex parses to rgb + hsb; setHSB round-trips to a known hex', () => {
    const s = mount({ defaultValue: '#000000' })
    s.setHex('#ff0000')
    expect(s.rgb()).toEqual({ r: 255, g: 0, b: 0 })
    expect(Math.round(s.hue())).toBe(0)
    expect(Math.round(s.saturation())).toBe(100)
    expect(Math.round(s.brightness())).toBe(100)

    s.setHSB(120, 100, 100)
    expect(s.hex().toLowerCase()).toBe('#00ff00')
    s.setHSB(240, 100, 100)
    expect(s.hex().toLowerCase()).toBe('#0000ff')
  })

  it('setAlpha clamps to [0,1]', () => {
    const s = mount()
    s.setAlpha(0.5)
    expect(s.alpha()).toBe(0.5)
    s.setAlpha(5)
    expect(s.alpha()).toBe(1)
    s.setAlpha(-2)
    expect(s.alpha()).toBe(0)
  })
})

describe('ColorPickerBase — hue slider keyboard', () => {
  it('Arrow steps ±1, Page steps ±10, Home/End jump to 0/360 (clamped)', () => {
    const s = mount({ defaultValue: '#ff0000' }) // hue 0
    const onKey = s.hueSliderProps().onKeyDown as (e: KeyboardEvent) => void
    onKey(kd('Home'))
    expect(Math.round(s.hue())).toBe(0)
    onKey(kd('ArrowLeft')) // clamp at 0
    expect(Math.round(s.hue())).toBe(0)
    onKey(kd('ArrowRight'))
    expect(Math.round(s.hue())).toBe(1)
    onKey(kd('PageUp'))
    expect(Math.round(s.hue())).toBe(11)
    onKey(kd('PageDown'))
    expect(Math.round(s.hue())).toBe(1)
    onKey(kd('End'))
    expect(Math.round(s.hue())).toBe(360)
    onKey(kd('ArrowRight')) // clamp at 360
    expect(Math.round(s.hue())).toBe(360)
    onKey(kd('Unknown')) // no-op branch
    expect(Math.round(s.hue())).toBe(360)
  })

  it('aria-valuenow / valuetext accessors track the hue', () => {
    const s = mount({ defaultValue: '#ff0000' })
    const p = s.hueSliderProps()
    expect(p.role).toBe('slider')
    expect(p['aria-valuemin']).toBe(0)
    expect(p['aria-valuemax']).toBe(360)
    expect(now(p['aria-valuenow'])).toBe(0)
    ;(s.hueSliderProps().onKeyDown as (e: KeyboardEvent) => void)(kd('End'))
    expect(now(s.hueSliderProps()['aria-valuenow'])).toBe(360)
    expect(typeof (s.hueSliderProps()['aria-valuetext'] as () => string)()).toBe('string')
  })
})

describe('ColorPickerBase — saturation/brightness slider keyboard', () => {
  it('Left/Right move saturation, Up/Down move brightness, Page ±10, Home/End on saturation', () => {
    const s = mount({ defaultValue: '#808080' })
    const onKey = s.saturationSliderProps().onKeyDown as (e: KeyboardEvent) => void
    onKey(kd('Home')) // saturation → 0
    expect(Math.round(s.saturation())).toBe(0)
    onKey(kd('ArrowRight'))
    expect(Math.round(s.saturation())).toBe(1)
    onKey(kd('End')) // saturation → 100
    expect(Math.round(s.saturation())).toBe(100)

    const b0 = Math.round(s.brightness())
    onKey(kd('ArrowUp'))
    expect(Math.round(s.brightness())).toBe(Math.min(100, b0 + 1))
    onKey(kd('ArrowDown'))
    expect(Math.round(s.brightness())).toBe(b0)
    onKey(kd('PageUp'))
    onKey(kd('PageDown'))
    onKey(kd('Nope')) // no-op branch
    expect(now(s.saturationSliderProps()['aria-valuenow'])).toBe(100)
  })
})

describe('ColorPickerBase — alpha slider keyboard', () => {
  it('Arrow ±0.01, Page ±0.1, Home/End jump 0/1', () => {
    const s = mount()
    const onKey = s.alphaSliderProps().onKeyDown as (e: KeyboardEvent) => void
    onKey(kd('Home'))
    expect(s.alpha()).toBe(0)
    onKey(kd('ArrowRight'))
    expect(s.alpha()).toBeCloseTo(0.01, 5)
    onKey(kd('PageUp'))
    expect(s.alpha()).toBeCloseTo(0.11, 5)
    onKey(kd('PageDown'))
    expect(s.alpha()).toBeCloseTo(0.01, 5)
    onKey(kd('End'))
    expect(s.alpha()).toBe(1)
    onKey(kd('ArrowUp')) // clamp at 1
    expect(s.alpha()).toBe(1)
    onKey(kd('x')) // no-op
    expect(s.alpha()).toBe(1)
    const p = s.alphaSliderProps()
    expect(p.role).toBe('slider')
    expect(now(p['aria-valuenow'])).toBe(100)
  })
})

describe('ColorPickerBase — group props + degenerate children', () => {
  it('groupProps: role=group with a default aria-label, overridable by an explicit name', () => {
    expect(mount().groupProps().role).toBe('group')
    expect(typeof mount().groupProps()['aria-label']).toBe('string')
    const named = mount({ 'aria-label': 'Brand color' }).groupProps()
    expect(named['aria-label']).toBe('Brand color')
  })

  it('renders null (no throw) when children is not a render function', () => {
    expect(() => mountInBrowser(h(ColorPickerBase as never, {}))).not.toThrow()
  })
})
