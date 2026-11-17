import type { VNodeChild } from '@pyreon/core'
import type { A11yProps } from './space'

/**
 * Box, Stack and Cluster: the site's flex layout primitives, on the kit's `el`
 * base (`@pyreon/elements` Element), so they emit the same CSS a hand-written
 * `el.config(…).attrs({ block, contentDirection, gap, … })` did.
 *
 * Contract (every primitive in this folder):
 *   - no outer margin: space between siblings is the parent's `gap`;
 *   - gap and padding take `space` keys (`theme.ts`), never pixels;
 *   - layout props are read once, when the primitive renders (static layout).
 */

/** What a layout primitive may render as. A `ul` / `ol` drops its bullets and its default indent. */
export type LayoutTag = 'div' | 'section' | 'article' | 'aside' | 'header' | 'footer' | 'nav' | 'figure' | 'ul' | 'ol' | 'li' | 'p' | 'dl'

export interface LayoutProps extends A11yProps {
  /** The element (default `div`). */
  tag?: LayoutTag | undefined
  /** Shrink-wrap the content (inline-flex) instead of taking the full width. */
  inline?: boolean | undefined
  /** May shrink below its content's width (`min-width: 0`): a column of a grid or a flex row that holds code or long words. */
  shrink?: boolean | undefined
  /** Align itself to the start of its parent's cross axis (`align-self: start`), instead of stretching. */
  selfStart?: boolean | undefined
  children?: VNodeChild
}

/** Flags every layout primitive shares (rocketstyle's multi-value `multiple` dimension). */
export const layoutFlags = () => ({
  shrink: { minWidth: 0 },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  selfStart: { alignSelf: 'start' },
  wrap: { flexWrap: 'wrap' },
})

export type Flag = keyof ReturnType<typeof layoutFlags>

export function flagsOf(p: LayoutProps, extra: readonly Flag[] = []): Flag[] {
  const out: Flag[] = [...extra]
  if (p.shrink) out.push('shrink')
  if (p.selfStart) out.push('selfStart')
  if (p.tag === 'ul' || p.tag === 'ol') out.push('list')

  return out
}

/** The attributes a primitive hands to its element unchanged. */
export function passThrough(p: LayoutProps) {
  return {
    tag: p.tag ?? 'div',
    block: !p.inline,
    id: p.id,
    role: p.role,
    'aria-label': p['aria-label'],
    'aria-labelledby': p['aria-labelledby'],
    'aria-hidden': p['aria-hidden'],
  }
}
