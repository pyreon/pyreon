/**
 * Utility wrapper that injects className and/or style props into its
 * children without adding any DOM nodes of its own. Uses the core `render`
 * helper to clone children with the merged props.
 */

import type { VNode, VNodeChild } from '@pyreon/core'
import { render } from '@pyreon/ui-core'
import { PKG_NAME } from '../constants'
import type { PyreonComponent } from '../types'
import { hasGetterProps } from '../utils'

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

const UTIL_KEYS = ['children', 'className', 'style'] as const

const Component: PyreonComponent<Props> = ((props: Props) => {
  // Two-path reactive gate: a getter-shaped prop (compiler `_rp()` →
  // getter — e.g. `className={cls()}`) must be re-read per change, so the
  // body runs inside a reactive accessor. Pre-fix, the parameter destructure
  // fired every getter once and the render was a one-shot — the injected
  // class/style froze at its first value. Static props (the dominant case)
  // keep the one-shot render, byte-equivalent to the old body.
  const renderBody = () => {
    const { children, className, style } = props
    const mergedClasses = Array.isArray(className) ? className.join(' ') : className

    const finalProps: Record<string, any> = {}
    if (style) finalProps.style = style
    if (mergedClasses) finalProps.className = mergedClasses

    return render(children, finalProps) as VNode | null
  }

  return hasGetterProps(props, UTIL_KEYS) ? () => renderBody() : renderBody()
}) as PyreonComponent<Props>

const name = `${PKG_NAME}/Util` as const

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name

export default Component
