import { h } from '@pyreon/core'
import type { CssCallback } from '@pyreon/elements'
import { space, type SpaceKey } from '../../theme'
import { el } from '../bases'
import { gridAttrs, type GridBaseProps, gridFlags, gridFlagsOf, gridTheme } from './grid-shared'
import { columnModifiers, columnsOf, toColumnCount } from './modifiers'

const AutoGridBase = el
  .config({ name: 'AutoGrid' })
  .attrs({ block: true })
  .theme(gridTheme)
  .multiple(() => ({ ...gridFlags(), ...columnModifiers() }))

export interface AutoGridProps extends GridBaseProps {
  /** Fit as many columns as there is room for, each at least this many px (default 250). */
  min?: number | undefined
  /** Or: exactly this many equal columns from the `lg` breakpoint (992px); 1–12. */
  cols?: number | undefined
  /** `cols` collapse to this many columns below `lg` (default 1). */
  colsBelow?: number | undefined
  /** Space between rows and columns (default `175`, 14px). */
  gap?: SpaceKey | undefined
}

/**
 * Responsive grid without breakpoints to pick. `cols` → that many equal
 * columns from `lg`, `colsBelow` (default 1) below it, as `cols-<bp>-<n>`
 * modifiers. `min` → `repeat(auto-fit, minmax(min(<min>px, 100%), 1fr))`.
 *
 * `min` is any pixel width (the site uses fourteen different ones), so it
 * cannot be a named modifier; it is the one kit value that still goes through
 * the `css` escape hatch.
 */
export function AutoGrid(props: AutoGridProps) {
  const base = { ...gridAttrs(props), gap: space[props.gap ?? 175] }
  if (props.cols) {
    const columns = columnsOf({ xs: toColumnCount(props.colsBelow ?? 1), lg: toColumnCount(props.cols) })
    return h(AutoGridBase, { ...base, multiple: [...gridFlagsOf(props), ...columns] }, props.children)
  }
  const min = props.min ?? 250
  const columns: CssCallback = (c) => c`grid-template-columns:repeat(auto-fit,minmax(min(${min}px,100%),1fr));`

  return h(
    AutoGridBase,
    {
      ...base,
      multiple: gridFlagsOf(props),
      // `min` is an arbitrary px width, not a finite set a modifier can name.
      // pyreon-lint-disable-next-line pyreon/prefer-style-modifier
      css: columns,
    },
    props.children,
  )
}
