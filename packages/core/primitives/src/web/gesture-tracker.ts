// The continuous-gesture state machine shared by the web `<Gesture>`.
//
// It is deliberately DOM-free: it consumes per-frame pointer samples and
// produces the phase-tagged events, so the contract (one `start`, N `change`,
// one `end`; nothing before the touch slop; pinch/rotate only with two
// pointers) is unit-testable without a browser. The Android runtime carries
// the same machine in Kotlin (`PyreonGestureTracker`), so the two agree on
// when a gesture begins and what it reports.

import type { GesturePhase, PanEvent, PinchEvent, RotateEvent } from '../types/gesture'

/** Distance (px) a pointer must travel before any continuous gesture starts. */
export const GESTURE_SLOP = 10

export interface GestureHandlers {
  onPan?: ((e: PanEvent) => void) | undefined
  onPinch?: ((e: PinchEvent) => void) | undefined
  onRotate?: ((e: RotateEvent) => void) | undefined
}

/** One active pointer, in the gesture element's own coordinates. */
export interface GesturePoint {
  x: number
  y: number
}

const DEG = 180 / Math.PI

function centroid(pts: readonly GesturePoint[]): GesturePoint {
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  return { x: x / pts.length, y: y / pts.length }
}

/**
 * Tracks one gesture: from the first pointer down until the last pointer up.
 *
 * Pan translation follows the CENTROID of the active pointers. Pinch scale is
 * the ratio of the first two pointers' distance to their distance when the
 * pinch began; rotation is the change in the angle between them. When the
 * pointer set changes (a finger lands or lifts) the baselines are re-anchored,
 * so the reported values stay continuous instead of jumping.
 */
export class GestureTracker {
  private panX = 0
  private panY = 0
  private scale = 1
  private degrees = 0
  private pastSlop = false
  private panActive = false
  private pinchActive = false
  private rotateActive = false
  private centerX = 0
  private centerY = 0
  private last: { c: GesturePoint; dist: number; angle: number; count: number } | undefined
  private lastPan: PanEvent | undefined
  private lastPinch: PinchEvent | undefined
  private lastRotate: RotateEvent | undefined

  constructor(
    private readonly handlers: () => GestureHandlers,
    private readonly slop: number = GESTURE_SLOP,
  ) {}

  /** Whether the gesture has passed the slop (the element now owns the pointer). */
  get claimed(): boolean {
    return this.pastSlop
  }

  /**
   * Feed the CURRENT set of active pointers (after a down, move or up).
   * Returns whether the gesture is claimed.
   */
  update(points: readonly GesturePoint[]): boolean {
    if (points.length === 0) {
      this.finish()
      return false
    }
    const c = centroid(points)
    const two = points.length >= 2
    const a = points[0]!
    const b = points[1]
    const dist = two ? Math.hypot(b!.x - a.x, b!.y - a.y) : 0
    const angle = two ? Math.atan2(b!.y - a.y, b!.x - a.x) * DEG : 0
    const prev = this.last
    this.last = { c, dist, angle, count: points.length }
    // First sample, or the pointer set changed: re-anchor, report nothing.
    if (prev === undefined || prev.count !== points.length) return this.pastSlop

    this.panX += c.x - prev.c.x
    this.panY += c.y - prev.c.y
    if (two && prev.dist > 0) {
      this.scale *= dist / prev.dist
      let d = angle - prev.angle
      // Shortest way round: crossing the ±180° seam must not read as a spin.
      if (d > 180) d -= 360
      else if (d < -180) d += 360
      this.degrees += d
    }

    if (!this.pastSlop) {
      const spread = dist / 2
      this.pastSlop =
        Math.hypot(this.panX, this.panY) > this.slop ||
        (two && (Math.abs(1 - this.scale) * spread > this.slop ||
          Math.abs((this.degrees / DEG) * spread) > this.slop))
      if (!this.pastSlop) return false
    }

    const h = this.handlers()
    if (h.onPan !== undefined) {
      const ev: PanEvent = {
        dx: this.panX,
        dy: this.panY,
        x: c.x,
        y: c.y,
        phase: this.phase('pan'),
      }
      this.lastPan = ev
      h.onPan(ev)
    }
    if (two && h.onPinch !== undefined) {
      if (!this.pinchActive) {
        this.centerX = c.x
        this.centerY = c.y
      }
      const ev: PinchEvent = {
        scale: this.scale,
        centerX: this.centerX,
        centerY: this.centerY,
        phase: this.phase('pinch'),
      }
      this.lastPinch = ev
      h.onPinch(ev)
    }
    if (two && h.onRotate !== undefined) {
      const ev: RotateEvent = { degrees: this.degrees, phase: this.phase('rotate') }
      this.lastRotate = ev
      h.onRotate(ev)
    }
    return true
  }

  /** The gesture ended or was cancelled: deliver `end` for every started gesture, then reset. */
  finish(): void {
    const h = this.handlers()
    if (this.panActive && this.lastPan !== undefined) h.onPan?.({ ...this.lastPan, phase: 'end' })
    if (this.pinchActive && this.lastPinch !== undefined)
      h.onPinch?.({ ...this.lastPinch, phase: 'end' })
    if (this.rotateActive && this.lastRotate !== undefined)
      h.onRotate?.({ ...this.lastRotate, phase: 'end' })
    this.panX = 0
    this.panY = 0
    this.scale = 1
    this.degrees = 0
    this.pastSlop = false
    this.panActive = false
    this.pinchActive = false
    this.rotateActive = false
    this.last = undefined
    this.lastPan = undefined
    this.lastPinch = undefined
    this.lastRotate = undefined
  }

  private phase(kind: 'pan' | 'pinch' | 'rotate'): GesturePhase {
    const key = `${kind}Active` as const
    if (this[key]) return 'change'
    this[key] = true
    return 'start'
  }
}
