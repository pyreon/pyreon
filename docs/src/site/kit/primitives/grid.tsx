import { h } from '@pyreon/core'
import type { SpaceKey } from '../../theme'
import { el } from '../bases'
import { gridAttrs, type GridBaseProps, gridFlags, gridFlagsOf, gridTheme } from './grid-shared'
import { type ColumnCount, columnModifiers, columnsOf } from './modifiers'
import { type Responsive, spacePx } from './space'

export { equalColumns } from './modifiers'

const GridBase = el
  .config({ name: 'Grid' })
  .attrs({ block: true })
  .theme(gridTheme)
  .multiple(() => ({ ...gridFlags(), ...columnModifiers() }))

export interface GridProps extends GridBaseProps {
  /** Equal columns, or a count per breakpoint (`{ xs: 1, lg: 6 }`). */
  columns: Responsive<ColumnCount>
  /** Space between rows and columns. */
  gap?: Responsive<SpaceKey> | undefined
}

/** A grid of equal columns, the count set per breakpoint (one `cols-<bp>-<n>` modifier each). */
export function Grid(props: GridProps) {
  return h(
    GridBase,
    {
      ...gridAttrs(props),
      gap: props.gap === undefined ? undefined : spacePx(props.gap),
      multiple: [...gridFlagsOf(props), ...columnsOf(props.columns)],
    },
    props.children,
  )
}
