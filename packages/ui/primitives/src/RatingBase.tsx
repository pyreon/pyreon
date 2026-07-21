/** @jsxImportSource @pyreon/core */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { mergeProps, splitProps, useControllableState } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * Localizable AT strings — English defaults, override any subset.
 */
export interface RatingLabels {
  /** `aria-label` for the `role="radiogroup"` container. Default `'Rating'`. */
  group?: string
  /** Per-star label. Default ``(v, max) => `${v} of ${max} stars` ``. */
  item?: (value: number, max: number) => string
}

export interface RatingBaseProps {
  /** Current rating (0 = none). */
  value?: number
  /** Uncontrolled initial rating. */
  defaultValue?: number
  /** Called when the rating changes. */
  onChange?: (value: number) => void
  /** Number of stars. Default 5. */
  max?: number
  /** Read-only: rendered + announced, but not interactive. */
  readOnly?: boolean
  /** Localized AT strings. */
  labels?: RatingLabels
  /** Render function. */
  children?: (state: RatingState) => VNodeChild
  [key: string]: unknown
}

export interface RatingState {
  /** Current rating value (0 = none). */
  value: () => number
  /** Set the rating. */
  setValue: (v: number) => void
  /** Star count. */
  max: number
  /** Hover-preview value (null when not hovering) — style stars up to it. */
  hovered: () => number | null
  /**
   * Props for star N (1-based). Carries `role="radio"`, accessor-live
   * `aria-checked`/`tabIndex`, the per-star label, hover preview handlers,
   * click-to-set, and the group's keyboard handler. Spread on each star
   * element (render stars STATICALLY — the accessors stay live through the
   * spread; re-rendering the list would destroy DOM focus).
   */
  getStarProps: (value: number) => Record<string, unknown>
  /**
   * Props for the container: `role="radiogroup"` + accessible name +
   * forwarded component rest props (rocketstyle className etc.). A
   * consumer-passed `aria-label`/`aria-labelledby` wins over the default.
   */
  rootProps: () => Record<string, unknown>
}

const DEFAULT_LABELS: Required<RatingLabels> = {
  group: 'Rating',
  item: (v, max) => `${v} of ${max} stars`,
}

/**
 * Star-rating input — WAI-ARIA RADIOGROUP pattern (the Adobe Spectrum /
 * APG-blessed shape): the container is `role="radiogroup"`, each star a
 * `role="radio"` whose `aria-checked` reflects the SELECTED value.
 *
 * Keyboard follows the value-adjust convention every shipped rating widget
 * uses (Spectrum/Mantine): ArrowRight/ArrowUp increase, ArrowLeft/ArrowDown
 * decrease (clamped 1..max — arrows never clear), Home = 1, End = max.
 * Exactly ONE tab stop: the checked star, or star 1 when nothing is rated.
 * Click on the checked star clears the rating (toggle-off, the common
 * affordance); `readOnly` renders + announces but ignores input.
 */
export const RatingBase: ComponentFn<RatingBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'value',
    'defaultValue',
    'onChange',
    'max',
    'readOnly',
    'labels',
    'children',
  ])

  const max = own.max ?? 5

  const [value, setValue] = useControllableState<number>({
    value: () => own.value,
    defaultValue: own.defaultValue ?? 0,
    onChange: own.onChange,
  })

  const hovered = signal<number | null>(null)

  // Per-call lazy label reads — a getter-shaped `labels` prop stays live.
  const label = <K extends keyof RatingLabels>(key: K): NonNullable<RatingLabels[K]> =>
    (own.labels?.[key] ?? DEFAULT_LABELS[key]) as NonNullable<RatingLabels[K]>

  const set = (v: number) => {
    if (own.readOnly) return
    setValue(v)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (own.readOnly) return
    const current = value()
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(current + 1, max)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(current - 1, 1)
    else if (e.key === 'Home') next = 1
    else if (e.key === 'End') next = max
    if (next !== null) {
      e.preventDefault()
      setValue(next)
      // Move real DOM focus with the value (roving tabindex, both halves).
      const container = (e.currentTarget as HTMLElement | null)?.closest('[role="radiogroup"]')
      const target = container?.querySelector<HTMLElement>(`[data-rating-value="${next}"]`)
      target?.focus()
    }
  }

  const state: RatingState = {
    value,
    setValue: set,
    max,
    hovered: () => hovered(),
    getStarProps: (starValue: number) => ({
      role: 'radio',
      'data-rating-value': starValue,
      'aria-label': label('item')(starValue, max),
      // Accessor-live ARIA + roving tabindex (checked star, else star 1).
      'aria-checked': () => (value() === starValue ? 'true' : 'false'),
      tabIndex: () => (value() === starValue || (value() === 0 && starValue === 1) ? 0 : -1),
      'aria-disabled': own.readOnly ? 'true' : undefined,
      onClick: () => set(value() === starValue ? 0 : starValue),
      onMouseEnter: () => {
        if (!own.readOnly) hovered.set(starValue)
      },
      onMouseLeave: () => hovered.set(null),
      onKeyDown,
    }),
    rootProps: () => {
      // Consumer's explicit accessible name wins (presence check fires no
      // getter-shaped props); role stays primitive-owned.
      const hasOwnName =
        'aria-label' in (rest as object) || 'aria-labelledby' in (rest as object)
      return mergeProps(rest as Record<string, unknown>, {
        role: 'radiogroup',
        ...(hasOwnName ? {} : { 'aria-label': label('group') }),
      } as Record<string, unknown>)
    },
  }

  if (typeof own.children === 'function') {
    return (own.children as (state: RatingState) => VNodeChild)(state)
  }
  return null
}
