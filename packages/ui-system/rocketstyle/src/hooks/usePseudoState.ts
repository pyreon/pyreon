import { signal } from "@pyreon/reactivity"
import type { PseudoActions, PseudoState } from "../types/pseudo"

type UsePseudoState = ({
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  onFocus,
  onBlur,
}: Partial<PseudoActions>) => {
  state: Pick<PseudoState, "hover" | "focus" | "pressed">
  events: PseudoActions
}

/**
 * Tracks hover, focus, and pressed pseudo-states via mouse and focus
 * event handlers. Returns the current state flags and wrapped event
 * callbacks that preserve any user-provided handlers.
 *
 * In Pyreon, uses signals instead of useState. Components are plain
 * functions that run once — no useCallback/useMemo needed.
 */
const usePseudoState: UsePseudoState = ({
  onBlur,
  onFocus,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onMouseUp,
}) => {
  const hover = signal(false)
  const focus = signal(false)
  const pressed = signal(false)

  const state = {
    get hover() {
      return hover()
    },
    get focus() {
      return focus()
    },
    get pressed() {
      return pressed()
    },
  }

  const events: PseudoActions = {
    onMouseEnter: (e) => {
      hover.set(true)
      if (onMouseEnter) onMouseEnter(e)
    },
    onMouseLeave: (e) => {
      hover.set(false)
      pressed.set(false)
      if (onMouseLeave) onMouseLeave(e)
    },
    onMouseDown: (e) => {
      pressed.set(true)
      if (onMouseDown) onMouseDown(e)
    },
    onMouseUp: (e) => {
      pressed.set(false)
      if (onMouseUp) onMouseUp(e)
    },
    onFocus: (e) => {
      focus.set(true)
      if (onFocus) onFocus(e)
    },
    onBlur: (e) => {
      focus.set(false)
      if (onBlur) onBlur(e)
    },
  }

  return { state, events }
}

export default usePseudoState
