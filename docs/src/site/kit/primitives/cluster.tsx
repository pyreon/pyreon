import { h } from '@pyreon/core'
import type { SpaceKey } from '../../theme'
import { el } from '../bases'
import { flagsOf, layoutFlags, type LayoutProps, passThrough } from './shared'
import { type AlignX, type AlignY, type Responsive, spacePx } from './space'

const ClusterBase = el.config({ name: 'Cluster' }).multiple(layoutFlags)

export interface ClusterProps extends LayoutProps {
  /** Space between the children, across and between lines. */
  gap?: Responsive<SpaceKey> | undefined
  /** Horizontal distribution of the children (default `left`). */
  alignX?: AlignX | undefined
  /** Vertical alignment of the children in a line (Element's default: `center`). */
  alignY?: AlignY | undefined
  /** Keep the children on one line (default: they wrap). */
  nowrap?: boolean | undefined
}

/** Children in a row that wraps onto more lines, with one gap between them. */
export function Cluster(props: ClusterProps) {
  return h(
    ClusterBase,
    {
      ...passThrough(props),
      contentDirection: 'inline',
      contentAlignX: props.alignX,
      contentAlignY: props.alignY,
      gap: props.gap === undefined ? undefined : spacePx(props.gap),
      multiple: flagsOf(props, props.nowrap ? [] : ['wrap']),
    },
    props.children,
  )
}
