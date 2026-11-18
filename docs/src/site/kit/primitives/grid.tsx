import { h } from '@pyreon/core'
import type { SpaceKey } from '../../theme'
import { el } from '../bases'
import { gridAttrs, type GridBaseProps, gridFlags, gridFlagsOf, gridTheme } from './grid-shared'
import { type Responsive, spacePx } from './space'

/** `n` equal columns that never grow past the grid (`minmax(0, 1fr)`, so code and long words cannot widen the page). */
export const equalColumns = (n: number): string => (n === 1 ? 'minmax(0, 1fr)' : `repeat(${n}, minmax(0, 1fr))`)

const GridBase = el
  .config({ name: 'Grid' })
  .attrs({ block: true })
  .theme(gridTheme)
  .multiple(gridFlags)
  .params({ columns: (n: number) => ({ gridTemplateColumns: equalColumns(n) }) })

export interface GridProps extends GridBaseProps {
  /** Equal columns, or a count per breakpoint (`{ xs: 1, lg: 6 }`). */
  columns: Responsive<number>
  /** Space between rows and columns. */
  gap?: Responsive<SpaceKey> | undefined
}

/** A grid of equal columns, the count set per breakpoint. */
export function Grid(props: GridProps) {
  return h(
    GridBase,
    {
      ...gridAttrs(props),
      gap: props.gap === undefined ? undefined : spacePx(props.gap),
      multiple: gridFlagsOf(props),
      columns: props.columns,
    },
    props.children,
  )
}
