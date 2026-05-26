// Web implementation of `<Press>` — un-styled press wrapper.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { PressProps } from '../types/interaction'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Press>` — un-styled press wrapper for custom-chromed interactive
 * elements (clickable cards, icon-only buttons, etc.). Children
 * render as-is; press behavior is overlaid.
 *
 * Web impl: `<div role="button" tabIndex={0} onClick onKeyDown>`.
 * - `role="button"` + `tabIndex={0}` make the div keyboard-focusable
 *   and screen-reader-announced as a button.
 * - `onKeyDown` handles Enter + Space to trigger `onPress` (matches
 *   ARIA-button keyboard contract).
 *
 * Long-press on web: not natively supported; `onLongPress` fires
 * after 500ms of pointer-down (basic polyfill). Native targets use
 * platform gestures (`.onLongPressGesture` / `combinedClickable`).
 *
 * Compiles to:
 * - Web (this impl): `<div role="button">` with keyboard + click handlers
 * - iOS (via PMTC): `Button { ... }` (no chrome — invisible button)
 * - Android (via PMTC): `Box(modifier=Modifier.clickable(onClick=...))`
 */
export const Press = (props: PressProps): VNode => {
  const onClick = props.disabled ? undefined : props.onPress
  const onKeyDown = props.disabled
    ? undefined
    : (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          props.onPress()
        }
      }

  // Long-press polyfill — 500ms pointer-down without release.
  // Browsers don't have a native long-press event, so we synthesize
  // via pointerdown + setTimeout, cancel on pointerup/pointerleave.
  let longPressTimer: number | undefined
  const onPointerDown = props.onLongPress
    ? () => {
        longPressTimer = window.setTimeout(() => {
          if (!props.disabled) props.onLongPress?.()
          longPressTimer = undefined
        }, 500)
      }
    : undefined
  const onPointerUp = props.onLongPress
    ? () => {
        if (longPressTimer !== undefined) {
          clearTimeout(longPressTimer)
          longPressTimer = undefined
        }
      }
    : undefined

  const computedStyle: Record<string, string> = {
    cursor: props.disabled ? 'not-allowed' : 'pointer',
    'user-select': 'none',
  }
  const attrs: Record<string, unknown> = {
    ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
    role: 'button',
    tabIndex: props.disabled ? -1 : 0,
    // ARIA attrs are strings, not booleans — set "true" explicitly.
    'aria-disabled': props.disabled ? 'true' : undefined,
    style: mergePassthroughStyle(computedStyle, props.style),
    onClick,
    onKeyDown,
  }
  if (onPointerDown !== undefined) attrs.onPointerDown = onPointerDown
  if (onPointerUp !== undefined) {
    attrs.onPointerUp = onPointerUp
    attrs.onPointerLeave = onPointerUp
  }
  return h('div', attrs, props.children)
}
