import { h } from '@pyreon/core'
import type { SpaceKey } from '../../theme'
import { el } from '../bases'
import { flagsOf, layoutFlags, type LayoutProps, passThrough } from './shared'
import { type AlignX, type AlignY, type Responsive, spacePx } from './space'

const StackBase = el.config({ name: 'Stack' }).multiple(layoutFlags)

export interface StackProps extends LayoutProps {
  /** Space between the children (a `space` key, or one per breakpoint). */
  gap?: Responsive<SpaceKey> | undefined
  /** Horizontal alignment of the children: `block` (default) stretches them to the stack's width. */
  alignX?: AlignX | undefined
  /** Vertical distribution when the stack is taller than its content (Element's default: `center`). */
  alignY?: AlignY | undefined
}

/** Children in a column with a gap between them. */
export function Stack(props: StackProps) {
  return h(
    StackBase,
    {
      ...passThrough(props),
      contentDirection: 'rows',
      contentAlignX: props.alignX ?? 'block',
      contentAlignY: props.alignY,
      gap: props.gap === undefined ? undefined : spacePx(props.gap),
      multiple: flagsOf(props),
    },
    props.children,
  )
}
