/**
 * Context for nested overlay coordination. When a child overlay opens, it
 * sets the parent's blocked state to true, preventing the parent from
 * closing in response to click/hover events that belong to the child.
 */

import type { VNodeChild } from '@pyreon/core'
import { createContext, nativeCompat, provide, useContext } from '@pyreon/core'

export interface OverlayContext {
  blocked: boolean | (() => boolean)
  setBlocked: () => void
  setUnblocked: () => void
}

const NO_OP = () => {}

const context = createContext<OverlayContext>({
  blocked: false,
  setBlocked: NO_OP,
  setUnblocked: NO_OP,
})

export const useOverlayContext = () => useContext(context)

// Coordination props are OPTIONAL — a root `<OverlayProvider>{app}</OverlayProvider>`
// establishes the overlay context with no-op defaults (the documented usage),
// while the INTERNAL `<Provider {...ctx}>` spread from `useOverlay` supplies a
// real `blocked` / `setBlocked` / `setUnblocked` so a nested overlay can block
// its parent from closing. Making them required (the previous shape) made the
// documented root-provider form a type error AND relied on `useOverlay`'s
// `ctx.setBlocked?.()` optional chaining to survive the resulting `undefined`s.
const Component = (props: Partial<OverlayContext> & { children?: VNodeChild }) => {
  const ctx: OverlayContext = {
    blocked: props.blocked ?? false,
    setBlocked: props.setBlocked ?? NO_OP,
    setUnblocked: props.setUnblocked ?? NO_OP,
  }

  provide(context, ctx)

  return <>{props.children}</>
}

// Mark as native — invoked by Overlay internally; needs Pyreon's setup
// frame for provide(context, ...) to reach descendant overlays.

// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
export default /* @__PURE__ */ nativeCompat(Component)