// Continuous-gesture primitive type definitions — `<Gesture>`.

import type { ChildrenProp, HtmlPassthroughProps } from './shared'

/**
 * Where a continuous gesture is in its lifecycle. Every recognised gesture
 * delivers exactly one `'start'`, any number of `'change'`, then exactly one
 * `'end'` (also delivered when the system cancels the gesture). Commit
 * accumulated state on `'end'` — the next gesture starts again from zero.
 */
export type GesturePhase = 'start' | 'change' | 'end'

/**
 * A pan (drag) update. Translation is CUMULATIVE since the gesture began, in
 * px (web) / pt (iOS) / dp (Android) — the same unit as layout values.
 */
export interface PanEvent {
  /** Horizontal translation since the gesture began. Positive = rightward. */
  dx: number
  /** Vertical translation since the gesture began. Positive = downward. */
  dy: number
  /** Current pointer location, in the `<Gesture>` element's own coordinates. */
  x: number
  /** Current pointer location, in the `<Gesture>` element's own coordinates. */
  y: number
  phase: GesturePhase
}

/**
 * A pinch (two-finger zoom) update. `scale` is CUMULATIVE since the gesture
 * began: `1` = unchanged, `2` = fingers twice as far apart. A pinch begins
 * only once two pointers are down.
 */
export interface PinchEvent {
  scale: number
  /** The pinch anchor (where the two fingers started), in element coordinates. */
  centerX: number
  /** The pinch anchor (where the two fingers started), in element coordinates. */
  centerY: number
  phase: GesturePhase
}

/**
 * A two-finger rotation update. `degrees` is CUMULATIVE since the gesture
 * began; positive = clockwise (screen coordinates, y pointing down).
 */
export interface RotateEvent {
  degrees: number
  phase: GesturePhase
}

/**
 * `<Gesture>` — a region that recognises CONTINUOUS gestures (pan, pinch,
 * rotate) and reports their values, so the values can drive content —
 * typically through the {@link TransformProps} of a CHILD element.
 *
 * Discrete gestures (tap, long-press, swipe) belong on `<Press>`; a `<Press>`
 * is a button for assistive tech, which a zoomable floor plan is not. A
 * `<Press>` inside a `<Gesture>` still receives its taps: a continuous gesture
 * only claims the pointer once it has moved past the touch slop (10px/pt,
 * the platform touch slop on Android).
 *
 * The recognisers run SIMULTANEOUSLY — a two-finger gesture can pan, pinch
 * and rotate at once. Only the gestures you pass a handler for are attached.
 *
 * Apply transforms to a CHILD, not to the `<Gesture>` itself: each target
 * reports in the region's own coordinate space, so transforming the region
 * makes the reported values feed back into themselves.
 *
 * Per-platform mapping:
 * - Web: pointer events on a `<div style="touch-action: none">`
 * - iOS: `PyreonGesture { … }` — simultaneous `DragGesture` /
 *   `MagnifyGesture` / `RotateGesture`
 * - Android: `PyreonGesture { … }` — one `pointerInput` loop over
 *   `calculatePan` / `calculateZoom` / `calculateRotation`
 *
 * Known divergence: during a TWO-finger gesture the pan translation follows
 * the centroid of the fingers on web and Android, and the first finger on
 * iOS (SwiftUI's `DragGesture` tracks one touch).
 *
 * @example
 * ```tsx
 * const scale = signal(1.0)
 * const base = signal(1.0)
 * <Gesture
 *   onPinch={(e) => {
 *     scale.set(base() * e.scale)
 *     if (e.phase === 'end') base.set(scale())
 *   }}
 * >
 *   <Stack scale={scale()}>…</Stack>
 * </Gesture>
 * ```
 */
export interface GestureProps extends ChildrenProp, HtmlPassthroughProps {
  onPan?: (e: PanEvent) => void
  onPinch?: (e: PinchEvent) => void
  onRotate?: (e: RotateEvent) => void
}
