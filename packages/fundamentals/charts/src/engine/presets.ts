// Zoom presets — Highcharts' rangeSelector buttons / ECharts' toolbox range
// presets, engine-shaped: a right-aligned button strip under the plot that
// writes the dataZoom window ("the last N rows"). Pure layout + hit test +
// window math, so the web host, iOS and Android share ONE definition of the
// strip and of what a preset selects — the same contract the legend and the
// title use (the host reserves the height and paints the commands).

import type { DrawCmd, Double, Rect } from './types'
import type { ZoomWindow } from './zoom'

export interface ZoomPreset {
  label: string
  /** How many TRAILING rows the preset shows; 0 (or a count covering every row) means all. */
  count: number
}

export interface PresetOptions {
  fontSize: Double
  /** Horizontal padding inside a button. */
  padX: Double
  /** Vertical inset of the buttons from the strip's top and bottom. */
  padY: Double
  /** Space between buttons. */
  gap: Double
  /** Inset of the last button from the strip's right edge. */
  inset: Double
  activeFill: string
  idleFill: string
  activeText: string
  idleText: string
}

export interface PresetLayout {
  cmds: DrawCmd[]
  /** One hit rect per preset, in canvas coordinates. */
  boxes: Rect[]
  /** The strip's height — what the host subtracts from the plot; 0 when there are no presets. */
  height: Double
}

const PRESET_STRIP_HEIGHT = 22.0

/**
 * The window a preset selects: the last `count` of `total` rows. A count of 0,
 * or one covering every row, is the full window. Not clamped to the minimum
 * span on purpose: the row slice reads the fraction directly, and "the last
 * row of a hundred" must stay the last row, not the last two.
 */
export function presetWindow(count: number, total: number): ZoomWindow {
  if (count <= 0 || total <= 0 || count >= total) return { start: 0.0, end: 1.0 }
  let c = 0.0
  for (let i = 0; i < count; i++) c = c + 1.0
  let t = 0.0
  for (let i = 0; i < total; i++) t = t + 1.0
  return { start: 1.0 - c / t, end: 1.0 }
}

/** Whether `win` is the window `preset` would select (within float tolerance). */
export function presetIsActive(preset: ZoomPreset, total: number, win: ZoomWindow): boolean {
  const target = presetWindow(preset.count, total)
  const ds = win.start - target.start
  const de = win.end - target.end
  const ads = ds < 0.0 ? 0.0 - ds : ds
  const ade = de < 0.0 ? 0.0 - de : de
  return ads < 0.000001 && ade < 0.000001
}

/**
 * Lay the strip out along the bottom of `canvas` — right-aligned buttons —
 * and paint it. The active preset (the one whose window is the current one)
 * is filled; `boxes` are what a click or tap hit-tests; `height` is what the
 * plot gives up, returned rather than assumed for the same reason the
 * legend's is.
 */
export function renderPresets(
  items: ZoomPreset[],
  total: number,
  win: ZoomWindow,
  canvas: Rect,
  opts: PresetOptions,
  measure: (text: string, size: Double) => Double,
): PresetLayout {
  const cmds: DrawCmd[] = []
  const boxes: Rect[] = []
  if (items.length === 0) return { cmds, boxes, height: 0.0 }
  const widths: Double[] = []
  let span = 0.0
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!
    const tw = measure(it.label, opts.fontSize) + opts.padX * 2.0
    widths.push(tw)
    span = span + tw
    if (i > 0) span = span + opts.gap
  }
  let x = canvas.x + canvas.w - opts.inset - span
  const y = canvas.y + canvas.h - PRESET_STRIP_HEIGHT + opts.padY
  const h = PRESET_STRIP_HEIGHT - opts.padY * 2.0
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!
    const tw = widths[i]!
    const b: Rect = { x, y, w: tw, h }
    boxes.push(b)
    const active = presetIsActive(it, total, win)
    cmds.push({ kind: 'rect', rect: b, fill: active ? opts.activeFill : opts.idleFill })
    cmds.push({
      kind: 'text',
      text: it.label,
      at: { x: b.x + b.w / 2.0, y: b.y + b.h / 2.0 },
      fill: active ? opts.activeText : opts.idleText,
      size: opts.fontSize,
      align: 'middle',
      baseline: 'middle',
    })
    x = x + tw + opts.gap
  }
  return { cmds, boxes, height: PRESET_STRIP_HEIGHT }
}

/** The preset under (x, y), or -1. */
export function presetHit(boxes: Rect[], x: Double, y: Double): number {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i
  }
  return -1
}
