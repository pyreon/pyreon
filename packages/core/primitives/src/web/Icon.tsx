// Web implementation of `<Icon>` — vector icon.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { IconProps } from '../types/content'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'
import { resolveColor } from './tokens'

const SIZE_PX: Record<'sm' | 'md' | 'lg', string> = {
  sm: '16px',
  md: '20px',
  lg: '24px',
}

/**
 * `<Icon>` — vector icon referenced by a platform-agnostic semantic
 * `name`. Each platform maps the name to its native icon system.
 *
 * Compiles to:
 * - Web (this impl): `<svg><use href="#<name>" /></svg>` — references
 *   an SVG sprite the app provides (the standard zero-bundle pattern:
 *   the app inlines `<svg style="display:none"><symbol id="check">…
 *   </symbol></svg>` once, then `<Icon name="check" />` references it).
 *   `@pyreon/primitives` ships NO icon set in v1 — apps bring their own
 *   sprite (or a future arc adds an opt-in set).
 * - iOS (via PMTC): `Image(systemName: "<name>")` (SF Symbols)
 * - Android (via PMTC): `Icon(imageVector = ..., ...)` (Material Icons)
 *
 * `color` (default `currentColor`, so the icon inherits surrounding
 * text color) maps to the SVG `fill`. `size` (default `md`) sets a
 * square box. Decorative by default (`aria-hidden`); pass an `aria-*`
 * attr to mark it meaningful and the hidden default is dropped.
 */
export const Icon = (props: IconProps): VNode => {
  // `props.size ?? 'md'` is exactly 'sm' | 'md' | 'lg' and `SIZE_PX` is
  // keyed by that union, so the lookup is `string` (no undefined / no branch).
  const px = SIZE_PX[props.size ?? 'md']
  const style: Record<string, string> = {
    width: px,
    height: px,
    fill: props.color !== undefined ? resolveColor(props.color) : 'currentColor',
    display: 'inline-block',
    'flex-shrink': '0',
  }
  const passthrough = collectPassthroughAttrs(props as unknown as Record<string, unknown>)
  // Decorative by default; a consumer-supplied aria-* (e.g. aria-label)
  // means the icon conveys meaning, so drop the hidden default.
  const hasAria = Object.keys(passthrough).some((k) => k.startsWith('aria-'))
  return h(
    'svg',
    {
      ...passthrough,
      ...(hasAria ? {} : { 'aria-hidden': 'true' }),
      style: mergePassthroughStyle(style, props.style),
    },
    h('use', { href: `#${props.name}` }),
  )
}
