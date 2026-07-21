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

// PURE-form branding (sibling of the PURE-form nativeCompat sweep, #2368).
// A top-level `Component.x = y` assignment is an unremovable side effect the
// moment ANY binding of this module is used — it pinned EVERY component in
// this package into every consumer bundle (importing just <Portal> paid the
// whole 7.5KB gz of @pyreon/elements; measured: stripping these assignments
// took Portal-only to 2.36KB). `Object.assign` returns the SAME function
// (identity, call sites, stack traces unchanged); the PURE marker makes the
// branding droppable exactly when this component is unused.
export default /* @__PURE__ */ Object.assign(Component, {
  displayName: name,
  pkgName: PKG_NAME,
  PYREON__COMPONENT: name,
})
