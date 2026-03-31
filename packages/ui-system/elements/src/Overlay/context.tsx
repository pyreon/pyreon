/**
 * Context for nested overlay coordination. When a child overlay opens, it
 * sets the parent's blocked state to true, preventing the parent from
 * closing in response to click/hover events that belong to the child.
 */

import type { VNodeChild } from '@pyreon/core'
import { createContext, provide, useContext } from '@pyreon/core'

export interface OverlayContext {
  blocked: boolean | (() => boolean)
  setBlocked: () => void
  setUnblocked: () => void
}

const context = createContext<OverlayContext>({} as OverlayContext)

export const useOverlayContext = () => useContext(context)

const Component = (props: OverlayContext & { children: VNodeChild }) => {
  const ctx = {
    blocked: props.blocked,
    setBlocked: props.setBlocked,
    setUnblocked: props.setUnblocked,
  }

  provide(context, ctx)

  return <>{props.children}</>
}

export default Component
