import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { mergeProps, splitProps } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'
import { batch, computed, signal } from '@pyreon/reactivity'

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
  /**
   * ARIA props for the picker container — `role="group"` + a label so
   * assistive tech announces the grouped sliders as one color picker.
   *
   * Also carries the component-level props forwarded from the consumer
   * (rocketstyle className/style, data-*, id…), since the container is the
   * element a ColorPicker wrapper's `.theme()` describes. Spread it on your
   * picker container.
   */
  groupProps: () => Record<string, unknown>
  /**
   * ARIA slider props for the HUE control (0–360°). Spread onto the hue
   * track/thumb element; wire arrow keys to `setHSB(next, saturation(),
   * brightness())`. ARIA value attrs are numbers (rendered as their string).
   */
  hueSliderProps: () => {
    role: 'slider'
    'aria-label': string
    'aria-valuemin': number
    'aria-valuemax': number
    'aria-valuenow': number
    'aria-valuetext': string
    tabIndex: 0
    onKeyDown: (e: KeyboardEvent) => void
  }
  /**
   * ARIA slider props for the 2-D saturation/brightness area. A single
   * `aria-valuetext` conveys BOTH axes (one slider can't expose two numeric
   * values); `aria-valuenow` tracks saturation.
   */
  saturationSliderProps: () => {
    role: 'slider'
    'aria-label': string
    'aria-valuemin': number
    'aria-valuemax': number
    'aria-valuenow': number
    'aria-valuetext': string
    tabIndex: 0
    onKeyDown: (e: KeyboardEvent) => void
  }
  /**
   * ARIA slider props for the ALPHA / opacity control (0–100%). Only
   * meaningful when the `alpha` prop is enabled.
   */
  alphaSliderProps: () => {
    role: 'slider'
    'aria-label': string
    'aria-valuemin': number
    'aria-valuemax': number
    'aria-valuenow': number
    'aria-valuetext': string
    tabIndex: 0
    onKeyDown: (e: KeyboardEvent) => void
  }
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
  const [own, rest] = splitProps(props, [
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
    const c = hsbToRgb(h, s, b)
    const newHex = rgbToHex(c.r, c.g, c.b)
    // Atomic: 4 dependent state writes → one notify cycle.
    batch(() => {
      _hue.set(h)
      _saturation.set(s)
      _brightness.set(b)
      setHex(newHex)
    })
  }

  // ─── Keyboard (ARIA slider model) ──────────────────────────────────
  //
  // Standard slider keys: Arrow Up/Right increment, Down/Left decrement (the
  // 2-D saturation/brightness area maps Left/Right → saturation, Up/Down →
  // brightness); PageUp/PageDown step by 10×; Home/End jump to min/max. The
  // value-set goes through updateFromHSB / setAlpha (so hex + RGB stay in sync).
  const clampN = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

  function handleHueKey(e: KeyboardEvent): void {
    const h = _hue()
    let next: number
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = clampN(h + 1, 0, 360)
        break
      case 'ArrowDown':
      case 'ArrowLeft':
        next = clampN(h - 1, 0, 360)
        break
      case 'PageUp':
        next = clampN(h + 10, 0, 360)
        break
      case 'PageDown':
        next = clampN(h - 10, 0, 360)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = 360
        break
      default:
        return
    }
    e.preventDefault()
    updateFromHSB(next, _saturation(), _brightness())
  }

  function handleSaturationKey(e: KeyboardEvent): void {
    let s = _saturation()
    let b = _brightness()
    switch (e.key) {
      case 'ArrowRight':
        s = clampN(s + 1, 0, 100)
        break
      case 'ArrowLeft':
        s = clampN(s - 1, 0, 100)
        break
      case 'ArrowUp':
        b = clampN(b + 1, 0, 100)
        break
      case 'ArrowDown':
        b = clampN(b - 1, 0, 100)
        break
      case 'PageUp':
        b = clampN(b + 10, 0, 100)
        break
      case 'PageDown':
        b = clampN(b - 10, 0, 100)
        break
      case 'Home':
        s = 0
        break
      case 'End':
        s = 100
        break
      default:
        return
    }
    e.preventDefault()
    updateFromHSB(_hue(), s, b)
  }

  function handleAlphaKey(e: KeyboardEvent): void {
    const a = _alpha()
    let next: number
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        next = clampN(a + 0.01, 0, 1)
        break
      case 'ArrowDown':
      case 'ArrowLeft':
        next = clampN(a - 0.01, 0, 1)
        break
      case 'PageUp':
        next = clampN(a + 0.1, 0, 1)
        break
      case 'PageDown':
        next = clampN(a - 0.1, 0, 1)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = 1
        break
      default:
        return
    }
    e.preventDefault()
    _alpha.set(next)
  }

  const rgb = computed(() => hexToRgb(hex()))

  const state: ColorPickerState = {
    hex,
    setHex: (h) => {
      const c = hexToRgb(h)
      const hsb = rgbToHsb(c.r, c.g, c.b)
      batch(() => {
        setHex(h)
        _hue.set(hsb.h)
        _saturation.set(hsb.s)
        _brightness.set(hsb.b)
      })
    },
    hue: _hue,
    saturation: _saturation,
    brightness: _brightness,
    alpha: _alpha,
    setHSB: updateFromHSB,
    setAlpha: (a) => _alpha.set(Math.max(0, Math.min(1, a))),
    rgb,
    // Forward the component-level props (rocketstyle className/style, data-*,
    // id…) onto the GROUP container — the element ColorPicker's .theme()
    // actually describes (a card: bg/radius/padding/shadow). This primitive
    // renders no element of its own, so without this the whole rocketstyle
    // chain computed a class that reached NO element and the component rendered
    // UNSTYLED. mergeProps (descriptor-safe) is required over object spread so a
    // getter-shaped reactive prop is not frozen; the primitive's own ARIA is
    // passed last and therefore wins.
    groupProps: () =>
      mergeProps(rest as Record<string, unknown>, {
        role: 'group',
        'aria-label': 'Color picker',
      } as Record<string, unknown>),
    hueSliderProps: () => {
      const h = Math.round(_hue())
      return {
        role: 'slider' as const,
        'aria-label': 'Hue',
        'aria-valuemin': 0,
        'aria-valuemax': 360,
        'aria-valuenow': h,
        'aria-valuetext': `${h} degrees`,
        tabIndex: 0 as const,
        onKeyDown: handleHueKey,
      }
    },
    saturationSliderProps: () => {
      const s = Math.round(_saturation())
      const b = Math.round(_brightness())
      return {
        role: 'slider' as const,
        'aria-label': 'Saturation and brightness',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': s,
        'aria-valuetext': `Saturation ${s}%, brightness ${b}%`,
        tabIndex: 0 as const,
        onKeyDown: handleSaturationKey,
      }
    },
    alphaSliderProps: () => {
      const a = Math.round(_alpha() * 100)
      return {
        role: 'slider' as const,
        'aria-label': 'Opacity',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': a,
        'aria-valuetext': `${a}%`,
        tabIndex: 0 as const,
        onKeyDown: handleAlphaKey,
      }
    },
  }

  if (typeof own.children === 'function') {
    return (own.children as (state: ColorPickerState) => VNodeChild)(state)
  }
  return null
}
