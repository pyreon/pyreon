// Web-side token resolution.
//
// In v1 the token system is intentionally NOT wired to @pyreon/styler's
// full theme infrastructure — that's a follow-up that touches both
// runtime and bundler. v1 ships built-in defaults that work for the
// proof-of-concept TodoMVC + similar small apps; apps wanting full
// theme integration use @pyreon/elements directly on web.
//
// Token → CSS resolution philosophy: primitives produce INLINE
// `style` objects (not classes) so no CSS-in-JS plumbing is required.
// Web bundles stay small; no extra runtime cost.

import type { ColorToken, Radius, Space } from '../types/shared'

/**
 * Spacing scale in pixels. Index-keyed (`padding={4}` → 16px) AND
 * semantic-aliased (`padding="md"` → 12px, the canonical "medium"
 * spacing). Matches the spacing scales most design systems use.
 */
const SPACE_BY_INDEX: Record<number, number> = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
  9: 48,
}

const SPACE_BY_NAME: Record<string, number> = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
}

export function resolveSpace(value: Space): string {
  if (typeof value === 'number') {
    const px = SPACE_BY_INDEX[value]
    return px === undefined ? '0' : `${px}px`
  }
  const px = SPACE_BY_NAME[value]
  return px === undefined ? '0' : `${px}px`
}

/**
 * Default color tokens. Apps that want a custom palette will replace
 * this in a future-arc theme-integration PR. v1 ships a minimal,
 * neutral palette useful for proof-of-concept rendering.
 */
const COLOR_TOKENS: Record<ColorToken, string> = {
  text: '#111827', // gray-900
  surface: '#ffffff',
  primary: '#2563eb', // blue-600
  secondary: '#6b7280', // gray-500
  success: '#16a34a', // green-600
  warning: '#d97706', // amber-600
  danger: '#dc2626', // red-600
  muted: '#9ca3af', // gray-400
}

export function resolveColor(value: ColorToken): string {
  return COLOR_TOKENS[value] ?? COLOR_TOKENS.text
}

/**
 * Border-radius scale.
 */
const RADIUS_TOKENS: Record<Radius, string> = {
  none: '0',
  sm: '4px',
  md: '8px',
  lg: '16px',
  full: '9999px',
}

export function resolveRadius(value: Radius): string {
  return RADIUS_TOKENS[value] ?? '0'
}

/**
 * Map canonical align values to CSS flex `alignItems` values.
 */
const ALIGN_MAP: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
}

export function resolveAlign(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return ALIGN_MAP[value]
}

/**
 * Map canonical justify values to CSS flex `justifyContent` values.
 */
const JUSTIFY_MAP: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
}

export function resolveJustify(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return JUSTIFY_MAP[value]
}
