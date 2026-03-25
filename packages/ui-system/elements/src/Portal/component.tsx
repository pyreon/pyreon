/**
 * Portal component stub. In Pyreon, the actual Portal is provided by
 * @pyreon/core's runtime-dom. This component re-exports it for API
 * compatibility with the elements package structure.
 */

import type { VNodeChild } from "@pyreon/core"
import { Portal as CorePortal } from "@pyreon/core"
import { PKG_NAME } from "../constants"
import type { PyreonComponent } from "../types"

export interface Props {
  /**
   * Defines a HTML DOM where children to be appended.
   */
  DOMLocation?: HTMLElement
  /**
   * Children to be rendered within **Portal** component.
   */
  children: VNodeChild
  /**
   * Valid HTML Tag
   */
  tag?: string
}

const Component: PyreonComponent<Props> = ({ DOMLocation, tag: _tag = "div", children }) => {
  const target = DOMLocation ?? (typeof document !== "undefined" ? document.body : undefined)

  if (!target) return null

  return <CorePortal target={target}>{children}</CorePortal>
}

const name = `${PKG_NAME}/Portal` as const

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name

export default Component
