// Web implementation of `<Button>` — styled call-to-action button.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { ButtonProps } from '../types/interaction'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * Variant-to-color mapping. Inline style only — no CSS-in-JS.
 *
 * The variant chrome is intentionally simple — v1 produces a usable
 * button shape (not a polished design-system button). Apps that want
 * polished button styling use `@pyreon/ui-components` Button on the
 * web target.
 */
const VARIANT_STYLES: Record<string, Record<string, string>> = {
  primary: {
    'background-color': '#2563eb', // blue-600
    color: '#ffffff',
    'border-color': '#2563eb',
  },
  secondary: {
    'background-color': '#ffffff',
    color: '#111827',
    'border-color': '#d1d5db', // gray-300
  },
  ghost: {
    'background-color': 'transparent',
    color: '#2563eb',
    'border-color': 'transparent',
  },
  danger: {
    'background-color': '#dc2626', // red-600
    color: '#ffffff',
    'border-color': '#dc2626',
  },
}

const BASE_STYLE: Record<string, string> = {
  display: 'inline-flex',
  'align-items': 'center',
  'justify-content': 'center',
  padding: '8px 16px',
  'border-radius': '6px',
  'border-width': '1px',
  'border-style': 'solid',
  'font-size': '14px',
  'font-weight': '500',
  cursor: 'pointer',
  // Defensive defaults; user-agent button styles vary.
  'font-family': 'inherit',
  'line-height': '1.25',
}

/**
 * `<Button>` — styled CTA. Picks up platform-native button chrome
 * on iOS/Android; on web emits a `<button>` with token-styled chrome.
 *
 * Compiles to:
 * - Web (this impl): `<button>` with inline style
 * - iOS (via PMTC): `Button(action: ...) { ... }`
 * - Android (via PMTC): `Button(onClick = ...) { ... }`
 */
export const Button = (props: ButtonProps): VNode => {
  const variant = props.variant ?? 'primary'
  // `primary` is a statically-defined key, so the fallback is always
  // defined — the assertion documents that (the codebase's sanctioned
  // pattern for provably-safe paths) and avoids an uncoverable `?? {}`.
  const variantStyle =
    VARIANT_STYLES[variant] ?? (VARIANT_STYLES.primary as Record<string, string>)
  const style: Record<string, string> = {
    ...BASE_STYLE,
    ...variantStyle,
  }
  if (props.disabled) {
    style.opacity = '0.5'
    style.cursor = 'not-allowed'
  }
  const attrs: Record<string, unknown> = {
    ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
    type: 'button',
    style: mergePassthroughStyle(style, props.style),
    // onPress is the canonical event; on web it maps to onClick.
    onClick: props.disabled ? undefined : props.onPress,
  }
  if (props.disabled) attrs.disabled = true
  return h('button', attrs, props.children)
}
