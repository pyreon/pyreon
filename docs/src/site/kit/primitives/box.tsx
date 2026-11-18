import { h } from '@pyreon/core'
import type { StyleProps } from '@pyreon/elements'
import { space, type SpaceKey } from '../../theme'
import { el } from '../bases'
import { flagsOf, layoutFlags, type LayoutProps, passThrough } from './shared'
import type { Breakpoint, Responsive } from './space'

const BoxBase = el.config({ name: 'Box' }).multiple(layoutFlags)

type Padding = Responsive<SpaceKey>

export interface BoxProps extends LayoutProps {
  /** Padding on every side. */
  pad?: Padding | undefined
  /** Left and right padding (wins over `pad`). */
  padX?: Padding | undefined
  /** Top and bottom padding (wins over `pad`). */
  padY?: Padding | undefined
  /** Top padding (wins over `pad` and `padY`). */
  padTop?: Padding | undefined
  /** Bottom padding (wins over `pad` and `padY`). */
  padBottom?: Padding | undefined
}

type Side = 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft'

const SIDES = [
  ['pad', ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']],
  ['padY', ['paddingTop', 'paddingBottom']],
  ['padX', ['paddingLeft', 'paddingRight']],
  ['padTop', ['paddingTop']],
  ['padBottom', ['paddingBottom']],
] as const satisfies readonly (readonly [keyof BoxProps, readonly Side[]])[]

/**
 * Per-side, per-breakpoint padding as a typed `styles` override; within a
 * breakpoint the more specific prop comes later and wins. Values are px
 * numbers, rendered as rem against the theme's rootSize as in a `.theme()`.
 */
export function paddingStyles(p: BoxProps): StyleProps | undefined {
  const out: Partial<Record<Side, Partial<Record<Breakpoint, number>>>> = {}
  for (const [prop, sides] of SIDES) {
    const value = p[prop]
    if (value === undefined) continue
    const perBp: Partial<Record<Breakpoint, SpaceKey>> = typeof value === 'number' ? { xs: value } : value
    for (const bp of Object.keys(perBp) as Breakpoint[]) {
      const step = perBp[bp]
      if (step === undefined) continue
      for (const side of sides) out[side] = { ...out[side], [bp]: space[step] }
    }
  }

  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * A block with padding from the space scale, and nothing else: its children
 * stretch to its width and stack without a gap (use `Stack` for a gap).
 */
export function Box(props: BoxProps) {
  return h(BoxBase, { ...passThrough(props), contentAlignX: 'block', multiple: flagsOf(props), styles: paddingStyles(props) }, props.children)
}
