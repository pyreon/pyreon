import { h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'

/** The theme rocketstyle dimensions are introspected against. */
export const theme = { accent: '#3b82f6' }

/** Wraps every canvas render. */
export function wrapper(props: { children?: unknown }): VNodeChild {
  return h('div', { 'data-fixture-wrapper': 'yes' }, props.children as VNodeChild)
}
