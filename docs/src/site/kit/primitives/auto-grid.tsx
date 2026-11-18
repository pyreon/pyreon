import { h } from '@pyreon/core'
import { space, type SpaceKey } from '../../theme'
import { el } from '../bases'
import { gridAttrs, type GridBaseProps, gridFlags, gridFlagsOf, gridTheme } from './grid-shared'

const AutoGridBase = el.config({ name: 'AutoGrid' }).attrs({ block: true }).theme(gridTheme).multiple(gridFlags)

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
  const gridTemplateColumns = props.cols
    ? { xs: `repeat(${props.colsBelow ?? 1},minmax(0,1fr))`, lg: `repeat(${props.cols},minmax(0,1fr))` }
    : `repeat(auto-fit,minmax(min(${props.min ?? 250}px,100%),1fr))`
  // A number is px and renders as rem against the theme's rootSize, as in a `.theme()`.
  const gap = space[props.gap ?? 175]
  const styles = { gap, gridTemplateColumns }

  return h(AutoGridBase, { ...gridAttrs(props), multiple: gridFlagsOf(props), styles }, props.children)
}
