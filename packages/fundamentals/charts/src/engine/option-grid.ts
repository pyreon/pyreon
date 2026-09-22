/**
 * A single ECharts `grid`'s position as the engine's plot insets: `left`,
 * `top`, `right`, `bottom` (pixels or a percent of the chart) and `width` /
 * `height`, which fix the far side when the near one is set. A side the grid
 * does not set takes ECharts 6's default (15% / 65 / 10% / 80), and under
 * `outerBoundsMode: 'auto'` (the default) a side still grows where its axis
 * labels would otherwise leave the chart.
 */
import type { Double } from './types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A position in pixels: a number, a percent of `extent`, or a numeric string; undefined otherwise. */
function px(v: unknown, extent: Double): Double | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  const n = Number.parseFloat(t)
  if (!Number.isFinite(n)) return undefined
  return t.endsWith('%') ? (n / 100.0) * extent : n
}

export interface GridInsets {
  gridLeft?: Double
  gridTop?: Double
  gridRight?: Double
  gridBottom?: Double
  /** Grow a side to keep its axis labels inside the chart (ECharts' `outerBoundsMode: 'auto'`, or the legacy `containLabel`). */
  gridContain?: boolean
}

/** Marks a multi-grid part's sub-option: the part's rect IS its grid, laid out by the labels inside it. */
export const GRID_PART_KEY = "__pyreonGridPart"

/** The insets a single grid sets; nothing for a multi-grid option (the composite splits those). */
export function optionGridInsets(raw: unknown, width: Double, height: Double): GridInsets {
  if (Array.isArray(raw) && raw.length > 1) return {}
  const g0 = Array.isArray(raw) ? raw[0] : raw
  if (isObj(g0) && g0[GRID_PART_KEY] === true) return {}
  // No grid at all is ECharts' default grid.
  const g: Obj = isObj(g0) ? g0 : {}
  const out: GridInsets = {}
  const left = px(g['left'], width)
  const right = px(g['right'], width)
  const top = px(g['top'], height)
  const bottom = px(g['bottom'], height)
  const w = px(g['width'], width)
  const h = px(g['height'], height)
  if (left !== undefined) out.gridLeft = left
  if (top !== undefined) out.gridTop = top
  if (right !== undefined) out.gridRight = right
  else if (left !== undefined && w !== undefined) out.gridRight = Math.max(0.0, width - left - w)
  if (bottom !== undefined) out.gridBottom = bottom
  else if (top !== undefined && h !== undefined) out.gridBottom = Math.max(0.0, height - top - h)
  if (left === undefined && right !== undefined && w !== undefined) out.gridLeft = Math.max(0.0, width - right - w)
  if (top === undefined && bottom !== undefined && h !== undefined) out.gridTop = Math.max(0.0, height - bottom - h)
  // ECharts 6's default for a side left unset.
  if (out.gridLeft === undefined) out.gridLeft = width * 0.15
  if (out.gridTop === undefined) out.gridTop = 65.0
  if (out.gridRight === undefined) out.gridRight = width * 0.1
  if (out.gridBottom === undefined) out.gridBottom = 80.0
  if (g['outerBoundsMode'] !== 'none' && g['outerBoundsMode'] !== 'same') out.gridContain = true
  return out
}
