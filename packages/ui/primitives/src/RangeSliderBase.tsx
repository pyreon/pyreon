/** @jsxImportSource @pyreon/core */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { mergeProps, splitProps, useControllableState } from '@pyreon/core'

/** Localizable AT strings — English defaults, override any subset. */
export interface RangeSliderLabels {
  /** Start-thumb `aria-label`. Default `'Minimum value'`. */
  start?: string
  /** End-thumb `aria-label`. Default `'Maximum value'`. */
  end?: string
  /** Start `aria-valuetext`. Default `(v) => String(v)`. */
  startValue?: (v: number) => string
  /** End `aria-valuetext`. Default `(v) => String(v)`. */
  endValue?: (v: number) => string
}

export interface RangeSliderBaseProps {
  /** Current [lo, hi] range. */
  value?: [number, number]
  /** Uncontrolled initial range. */
  defaultValue?: [number, number]
  /** Called when either bound changes. */
  onChange?: (value: [number, number]) => void
  /** Minimum (default 0). */
  min?: number
  /** Maximum (default 100). */
  max?: number
  /** Keyboard/drag step (default 1). */
  step?: number
  /** PageUp/PageDown step (default 10 × step). */
  largeStep?: number
  /** Minimum gap between the thumbs (default 0). */
  minRange?: number
  /** Non-interactive. */
  disabled?: boolean
  /** Localized AT strings. */
  labels?: RangeSliderLabels
  /** Render function. */
  children?: (state: RangeSliderState) => VNodeChild
  [key: string]: unknown
}

export interface RangeSliderState {
  /** Current [lo, hi]. */
  value: () => [number, number]
  /** Set the start (lo) bound — clamped to [min, hi − minRange] + stepped. */
  setStart: (v: number) => void
  /** Set the end (hi) bound — clamped to [lo + minRange, max] + stepped. */
  setEnd: (v: number) => void
  min: number
  max: number
  /**
   * Props for the START thumb: `role="slider"` + accessor-live
   * aria-valuenow/min/max/valuetext + tabIndex 0 + per-thumb keyboard
   * (arrows ±step, PageUp/Down ±largeStep, Home → min, End → the other
   * thumb's bound). Spread on the thumb element.
   */
  startThumbProps: () => Record<string, unknown>
  /** Same for the END thumb. */
  endThumbProps: () => Record<string, unknown>
  /**
   * Track props: click moves the NEAREST thumb to the clicked position.
   * Spread on the track element (it must have layout width).
   */
  trackProps: () => Record<string, unknown>
  /** Container props — forwards component rest (rocketstyle class etc.). */
  rootProps: () => Record<string, unknown>
}

const DEFAULT_LABELS: Required<RangeSliderLabels> = {
  start: 'Minimum value',
  end: 'Maximum value',
  startValue: (v) => String(v),
  endValue: (v) => String(v),
}

/**
 * Dual-thumb range slider — the WAI-ARIA MULTI-THUMB slider pattern: two
 * `role="slider"` thumbs (each focusable, each announcing its own
 * value/min/max where min/max reflect the OTHER thumb's constraint), arrow
 * keys move by `step`, PageUp/Down by `largeStep`, Home/End to the bound.
 * Thumbs can never cross (`minRange` enforces a minimum gap). A native
 * `<input type=range>` can't do dual thumbs, hence the ARIA-div approach
 * (the standard one — Mantine/Radix/Ark all do this).
 */
export const RangeSliderBase: ComponentFn<RangeSliderBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'value',
    'defaultValue',
    'onChange',
    'min',
    'max',
    'step',
    'largeStep',
    'minRange',
    'disabled',
    'labels',
    'children',
  ])

  const min = own.min ?? 0
  const max = own.max ?? 100
  const step = own.step ?? 1
  const largeStep = own.largeStep ?? step * 10
  const minRange = own.minRange ?? 0

  const [value, setValue] = useControllableState<[number, number]>({
    value: () => own.value,
    defaultValue: own.defaultValue ?? [min, max],
    onChange: own.onChange,
  })

  const label = <K extends keyof RangeSliderLabels>(key: K): NonNullable<RangeSliderLabels[K]> =>
    (own.labels?.[key] ?? DEFAULT_LABELS[key]) as NonNullable<RangeSliderLabels[K]>

  const snap = (v: number) => Math.round((v - min) / step) * step + min

  const setStart = (v: number) => {
    if (own.disabled) return
    const [, hi] = value()
    const next = Math.max(min, Math.min(snap(v), hi - minRange))
    setValue([next, hi])
  }

  const setEnd = (v: number) => {
    if (own.disabled) return
    const [lo] = value()
    const next = Math.min(max, Math.max(snap(v), lo + minRange))
    setValue([lo, next])
  }

  const thumbKeyDown = (which: 'start' | 'end') => (e: KeyboardEvent) => {
    if (own.disabled) return
    const [lo, hi] = value()
    const current = which === 'start' ? lo : hi
    const apply = which === 'start' ? setStart : setEnd
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = current + step
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = current - step
    else if (e.key === 'PageUp') next = current + largeStep
    else if (e.key === 'PageDown') next = current - largeStep
    else if (e.key === 'Home') next = which === 'start' ? min : lo + minRange
    else if (e.key === 'End') next = which === 'start' ? hi - minRange : max
    if (next !== null) {
      e.preventDefault()
      apply(next)
    }
  }

  const thumbProps = (which: 'start' | 'end') => ({
    role: 'slider',
    'data-range-thumb': which,
    'aria-label': label(which),
    tabIndex: own.disabled ? -1 : 0,
    'aria-disabled': own.disabled ? 'true' : undefined,
    // Accessor-live values; each thumb's effective min/max reflects the OTHER
    // thumb's constraint (the APG multi-thumb contract).
    'aria-valuemin': () => (which === 'start' ? min : value()[0] + minRange),
    'aria-valuemax': () => (which === 'start' ? value()[1] - minRange : max),
    'aria-valuenow': () => (which === 'start' ? value()[0] : value()[1]),
    'aria-valuetext': () =>
      which === 'start' ? label('startValue')(value()[0]) : label('endValue')(value()[1]),
    onKeyDown: thumbKeyDown(which),
  })

  const state: RangeSliderState = {
    value,
    setStart,
    setEnd,
    min,
    max,
    startThumbProps: () => thumbProps('start'),
    endThumbProps: () => thumbProps('end'),
    trackProps: () => ({
      'data-range-track': 'true',
      onPointerDown: (e: PointerEvent) => {
        if (own.disabled) return
        const track = e.currentTarget as HTMLElement
        const rect = track.getBoundingClientRect()
        if (rect.width === 0) return
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        const target = min + ratio * (max - min)
        const [lo, hi] = value()
        // Move the NEAREST thumb (ties go to the end thumb so a full-range
        // slider can still shrink from the right).
        if (Math.abs(target - lo) < Math.abs(target - hi)) setStart(target)
        else setEnd(target)
      },
    }),
    rootProps: () =>
      mergeProps(rest as Record<string, unknown>, {} as Record<string, unknown>),
  }

  if (typeof own.children === 'function') {
    return (own.children as (state: RangeSliderState) => VNodeChild)(state)
  }
  return null
}
