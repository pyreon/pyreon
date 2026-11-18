import { h } from '@pyreon/core'
import type { SpaceKey } from '../../theme'
import { el } from '../bases'
import { gridAttrs, type GridBaseProps, gridFlags, gridFlagsOf, gridTheme } from './grid-shared'
import { type Breakpoint, type Responsive, spacePx } from './space'

const GridBase = el.config({ name: 'Grid' }).attrs({ block: true }).theme(gridTheme).multiple(gridFlags)

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
  const gridTemplateColumns: Partial<Record<Breakpoint, string>> = {}
  for (const bp of Object.keys(perBp) as Breakpoint[]) {
    const n = perBp[bp]
    if (n !== undefined) gridTemplateColumns[bp] = equalColumns(n)
  }

  return h(
    GridBase,
    {
      ...gridAttrs(props),
      gap: props.gap === undefined ? undefined : spacePx(props.gap),
      multiple: gridFlagsOf(props),
      styles: { gridTemplateColumns },
    },
    props.children,
  )
}
