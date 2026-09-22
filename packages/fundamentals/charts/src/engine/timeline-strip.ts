// The ECharts `timeline` component — its strip, controls and stepping rules.
//
// One geometry for every target: the web canvas and SVG hosts and the SwiftUI
// / Compose hosts draw these commands, hit-test with `timelineHit` and step
// with `timelineAdvance`, so a tap on the third checkpoint or the play button
// does the same thing everywhere.

import type { Double, DrawCmd, Rect } from './types'

export interface TimelineStrip {
  labels: string[]
  /** `loop` (default true): past the last step, auto-play starts again. */
  loop: boolean
  /** `rewind`: play backwards. */
  rewind: boolean
  /** `controlStyle.showPlayBtn` / `showPrevBtn` / `showNextBtn`. */
  showPlay: boolean
  showPrev: boolean
  showNext: boolean
  label: string
  accent: string
  line: string
  fontSize: Double
}

/** What a point in the strip hits. */
export interface TimelineHit {
  /** 0 = nothing, 1 = a checkpoint (`index`), 2 = play / pause, 3 = previous, 4 = next. */
  kind: Double
  index: Double
}

export const TIMELINE_STRIP_HEIGHT = 40.0
const PAD = 24.0
const BTN = 18.0
const BTN_GAP = 6.0

/** The axis's ends and centre line. */
export interface TimelineAxis {
  x0: Double
  x1: Double
  cy: Double
}

/** The axis ends, after the control buttons take their room on the left. */
function axisSpan(s: TimelineStrip, box: Rect): TimelineAxis {
  let left = box.x + PAD
  if (s.showPlay) left = left + BTN + BTN_GAP
  if (s.showPrev) left = left + BTN + BTN_GAP
  let right = box.x + box.w - PAD
  if (s.showNext) right = right - BTN - BTN_GAP
  return { x0: left, x1: right > left ? right : left, cy: box.y + box.h * 0.4 }
}

function stepCount(s: TimelineStrip): Double {
  let n = 0.0
  for (const _l of s.labels) n = n + 1.0
  return n
}

function checkpointX(s: TimelineStrip, box: Rect, i: Double): Double {
  const a = axisSpan(s, box)
  const n = stepCount(s)
  return n <= 1.0 ? (a.x0 + a.x1) / 2.0 : a.x0 + ((a.x1 - a.x0) * i) / (n - 1.0)
}

/** Button centres, left to right: play, prev on the left; next on the right. */
function playCenter(s: TimelineStrip, box: Rect): Double {
  return box.x + PAD + BTN / 2.0
}

function prevCenter(s: TimelineStrip, box: Rect): Double {
  return box.x + PAD + (s.showPlay ? BTN + BTN_GAP : 0.0) + BTN / 2.0
}

function nextCenter(_s: TimelineStrip, box: Rect): Double {
  return box.x + box.w - PAD - BTN / 2.0
}

/** The strip's draw commands in `box`. */
export function renderTimeline(s: TimelineStrip, box: Rect, current: Double, playing: boolean): DrawCmd[] {
  const out: DrawCmd[] = []
  const n = stepCount(s)
  if (n <= 0.0) return out
  const a = axisSpan(s, box)
  const cy = a.cy
  out.push({ kind: 'line', from: { x: a.x0, y: cy }, to: { x: a.x1, y: cy }, stroke: s.line, width: 1.0 })
  let i = 0.0
  for (const label of s.labels) {
    const x = checkpointX(s, box, i)
    const on = i === current
    out.push({ kind: 'circle', center: { x, y: cy }, radius: on ? 5.0 : 3.5, fill: s.accent })
    if (!on) out.push({ kind: 'circle', center: { x, y: cy }, radius: 2.5, fill: '#ffffff' })
    out.push({ kind: 'text', text: label, at: { x, y: cy + 8.0 }, fill: on ? s.accent : s.label, size: s.fontSize, align: 'middle', baseline: 'top' })
    i = i + 1.0
  }
  const h = BTN / 2.0
  if (s.showPlay) {
    const px = playCenter(s, box)
    if (playing) {
      out.push({ kind: 'rect', rect: { x: px - h * 0.7, y: cy - h * 0.7, w: h * 0.5, h: h * 1.4 }, fill: s.accent })
      out.push({ kind: 'rect', rect: { x: px + h * 0.2, y: cy - h * 0.7, w: h * 0.5, h: h * 1.4 }, fill: s.accent })
    } else {
      out.push({ kind: 'polygon', points: [{ x: px - h * 0.6, y: cy - h * 0.75 }, { x: px + h * 0.8, y: cy }, { x: px - h * 0.6, y: cy + h * 0.75 }], fill: s.accent })
    }
  }
  if (s.showPrev) {
    const px = prevCenter(s, box)
    out.push({ kind: 'polygon', points: [{ x: px + h * 0.6, y: cy - h * 0.7 }, { x: px - h * 0.6, y: cy }, { x: px + h * 0.6, y: cy + h * 0.7 }], fill: s.line })
  }
  if (s.showNext) {
    const px = nextCenter(s, box)
    out.push({ kind: 'polygon', points: [{ x: px - h * 0.6, y: cy - h * 0.7 }, { x: px + h * 0.6, y: cy }, { x: px - h * 0.6, y: cy + h * 0.7 }], fill: s.line })
  }
  return out
}

/** What a point hits: a control button, else the nearest checkpoint within reach. */
export function timelineHit(s: TimelineStrip, box: Rect, px: Double, py: Double): TimelineHit {
  const none: TimelineHit = { kind: 0.0, index: -1.0 }
  if (py < box.y || py > box.y + box.h || stepCount(s) <= 0.0) return none
  const cy = axisSpan(s, box).cy
  const reach = BTN / 2.0 + 4.0
  const near = (cx: Double): boolean => (px - cx < 0.0 ? cx - px : px - cx) <= reach && (py - cy < 0.0 ? cy - py : py - cy) <= reach + 6.0
  if (s.showPlay && near(playCenter(s, box))) return { kind: 2.0, index: -1.0 }
  if (s.showPrev && near(prevCenter(s, box))) return { kind: 3.0, index: -1.0 }
  if (s.showNext && near(nextCenter(s, box))) return { kind: 4.0, index: -1.0 }
  let best = -1.0
  let bestD = 14.0
  let i = 0.0
  for (const _l of s.labels) {
    const d = px - checkpointX(s, box, i)
    const ad = d < 0.0 ? 0.0 - d : d
    if (ad <= bestD) {
      bestD = ad
      best = i
    }
    i = i + 1.0
  }
  return best < 0.0 ? none : { kind: 1.0, index: best }
}

/**
 * The step after `current` in direction `dir` (1 forward, -1 back). With
 * `wrap` the ends join (auto-play under `loop`, and the next / previous
 * buttons); without it the step stops at the end and `-1` is returned so
 * auto-play knows to stop.
 */
export function timelineAdvance(s: TimelineStrip, current: Double, dir: Double, wrap: boolean): Double {
  const n = stepCount(s)
  if (n <= 0.0) return -1.0
  const next = current + dir
  if (next >= 0.0 && next < n) return next
  if (!wrap) return -1.0
  return next < 0.0 ? n - 1.0 : 0.0
}

/** The auto-play tick: `rewind` plays backwards; past an end it wraps under `loop`, else stops (-1). */
export function timelineTick(s: TimelineStrip, current: Double): Double {
  return timelineAdvance(s, current, s.rewind ? -1.0 : 1.0, s.loop)
}
