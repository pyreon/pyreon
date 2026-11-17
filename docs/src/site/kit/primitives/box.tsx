import { h } from '@pyreon/core'
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

const SIDES = [
  ['pad', ['top', 'right', 'bottom', 'left']],
  ['padY', ['top', 'bottom']],
  ['padX', ['left', 'right']],
  ['padTop', ['top']],
  ['padBottom', ['bottom']],
] as const

/** Per-breakpoint padding declarations; within a breakpoint the more specific prop comes last and wins. */
export function paddingCss(p: BoxProps): Partial<Record<Breakpoint, string>> | undefined {
  const out: Partial<Record<Breakpoint, string>> = {}
  for (const [prop, sides] of SIDES) {
    const value = p[prop]
    if (value === undefined) continue
    const perBp: Partial<Record<Breakpoint, SpaceKey>> = typeof value === 'number' ? { xs: value } : value
    for (const bp of Object.keys(perBp) as Breakpoint[]) {
      const step = perBp[bp]
      if (step === undefined) continue
      out[bp] = (out[bp] ?? '') + sides.map((s) => `padding-${s}:${space[step]}px;`).join('')
    }
  }

  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * A block with padding from the space scale, and nothing else: its children
 * stretch to its width and stack without a gap (use `Stack` for a gap).
 */
export function Box(props: BoxProps) {
  return h(BoxBase, { ...passThrough(props), contentAlignX: 'block', multiple: flagsOf(props), css: paddingCss(props) }, props.children)
}
