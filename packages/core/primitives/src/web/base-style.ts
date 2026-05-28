// Shared web-side resolution of `BaseLayoutProps` (padding / margin /
// background / radius) into inline-style entries.
//
// `<Stack>` / `<Inline>` predate this helper and inline the same logic
// inside `buildStackStyle` (intertwined with their flex-specific props);
// the newer layout primitives that ALSO accept `BaseLayoutProps`
// (`<Scroll>`, `<Layer>`) route through here so the token→CSS mapping
// stays in one place. Mutates and returns the passed `style` object.

import type { BaseLayoutProps } from '../types/shared'
import { resolveColor, resolveRadius, resolveSpace } from './tokens'

export function applyBaseLayoutStyle(
  style: Record<string, string>,
  props: BaseLayoutProps,
): Record<string, string> {
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
