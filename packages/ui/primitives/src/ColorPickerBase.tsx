import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'
import { computed, signal } from '@pyreon/reactivity'

export interface ColorPickerBaseProps {
  /** Current color as hex string. */
  value?: string
  /** Default color (uncontrolled). */
  defaultValue?: string
  /** Called when color changes. */
  onChange?: (hex: string) => void
  /** Enable alpha channel. */
  alpha?: boolean
  /** Render function. */
  children?: (state: ColorPickerState) => VNodeChild
  [key: string]: unknown
}

export interface ColorPickerState {
  /** Current hex value. */
  hex: () => string
  /** Set hex value. */
  setHex: (hex: string) => void
  /** Hue (0-360). */
  hue: () => number
  /** Saturation (0-100). */
  saturation: () => number
  /** Brightness/value (0-100). */
  brightness: () => number
  /** Alpha (0-1). */
  alpha: () => number
  /** Set HSB values. */
  setHSB: (h: number, s: number, b: number) => void
  /** Set alpha. */
  setAlpha: (a: number) => void
  /** RGB values. */
  rgb: () => { r: number; g: number; b: number }
}

// ─── Color conversion utilities ──────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function rgbToHsb(r: number, g: number, b: number): { h: number; s: number; b: number } {
  const rN = r / 255
  const gN = g / 255
  const bN = b / 255
  const max = Math.max(rN, gN, bN)
  const min = Math.min(rN, gN, bN)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === rN) h = 60 * (((gN - bN) / delta) % 6)
    else if (max === gN) h = 60 * ((bN - rN) / delta + 2)
    else h = 60 * ((rN - gN) / delta + 4)
  }
  if (h < 0) h += 360

  const s = max === 0 ? 0 : (delta / max) * 100
  const br = max * 100

  return { h, s, b: br }
}

function hsbToRgb(h: number, s: number, b: number): { r: number; g: number; b: number } {
  const sN = s / 100
  const bN = b / 100
  const c = bN * sN
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = bN - c

  let rP = 0
  let gP = 0
  let bP = 0

  if (h < 60) { rP = c; gP = x }
  else if (h < 120) { rP = x; gP = c }
  else if (h < 180) { gP = c; bP = x }
  else if (h < 240) { gP = x; bP = c }
  else if (h < 300) { rP = x; bP = c }
  else { rP = c; bP = x }

  return {
    r: Math.round((rP + m) * 255),
    g: Math.round((gP + m) * 255),
    b: Math.round((bP + m) * 255),
  }
}

// ─── ColorPickerBase ─────────────────────────────────────────────────────────

export const ColorPickerBase: ComponentFn<ColorPickerBaseProps> = (props) => {
  const [own] = splitProps(props, [
    'value', 'defaultValue', 'onChange', 'alpha', 'children',
  ])

  const initial = own.defaultValue ?? own.value ?? '#3b82f6'
  const initialRgb = hexToRgb(initial)
  const initialHsb = rgbToHsb(initialRgb.r, initialRgb.g, initialRgb.b)

  const [hex, setHex] = useControllableState<string>({
    value: () => own.value,
    defaultValue: initial,
    onChange: own.onChange,
  })

  const _hue = signal(initialHsb.h)
  const _saturation = signal(initialHsb.s)
  const _brightness = signal(initialHsb.b)
  const _alpha = signal(1)

  function updateFromHSB(h: number, s: number, b: number) {
    const rgb = hsbToRgb(h, s, b)
    const newHex = rgbToHex(rgb.r, rgb.g, rgb.b)
    _hue.set(h)
    _saturation.set(s)
    _brightness.set(b)
    setHex(newHex)
  }

  const rgb = computed(() => hexToRgb(hex()))

  const state: ColorPickerState = {
    hex,
    setHex: (h) => {
      setHex(h)
      const rgb = hexToRgb(h)
      const hsb = rgbToHsb(rgb.r, rgb.g, rgb.b)
      _hue.set(hsb.h)
      _saturation.set(hsb.s)
      _brightness.set(hsb.b)
    },
    hue: _hue,
    saturation: _saturation,
    brightness: _brightness,
    alpha: _alpha,
    setHSB: updateFromHSB,
    setAlpha: (a) => _alpha.set(Math.max(0, Math.min(1, a))),
    rgb,
  }

  if (typeof own.children === 'function') {
    return (own.children as (state: ColorPickerState) => VNodeChild)(state)
  }
  return null
}
