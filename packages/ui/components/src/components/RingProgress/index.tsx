/** @jsxImportSource @pyreon/core */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h, splitProps } from '@pyreon/core'

export interface RingProgressProps {
  /** Progress 0-100. Number or accessor — an accessor makes the ring LIVE. */
  value: number | (() => number)
  /** Outer diameter in px (default 64). */
  size?: number
  /** Stroke thickness in px (default 6). */
  thickness?: number
  /** Ring color (default the theme-ish primary; any CSS color). */
  color?: string
  /** Track color. */
  trackColor?: string
  /** Accessible name (default 'Progress'). */
  'aria-label'?: string
  /** Centered label content. */
  children?: VNodeChild
  [key: string]: unknown
}

/**
 * Circular progress ring (the linear Progress' sibling — the audit's missing
 * RingProgress staple). SVG stroke-dasharray implementation; the a11y contract
 * is a full `role="progressbar"` with ACCESSOR-live `aria-valuenow` so a
 * signal-driven value animates the ring AND its announcement.
 */
export const RingProgress: ComponentFn<RingProgressProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'value',
    'size',
    'thickness',
    'color',
    'trackColor',
    'aria-label',
    'children',
  ])

  const size = own.size ?? 64
  const thickness = own.thickness ?? 6
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius

  // Live value read — supports number OR accessor.
  const read = () => {
    const v = typeof own.value === 'function' ? own.value() : own.value
    // `?? 0` catches null/undefined but NOT NaN, and `Math.min(100, NaN)`
    // is NaN — so a percentage computed as `done / total` with both at 0
    // produced `stroke-dashoffset="NaN"`. That does not error: the arc
    // simply stops rendering, so the ring silently disappears at exactly
    // the moment the data is degenerate. `Infinity` was already handled
    // (it clamps to 100); NaN and a non-numeric value were not.
    const n = typeof v === 'number' ? v : Number(v ?? 0)
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0
  }

  const offset = () => circumference * (1 - read() / 100)

  return h(
    'div',
    {
      ...(rest as Record<string, unknown>),
      role: 'progressbar',
      'aria-label': own['aria-label'] ?? 'Progress',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': () => Math.round(read()),
      style: `position:relative;display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px`,
    },
    h(
      'svg',
      { width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' },
      h('circle', {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: 'none',
        stroke: own.trackColor ?? '#e9ecef',
        'stroke-width': thickness,
      }),
      h('circle', {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: 'none',
        stroke: own.color ?? '#228be6',
        'stroke-width': thickness,
        'stroke-linecap': 'round',
        'stroke-dasharray': circumference,
        // Accessor — the ring arc tracks a signal-driven value live.
        'stroke-dashoffset': offset,
        transform: `rotate(-90 ${size / 2} ${size / 2})`,
      }),
    ),
    own.children
      ? h('div', { style: 'position:absolute;text-align:center' }, own.children)
      : null,
  )
}

export default RingProgress
