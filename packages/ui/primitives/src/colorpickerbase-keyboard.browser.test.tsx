/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for ColorPickerBase slider keyboard control. The sliders
 * had role="slider" + aria-value* (the ARIA shell) but no keyboard handler — a
 * keyboard user couldn't change the color. Each slider's props now carry an
 * `onKeyDown` implementing the ARIA slider model:
 *   - hue (0–360): Up/Right +1, Down/Left −1, PageUp/Down ±10, Home 0 / End 360
 *   - saturation/brightness (2-D): Left/Right → saturation, Up/Down → brightness
 *   - alpha (0–1): Up/Right +0.01, Down/Left −0.01, PageUp/Down ±0.1, Home/End
 *
 * The value-change is SYNCHRONOUS (updateFromHSB / _alpha.set), so it's read
 * straight off the captured `state` accessors after dispatching the key — no
 * reliance on the (snapshot, plain-oxc) aria-valuenow re-rendering.
 *
 * Default #ff0000 → hue 0, saturation 100, brightness 100, alpha 1.
 *
 * Bisect: remove an onKeyDown from a slider's props → that slider's specs fail
 * (the value doesn't move).
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { ColorPickerBase, type ColorPickerState } from './ColorPickerBase'

function mountPicker(): {
  st: () => ColorPickerState
  el: (s: string) => HTMLElement
  unmount: () => void
} {
  let captured!: ColorPickerState
  const { container, unmount } = mountInBrowser(
    h(ColorPickerBase as never, {
      defaultValue: '#ff0000',
      alpha: true,
      children: (state: ColorPickerState) => {
        captured = state
        return h(
          'div',
          null,
          h('div', { ...state.hueSliderProps(), 'data-s': 'hue' }),
          h('div', { ...state.saturationSliderProps(), 'data-s': 'sat' }),
          h('div', { ...state.alphaSliderProps(), 'data-s': 'alpha' }),
        )
      },
    }),
  )
  return {
    st: () => captured,
    el: (s: string) => container.querySelector(`[data-s=${s}]`) as HTMLElement,
    unmount,
  }
}

function press(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('ColorPickerBase — slider keyboard control', () => {
  it('hue: ArrowUp increments, clamped, and Home/End jump to 0/360', async () => {
    const { st, el, unmount } = mountPicker()
    await flush()
    expect(Math.round(st().hue())).toBe(0)
    press(el('hue'), 'ArrowUp')
    expect(Math.round(st().hue())).toBe(1)
    press(el('hue'), 'ArrowDown')
    expect(Math.round(st().hue())).toBe(0)
    press(el('hue'), 'ArrowDown') // clamp at 0
    expect(Math.round(st().hue())).toBe(0)
    press(el('hue'), 'End')
    expect(Math.round(st().hue())).toBe(360)
    press(el('hue'), 'Home')
    expect(Math.round(st().hue())).toBe(0)
    press(el('hue'), 'PageUp')
    expect(Math.round(st().hue())).toBe(10)
    unmount()
  })

  it('saturation slider: Left/Right move saturation, Up/Down move brightness', async () => {
    const { st, el, unmount } = mountPicker()
    await flush()
    expect(Math.round(st().saturation())).toBe(100)
    expect(Math.round(st().brightness())).toBe(100)
    press(el('sat'), 'ArrowLeft') // saturation −1
    expect(Math.round(st().saturation())).toBe(99)
    press(el('sat'), 'ArrowDown') // brightness −1
    expect(Math.round(st().brightness())).toBe(99)
    press(el('sat'), 'ArrowRight') // saturation back to 100
    expect(Math.round(st().saturation())).toBe(100)
    press(el('sat'), 'Home') // saturation → 0
    expect(Math.round(st().saturation())).toBe(0)
    unmount()
  })

  it('alpha: Arrow steps by 0.01, PageDown by 0.1, Home/End jump to 0/1', async () => {
    const { st, el, unmount } = mountPicker()
    await flush()
    expect(st().alpha()).toBeCloseTo(1)
    press(el('alpha'), 'ArrowDown')
    expect(st().alpha()).toBeCloseTo(0.99)
    press(el('alpha'), 'PageDown')
    expect(st().alpha()).toBeCloseTo(0.89)
    press(el('alpha'), 'Home')
    expect(st().alpha()).toBeCloseTo(0)
    press(el('alpha'), 'End')
    expect(st().alpha()).toBeCloseTo(1)
    unmount()
  })
})
