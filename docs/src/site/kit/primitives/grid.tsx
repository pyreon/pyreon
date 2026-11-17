import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { media, space, type SpaceKey } from '../../theme'
import { el } from '../bases'
import { type A11yProps, type Breakpoint, type Responsive, spacePx } from './space'

/** What a grid may render as. A `ul` / `ol` drops its bullets and its default indent. */
export type GridTag = 'div' | 'ul' | 'ol' | 'dl' | 'section'

interface GridBaseProps extends A11yProps {
  tag?: GridTag | undefined
  /** May shrink below its content's width (`min-width: 0`). */
  shrink?: boolean | undefined
  children?: VNodeChild
}

const gridFlags = () => ({
  list: { listStyle: 'none', margin: 0, padding: 0 },
  shrink: { minWidth: 0 },
})

/**
 * `display: grid` in the theme, so the kit's `el` base gives the items the
 * CSS grid default (stretch) back instead of Element's flex alignment.
 */
const GridBase = el.config({ name: 'Grid' }).attrs({ block: true }).theme(() => ({ display: 'grid' })).multiple(gridFlags)
const AutoGridBase = el.config({ name: 'AutoGrid' }).attrs({ block: true }).theme(() => ({ display: 'grid' })).multiple(gridFlags)

function flagsOf(p: GridBaseProps): ('list' | 'shrink')[] {
  const out: ('list' | 'shrink')[] = []
  if (p.tag === 'ul' || p.tag === 'ol') out.push('list')
  if (p.shrink) out.push('shrink')

  return out
}

const attrsOf = (p: GridBaseProps) => ({
  tag: p.tag ?? 'div',
  id: p.id,
  role: p.role,
  'aria-label': p['aria-label'],
  'aria-labelledby': p['aria-labelledby'],
  'aria-hidden': p['aria-hidden'],
})

/** `n` equal columns that never grow past the grid (`minmax(0, 1fr)`, so code and long words cannot widen the page). */
export const equalColumns = (n: number): string => (n === 1 ? 'minmax(0, 1fr)' : `repeat(${n}, minmax(0, 1fr))`)

export interface GridProps extends GridBaseProps {
  /** Equal columns, or a count per breakpoint (`{ xs: 1, lg: 6 }`). */
  columns: Responsive<number>
  /** Space between rows and columns. */
  gap?: Responsive<SpaceKey> | undefined
}

/** A grid of equal columns, the count set per breakpoint. */
export function Grid(props: GridProps) {
  const cols = props.columns
  const perBp: Partial<Record<Breakpoint, number>> = typeof cols === 'number' ? { xs: cols } : cols
  const css: Partial<Record<Breakpoint, string>> = {}
  for (const bp of Object.keys(perBp) as Breakpoint[]) {
    const n = perBp[bp]
    if (n !== undefined) css[bp] = `grid-template-columns:${equalColumns(n)};`
  }

  return h(
    GridBase,
    { ...attrsOf(props), gap: props.gap === undefined ? undefined : spacePx(props.gap), multiple: flagsOf(props), css },
    props.children,
  )
}

export interface AutoGridProps extends GridBaseProps {
  /** Fit as many columns as there is room for, each at least this many px (default 250). */
  min?: number | undefined
  /** Or: exactly this many equal columns from the `lg` breakpoint (992px). */
  cols?: number | undefined
  /** `cols` collapse to this many columns below `lg` (default 1). */
  colsBelow?: number | undefined
  /** Space between rows and columns (default `175`, 14px). */
  gap?: SpaceKey | undefined
}

/**
 * Responsive grid without breakpoints to pick. `min` →
 * `repeat(auto-fit, minmax(min(<min>px, 100%), 1fr))`; `cols` → that many
 * equal columns from `lg`, `colsBelow` (default 1) below it.
 */
export function AutoGrid(props: AutoGridProps) {
  const gap = space[props.gap ?? 175]
  const columns = props.cols
    ? `grid-template-columns:repeat(${props.colsBelow ?? 1},minmax(0,1fr));${media.up.lg}{grid-template-columns:repeat(${props.cols},minmax(0,1fr));}`
    : `grid-template-columns:repeat(auto-fit,minmax(min(${props.min ?? 250}px,100%),1fr));`

  return h(AutoGridBase, { ...attrsOf(props), multiple: flagsOf(props), css: `gap:${gap}px;${columns}` }, props.children)
}
