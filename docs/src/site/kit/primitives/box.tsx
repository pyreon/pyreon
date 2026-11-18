import { h } from '@pyreon/core'
import { space, type SpaceKey } from '../../theme'
import { el } from '../bases'
import { flagsOf, layoutFlags, type LayoutProps, passThrough } from './shared'
import type { Responsive } from './space'

// Declaration order is priority order: within a breakpoint a later param
// wins, so the more specific sides come after `pad`.
const BoxBase = el
  .config({ name: 'Box' })
  .multiple(layoutFlags)
  .params({
    pad: (k: SpaceKey) => ({ paddingTop: space[k], paddingRight: space[k], paddingBottom: space[k], paddingLeft: space[k] }),
    padY: (k: SpaceKey) => ({ paddingTop: space[k], paddingBottom: space[k] }),
    padX: (k: SpaceKey) => ({ paddingLeft: space[k], paddingRight: space[k] }),
    padTop: (k: SpaceKey) => ({ paddingTop: space[k] }),
    padBottom: (k: SpaceKey) => ({ paddingBottom: space[k] }),
  })

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

/**
 * A block with padding from the space scale, and nothing else: its children
 * stretch to its width and stack without a gap (use `Stack` for a gap).
 */
export function Box(props: BoxProps) {
  const { pad, padX, padY, padTop, padBottom } = props

  return h(
    BoxBase,
    { ...passThrough(props), contentAlignX: 'block', multiple: flagsOf(props), pad, padX, padY, padTop, padBottom },
    props.children,
  )
}
