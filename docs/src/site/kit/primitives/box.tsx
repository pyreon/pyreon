import { h } from '@pyreon/core'
import type { SpaceKey } from '../../theme'
import { el } from '../bases'
import { paddingModifiers, paddingOf } from './modifiers'
import { flagsOf, layoutFlags, type LayoutProps, passThrough } from './shared'
import type { Responsive } from './space'

const BoxBase = el.config({ name: 'Box' }).multiple(() => ({ ...layoutFlags(), ...paddingModifiers() }))

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
 * stretch to its width and stack without a gap (use `Stack` for a gap). The
 * padding props map to `pad-<side>-<bp>-<key>` modifiers; within a breakpoint
 * the more specific prop wins.
 */
export function Box(props: BoxProps) {
  const padding = paddingOf([
    [props.pad, ['top', 'right', 'bottom', 'left']],
    [props.padY, ['top', 'bottom']],
    [props.padX, ['left', 'right']],
    [props.padTop, ['top']],
    [props.padBottom, ['bottom']],
  ])

  return h(BoxBase, { ...passThrough(props), contentAlignX: 'block', multiple: [...flagsOf(props), ...padding] }, props.children)
}
