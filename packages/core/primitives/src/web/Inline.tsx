// Web implementation of `<Inline>` — horizontal flex container.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { InlineProps } from '../types/layout'
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
  return h(
    'div',
    {
      style: buildStackStyle({ ...props, direction: 'row' }, 'row'),
    },
    props.children,
  )
}
