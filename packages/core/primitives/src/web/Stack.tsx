// Web implementation of `<Stack>` — flex container.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { StackProps } from '../types/layout'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'
import { resolveAlign, resolveColor, resolveJustify, resolveRadius, resolveSpace } from './tokens'

/**
 * Build the inline `style` object for a Stack-shaped layout.
 * Extracted so `<Inline>` can share the same logic via `direction="row"`
 * override.
 */
export function buildStackStyle(
  props: StackProps,
  defaultDirection: 'column' | 'row',
): Record<string, string> {
  const style: Record<string, string> = {
    display: 'flex',
    'flex-direction': props.direction ?? defaultDirection,
  }
  if (props.wrap) style['flex-wrap'] = 'wrap'
  if (props.gap !== undefined) style.gap = resolveSpace(props.gap)
  const align = resolveAlign(props.align)
  if (align !== undefined) style['align-items'] = align
  const justify = resolveJustify(props.justify)
  if (justify !== undefined) style['justify-content'] = justify
  if (props.padding !== undefined) style.padding = resolveSpace(props.padding)
  if (props.paddingX !== undefined) {
    style['padding-left'] = resolveSpace(props.paddingX)
    style['padding-right'] = resolveSpace(props.paddingX)
  }
  if (props.paddingY !== undefined) {
    style['padding-top'] = resolveSpace(props.paddingY)
    style['padding-bottom'] = resolveSpace(props.paddingY)
  }
  if (props.margin !== undefined) style.margin = resolveSpace(props.margin)
  if (props.marginX !== undefined) {
    style['margin-left'] = resolveSpace(props.marginX)
    style['margin-right'] = resolveSpace(props.marginX)
  }
  if (props.marginY !== undefined) {
    style['margin-top'] = resolveSpace(props.marginY)
    style['margin-bottom'] = resolveSpace(props.marginY)
  }
  if (props.background !== undefined) style['background-color'] = resolveColor(props.background)
  if (props.radius !== undefined) style['border-radius'] = resolveRadius(props.radius)
  return style
}

/**
 * `<Stack>` — flex container. Default vertical (`direction="column"`).
 *
 * Compiles to:
 * - Web (this impl): `<div style="display:flex;flex-direction:...">`
 * - iOS (via PMTC): `VStack` / `HStack`
 * - Android (via PMTC): `Column` / `Row`
 *
 * Internally produces a single `<div>` with computed inline style.
 * NO classes — no CSS-in-JS plumbing. The render path goes through
 * Pyreon's standard `h()` so all reactivity primitives (signal-bound
 * children, etc.) work natively.
 */
export const Stack = (props: StackProps): VNode => {
  const computed = buildStackStyle(props, 'column')
  return h(
    'div',
    {
      ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
      style: mergePassthroughStyle(computed, props.style),
    },
    props.children,
  )
}
