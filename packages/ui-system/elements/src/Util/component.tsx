/**
 * Utility wrapper that injects className and/or style props into its
 * children without adding any DOM nodes of its own. Uses the core `render`
 * helper to clone children with the merged props.
 */

import type { VNode, VNodeChild } from '@pyreon/core'
import { render } from '@pyreon/ui-core'
import { PKG_NAME } from '../constants'
import type { PyreonComponent } from '../types'

export interface Props {
  /**
   * Children to be rendered within **Util** component.
   */
  children: VNodeChild
  /**
   * Class name(s) to be added to children component.
   */
  className?: string | string[] | undefined
  /**
   * Style property to extend children component inline styles
   */
  style?: Record<string, unknown> | undefined
}

const Component: PyreonComponent<Props> = (({ children, className, style }: Props) => {
  const mergedClasses = Array.isArray(className) ? className.join(' ') : className

  const finalProps: Record<string, any> = {}
  if (style) finalProps.style = style
  if (mergedClasses) finalProps.className = mergedClasses

  return render(children, finalProps) as VNode | null
}) as PyreonComponent<Props>

const name = `${PKG_NAME}/Util` as const

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name

export default Component
