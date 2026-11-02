// Web implementation of `<Gesture>` — continuous pan / pinch / rotate.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { GestureProps } from '../types/gesture'
import { GestureTracker } from './gesture-tracker'
import type { GesturePoint } from './gesture-tracker'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Gesture>` — reports continuous pan / pinch / rotate gestures.
 *
 * Web impl: a `<div>` driven by pointer events. `touch-action: none` stops
 * the browser from scrolling or zooming the page under a gesture the app
 * handles itself. Pointer CAPTURE is taken only once a gesture passes the
 * slop: capturing on `pointerdown` would retarget the `click` of a button
 * inside the region to this element, so a child `<Press>` / `<Button>` would
 * stop working (the same swallowed-click class `@pyreon/flow` documents).
 *
 * Compiles to:
 * - Web (this impl): `<div style="touch-action: none">` + pointer events
 * - iOS (via PMTC): `PyreonGesture { … }` (simultaneous SwiftUI gestures)
 * - Android (via PMTC): `PyreonGesture { … }` (one `pointerInput` loop)
 */
export const Gesture = (props: GestureProps): VNode => {
  const pointers = new Map<number, GesturePoint>()
  let host: HTMLElement | null = null
  let origin = { left: 0, top: 0 }
  const tracker = new GestureTracker(() => ({
    onPan: props.onPan,
    onPinch: props.onPinch,
    onRotate: props.onRotate,
  }))

  const local = (e: PointerEvent): GesturePoint => ({
    x: e.clientX - origin.left,
    y: e.clientY - origin.top,
  })
  const feed = (e: PointerEvent): void => {
    const wasClaimed = tracker.claimed
    const claimed = tracker.update([...pointers.values()])
    if (claimed && !wasClaimed && host !== null) {
      // Claim every pointer of this gesture now that it is ours.
      for (const id of pointers.keys()) {
        try {
          host.setPointerCapture(id)
        } catch {
          // The pointer may already be gone (lifted between events).
        }
      }
    }
    if (claimed) e.preventDefault()
  }

  const onPointerDown = (e: PointerEvent): void => {
    host = e.currentTarget as HTMLElement
    if (pointers.size === 0) {
      const rect = host.getBoundingClientRect()
      origin = { left: rect.left, top: rect.top }
    }
    pointers.set(e.pointerId, local(e))
    feed(e)
  }
  const onPointerMove = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, local(e))
    feed(e)
  }
  const onPointerEnd = (e: PointerEvent): void => {
    if (!pointers.delete(e.pointerId)) return
    feed(e)
  }

  return h(
    'div',
    {
      ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
      style: mergePassthroughStyle({ 'touch-action': 'none' }, props),
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      // Before the gesture is claimed there is no capture, so a pointer that
      // leaves the region is never released here — drop it, or it would sit in
      // `pointers` and skew every later centroid.
      onPointerLeave: (e: PointerEvent) => {
        if (!tracker.claimed) onPointerEnd(e)
      },
    },
    props.children,
  )
}
