// Web implementation of `<Layer>` — z-stack / overlay container.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { LayerProps } from '../types/layout'
import { applyBaseLayoutStyle } from './base-style'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Layer>` — overlay container. Children stack on the z-axis (later
 * children render in front).
 *
 * Compiles to:
 * - Web (this impl): `<div style="position:relative; display:grid">`
 * - iOS (via PMTC): `ZStack`
 * - Android (via PMTC): `Box`
 *
 * The web container is BOTH a positioning context (`position:relative`,
 * so children using `position:absolute` are placed relative to the
 * Layer — the canonical overlay/badge pattern) AND a single-cell grid
 * (`display:grid`), so the `align` prop maps directly to the grid
 * `place-items` value (`start`/`center`/`end`/`stretch` are native grid
 * keywords — no flex translation needed) to position flow children.
 *
 * v1 note: multiple NON-absolutely-positioned children are grid-flowed
 * (they don't auto-overlap container-only). For true overlap, position
 * the stacked children absolutely — the `position:relative` context
 * makes that work. Native ZStack/Box overlap automatically. Token →
 * stylesheet integration (a future arc) will let web auto-overlap flow
 * children too.
 */
export const Layer = (props: LayerProps): VNode => {
  const style: Record<string, string> = {
    position: 'relative',
    display: 'grid',
  }
  if (props.align !== undefined) style['place-items'] = props.align
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
