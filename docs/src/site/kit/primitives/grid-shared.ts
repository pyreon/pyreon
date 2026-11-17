import type { VNodeChild } from '@pyreon/core'
import type { A11yProps } from './space'

/** What a grid may render as. A `ul` / `ol` drops its bullets and its default indent. */
export type GridTag = 'div' | 'ul' | 'ol' | 'dl' | 'section'

export interface GridBaseProps extends A11yProps {
  tag?: GridTag | undefined
  /** May shrink below its content's width (`min-width: 0`). */
  shrink?: boolean | undefined
  children?: VNodeChild
}

export const gridFlags = () => ({
  list: { listStyle: 'none', margin: 0, padding: 0 },
  shrink: { minWidth: 0 },
})

/** `display: grid` in the theme, so the kit's `el` base gives the items the CSS grid default (stretch) back instead of Element's flex alignment. */
export const gridTheme = () => ({ display: 'grid' })

export function gridFlagsOf(p: GridBaseProps): ('list' | 'shrink')[] {
  const out: ('list' | 'shrink')[] = []
  if (p.tag === 'ul' || p.tag === 'ol') out.push('list')
  if (p.shrink) out.push('shrink')

  return out
}

export const gridAttrs = (p: GridBaseProps) => ({
  tag: p.tag ?? 'div',
  id: p.id,
  role: p.role,
  'aria-label': p['aria-label'],
  'aria-labelledby': p['aria-labelledby'],
  'aria-hidden': p['aria-hidden'],
})
