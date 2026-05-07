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

import type { VNodeChild } from '@pyreon/core'
import { Portal as CorePortal, onUnmount } from '@pyreon/core'
import { PKG_NAME } from '../constants'
import type { PyreonComponent } from '../types'

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

  return <CorePortal target={wrapper}>{props.children}</CorePortal>
}

const name = `${PKG_NAME}/Portal` as const

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name

export default Component
