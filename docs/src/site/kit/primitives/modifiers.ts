import { breakpoints, space, type SpaceKey } from '../../theme'
import type { Breakpoint, Responsive } from './space'

/**
 * Caller-chosen layout values as named theme modifiers.
 *
 * A primitive's typed props (`columns`, `pad`, …) are PARAMETERS, not looks,
 * but rocketstyle has no way to read a prop in `.theme()`. So each primitive
 * declares every value its prop can take as a `.multiple()` modifier, once
 * (`cols-md-3`, `pt-lg-200`, …), and maps its props to the list in the render
 * function, the way `flagsOf` / `gridFlagsOf` map `shrink` and `tag`. The
 * values go through the theme pipeline (rem against `rootSize`, em media
 * queries) and the dimension memo, so equal props share one class, and no
 * CSS reaches the element through a prop.
 *
 * A responsive slice wins from its own breakpoint up and keeps the earlier
 * value below it (rocketstyle `mergeTheme`), so the lists are emitted in
 * breakpoint order, smallest first.
 */

/** The theme breakpoints, smallest first. */
export const BREAKPOINTS = (Object.keys(breakpoints) as Breakpoint[]).sort((a, b) => breakpoints[a] - breakpoints[b])

/** The column counts a grid primitive takes. */
export type ColumnCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
const COLUMN_COUNTS: readonly ColumnCount[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** A computed column count clamped to the modifier range (1–12, whole). */
export const toColumnCount = (n: number): ColumnCount => Math.min(12, Math.max(1, Math.round(n))) as ColumnCount

/** `n` equal columns that never grow past the grid (`minmax(0, 1fr)`, so code and long words cannot widen the page). */
export const equalColumns = (n: number): string => (n === 1 ? 'minmax(0, 1fr)' : `repeat(${n}, minmax(0, 1fr))`)

export type ColumnsModifier = `cols-${Breakpoint}-${ColumnCount}`

/** `cols-<bp>-<n>`: `n` equal columns from breakpoint `bp` up. */
export const columnModifiers = (): Record<ColumnsModifier, { gridTemplateColumns: Partial<Record<Breakpoint, string>> }> => {
  const out = {} as Record<ColumnsModifier, { gridTemplateColumns: Partial<Record<Breakpoint, string>> }>
  for (const bp of BREAKPOINTS) {
    for (const n of COLUMN_COUNTS) out[`cols-${bp}-${n}`] = { gridTemplateColumns: { [bp]: equalColumns(n) } }
  }

  return out
}

/** The modifiers for a column count, one or per breakpoint. */
export function columnsOf(columns: Responsive<ColumnCount>): ColumnsModifier[] {
  const perBp: Partial<Record<Breakpoint, ColumnCount>> = typeof columns === 'number' ? { xs: columns } : columns
  const out: ColumnsModifier[] = []
  for (const bp of BREAKPOINTS) {
    const n = perBp[bp]
    if (n !== undefined) out.push(`cols-${bp}-${n}`)
  }

  return out
}

export type Side = 'top' | 'right' | 'bottom' | 'left'
const SIDE_KEY = { top: 'paddingTop', right: 'paddingRight', bottom: 'paddingBottom', left: 'paddingLeft' } as const
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

export type PaddingModifier = `pad-${Side}-${Breakpoint}-${SpaceKey}`

/** `pad-<side>-<bp>-<space key>`: that side's padding from breakpoint `bp` up (px from the space scale, rendered as rem). */
export const paddingModifiers = (): Record<PaddingModifier, Partial<Record<(typeof SIDE_KEY)[Side], Partial<Record<Breakpoint, number>>>>> => {
  const out = {} as Record<PaddingModifier, Partial<Record<(typeof SIDE_KEY)[Side], Partial<Record<Breakpoint, number>>>>>
  for (const side of SIDES) {
    for (const bp of BREAKPOINTS) {
      for (const key of Object.keys(space).map(Number) as SpaceKey[]) {
        out[`pad-${side}-${bp}-${key}`] = { [SIDE_KEY[side]]: { [bp]: space[key] } }
      }
    }
  }

  return out
}

/**
 * The modifiers for per-side, per-breakpoint padding. `layers` come in
 * increasing specificity (`pad`, then `padY`, then `padTop`): within a
 * breakpoint a later layer wins for its sides.
 */
export function paddingOf(layers: readonly (readonly [Responsive<SpaceKey> | undefined, readonly Side[]])[]): PaddingModifier[] {
  const resolved: Partial<Record<Side, Partial<Record<Breakpoint, SpaceKey>>>> = {}
  for (const [value, sides] of layers) {
    if (value === undefined) continue
    const perBp: Partial<Record<Breakpoint, SpaceKey>> = typeof value === 'number' ? { xs: value } : value
    for (const bp of BREAKPOINTS) {
      const step = perBp[bp]
      if (step === undefined) continue
      for (const side of sides) resolved[side] = { ...resolved[side], [bp]: step }
    }
  }
  const out: PaddingModifier[] = []
  for (const side of SIDES) {
    for (const bp of BREAKPOINTS) {
      const step = resolved[side]?.[bp]
      if (step !== undefined) out.push(`pad-${side}-${bp}-${step}`)
    }
  }

  return out
}
