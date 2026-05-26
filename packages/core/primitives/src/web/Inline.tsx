// Web implementation of `<Inline>` — horizontal flex container.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { InlineProps } from '../types/layout'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'
import { buildStackStyle } from './Stack'

/**
 * `<Inline>` — horizontal flex container. Sugar for
 * `<Stack direction="row">` for the common case.
 *
 * Internally shares `buildStackStyle` with `<Stack>` — only the
 * default `flex-direction` differs (row vs column). Same prop shape,
 * same token resolution.
 *
 * Compiles to:
 * - Web (this impl): `<div style="display:flex;flex-direction:row">`
 * - iOS (via PMTC): `HStack`
 * - Android (via PMTC): `Row`
 */
export const Inline = (props: InlineProps): VNode => {
  // Spoof a Stack with direction="row" — same shape, just default override.
  const computed = buildStackStyle(
    { ...props, direction: 'row' },
    'row',
  )
  return h(
    'div',
    {
      ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
      style: mergePassthroughStyle(computed, props.style),
    },
    props.children,
  )
}
