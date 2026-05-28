// Web implementation of `<Scroll>` — scrollable container.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { ScrollProps } from '../types/layout'
import { applyBaseLayoutStyle } from './base-style'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Scroll>` — overflow container. Vertically scrollable by default;
 * `axis="horizontal"` flips to horizontal scroll.
 *
 * Compiles to:
 * - Web (this impl): `<div style="overflow-y:auto">` (or `overflow-x`)
 * - iOS (via PMTC): `ScrollView` (`.horizontal` axis variant)
 * - Android (via PMTC): `Column(verticalScroll)` / `Row(horizontalScroll)`
 *
 * Only the scrolled axis gets `auto`; the cross axis stays `hidden` so
 * a vertical scroller doesn't grow a spurious horizontal scrollbar from
 * sub-pixel child overflow. Accepts the full `BaseLayoutProps` styling
 * surface (padding / margin / background / radius) like the other
 * layout primitives.
 */
export const Scroll = (props: ScrollProps): VNode => {
  const horizontal = props.axis === 'horizontal'
  const style: Record<string, string> = {
    'overflow-x': horizontal ? 'auto' : 'hidden',
    'overflow-y': horizontal ? 'hidden' : 'auto',
  }
  applyBaseLayoutStyle(style, props)
  return h(
    'div',
    {
      ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
      style: mergePassthroughStyle(style, props.style),
    },
    props.children,
  )
}
