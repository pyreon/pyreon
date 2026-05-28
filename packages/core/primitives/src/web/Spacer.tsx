// Web implementation of `<Spacer />` — fills available main-axis space.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { SpacerProps } from '../types/layout'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Spacer />` — pushes its siblings to opposite ends of a flex
 * container by greedily consuming the free main-axis space.
 *
 * Compiles to:
 * - Web (this impl): `<div style="flex: 1 1 auto">`
 * - iOS (via PMTC): `Spacer()`
 * - Android (via PMTC): `Spacer(modifier = Modifier.weight(1f))`
 *
 * Self-closing — `<Spacer />` carries no children in v1. The
 * `flex: 1 1 auto` shorthand (grow + shrink + auto basis) is the
 * canonical "flexible gap" idiom and works in both column and row
 * Stacks without the Spacer needing to know its parent's direction.
 */
export const Spacer = (props: SpacerProps): VNode => {
  return h('div', {
    ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
    style: mergePassthroughStyle({ flex: '1 1 auto' }, props.style),
  })
}
