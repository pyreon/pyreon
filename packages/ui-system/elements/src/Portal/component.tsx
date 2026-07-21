/**
 * Portal — renders children into a per-instance wrapper element appended to
 * `DOMLocation` (defaults to `document.body`). Mirrors vitus-labs's Portal:
 * a fresh wrapper is created per Portal mount, children render INSIDE it
 * (not directly into DOMLocation), and the wrapper is removed on unmount.
 *
 * Per-instance wrapper isolation matters when multiple Portals share a
 * DOMLocation (e.g. several modals on `document.body`) — without the wrapper
 * their children would intermingle, defeating CSS scoping and making
 * cleanup brittle.
 */

import type { VNodeChild, VNodeChildAtom } from '@pyreon/core'
import { Portal as CorePortal, onUnmount } from '@pyreon/core'
import { PKG_NAME } from '../constants'
import type { PyreonComponent } from '../types'
import { hasGetterProps } from '../utils'

export interface Props {
  /**
   * DOM element to mount the wrapper into. Defaults to `document.body`.
   */
  DOMLocation?: HTMLElement
  /**
   * Children rendered inside the wrapper.
   */
  children: VNodeChild
  /**
   * HTML tag for the per-instance wrapper element. Defaults to `'div'`.
   */
  tag?: string
}

const Component: PyreonComponent<Props> = (props) => {
  if (typeof document === 'undefined') return null

  const tag = props.tag ?? 'div'
  const target = props.DOMLocation ?? document.body
  const wrapper = document.createElement(tag)
  target.appendChild(wrapper)

  onUnmount(() => {
    wrapper.remove()
  })

  // Defensive children gate: `{props.children}` compiles to a JS-level value
  // read — a getter-shaped `children` PROP (`children: _rp(() => sig())`)
  // would be captured once and freeze. Wrap in an accessor ONLY in that case
  // (mountChild handles nested accessors, so an already-accessor-valued
  // children double-wraps safely); static children keep today's zero-cost
  // path.
  const children: VNodeChild = hasGetterProps(props, ['children'])
    ? // The runtime resolves nested accessors (mountChild's function branch),
      // but the VNodeChildAccessor TYPE is single-level — narrow the return.
      () => props.children as VNodeChildAtom | VNodeChildAtom[]
    : props.children

  return <CorePortal target={wrapper}>{children}</CorePortal>
}

const name = `${PKG_NAME}/Portal` as const

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
