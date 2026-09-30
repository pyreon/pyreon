// ECharts' `dispatchAction`, as one pure reducer every target runs.
//
// A chart handle holds a `ChartActionState`; `dispatch` feeds it and an action
// through `applyChartAction` and writes back what changed. The web handle's
// signals, the SwiftUI and Compose handle objects all use this function, so
// `{ type: 'select', index: 2 }` pins the same datum everywhere.
//
// The action is one flat record (unused fields zero / empty) rather than a
// union, because it crosses to native as a single struct: `chartAction` builds
// one from the few fields an action names.

import type { BrushArea } from './brush-area'
import type { Double } from './types'
import { clampWindow, isFullWindow } from './zoom'
import type { ZoomWindow } from './zoom'

/** The action record: `type` plus whichever fields that type reads. */
export interface ChartActionInput {
  type: string
  /** highlight / showTip / select / unselect / toggleSelect: the datum. */
  index: number
  /** legendSelect / legendUnselect / legendToggle: the series. legendInverseSelect: a count override (-1 = the chart's). */
  series: number
  /** dataZoom: the window, fractions 0..1. */
  start: Double
  end: Double
  /** takeGlobalCursor: the brush type ('' disarms). */
  brushType: string
  /** brush: the areas to show (empty clears). */
  areas: BrushArea[]
}

/** Everything an action can move. The full window (0..1) is "not zoomed". */
export interface ChartActionState {
  zoom: ZoomWindow
  hover: number
  selected: number[]
  hidden: number[]
  seriesCount: number
  brushType: string
  areas: BrushArea[]
}

/** A state with nothing set, over `seriesCount` series (0 until a chart binds). */
export function emptyChartActionState(seriesCount: number): ChartActionState {
  const zoom: ZoomWindow = { start: 0.0, end: 1.0 }
  return { zoom, hover: -1, selected: [], hidden: [], seriesCount, brushType: '', areas: [] }
}

/** An action record from its type, with every other field empty. */
export function chartAction(type: string): ChartActionInput {
  return { type, index: -1, series: -1, start: 0.0, end: 1.0, brushType: '', areas: [] }
}

function has(xs: number[], v: number): boolean {
  for (const x of xs) if (x === v) return true
  return false
}

function without(xs: number[], v: number): number[] {
  const out: number[] = []
  for (const x of xs) if (x !== v) out.push(x)
  return out
}

function withValue(xs: number[], v: number): number[] {
  const out: number[] = []
  for (const x of xs) out.push(x)
  out.push(v)
  return out
}

/** The state after `a`. Unknown types leave it unchanged. */
export function applyChartAction(s: ChartActionState, a: ChartActionInput): ChartActionState {
  const t = a.type
  if (t === 'highlight' || t === 'showTip') return { ...s, hover: a.index }
  if (t === 'downplay' || t === 'hideTip') return { ...s, hover: -1 }
  if (t === 'select') return has(s.selected, a.index) || a.index < 0 ? s : { ...s, selected: withValue(s.selected, a.index) }
  if (t === 'unselect') return has(s.selected, a.index) ? { ...s, selected: without(s.selected, a.index) } : s
  if (t === 'toggleSelect') {
    if (a.index < 0) return s
    return { ...s, selected: has(s.selected, a.index) ? without(s.selected, a.index) : withValue(s.selected, a.index) }
  }
  if (t === 'legendSelect') return has(s.hidden, a.series) ? { ...s, hidden: without(s.hidden, a.series) } : s
  if (t === 'legendUnselect') return has(s.hidden, a.series) || a.series < 0 ? s : { ...s, hidden: withValue(s.hidden, a.series) }
  if (t === 'legendToggle') {
    if (a.series < 0) return s
    return { ...s, hidden: has(s.hidden, a.series) ? without(s.hidden, a.series) : withValue(s.hidden, a.series) }
  }
  if (t === 'legendAllSelect') return s.hidden.length === 0 ? s : { ...s, hidden: [] }
  if (t === 'legendInverseSelect') {
    const n = a.series >= 0 ? a.series : s.seriesCount
    const next: number[] = []
    for (let i = 0; i < n; i++) if (!has(s.hidden, i)) next.push(i)
    return { ...s, hidden: next }
  }
  if (t === 'dataZoom') {
    // The same clamp every gesture uses (minimum span, inside 0..1); the full window is "none".
    const w = clampWindow({ start: a.start, end: a.end })
    // Typed locals: an untyped { start, end } literal would lower to whichever same-shaped struct matches first.
    const full: ZoomWindow = { start: 0.0, end: 1.0 }
    return { ...s, zoom: isFullWindow(w) ? full : w }
  }
  if (t === 'takeGlobalCursor') return { ...s, brushType: a.brushType }
  if (t === 'brush') return { ...s, areas: a.areas }
  if (t === 'restore') {
    const none: ZoomWindow = { start: 0.0, end: 1.0 }
    return { ...s, zoom: none, hover: -1, selected: [], hidden: [], areas: [] }
  }
  return s
}
