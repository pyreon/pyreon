// Web implementation of `<Text>` — inline text content.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { TextProps } from '../types/content'
import { resolveColor } from './tokens'

const SIZE_PX: Record<string, string> = {
  xs: '12px',
  sm: '14px',
  md: '16px',
  lg: '20px',
  xl: '24px',
}

const WEIGHT: Record<string, string> = {
  regular: '400',
  medium: '500',
  bold: '700',
}

/**
 * `<Text>` — inline text content.
 *
 * Compiles to:
 * - Web (this impl): `<span style="...">`
 * - iOS (via PMTC): `Text(...)`
 * - Android (via PMTC): `Text(text=..., color=..., ...)`
 */
export const Text = (props: TextProps): VNode => {
  const style: Record<string, string> = {}
  if (props.color !== undefined) style.color = resolveColor(props.color)
  if (props.size !== undefined) {
    const px = SIZE_PX[props.size]
    if (px !== undefined) style['font-size'] = px
  }
  if (props.weight !== undefined) {
    const w = WEIGHT[props.weight]
    if (w !== undefined) style['font-weight'] = w
  }
  if (props.truncate) {
    style.overflow = 'hidden'
    style['text-overflow'] = 'ellipsis'
    style['white-space'] = 'nowrap'
  }
  return h('span', { style }, props.children)
}
