// visualMap — the value → colour legend strip (continuous ramp or piecewise swatches).

import { HEAT_RAMP } from './heat'
import { colorRamp } from './heat-ramp'
import type { Double, DrawCmd } from './types'
import { renderVisualStrip, visualOutBands, visualStripSize } from './visual-strip'
import type { VisualStrip } from './visual-strip'

export interface VisualMapPiece {
  label: string
  color: string
  min?: Double | undefined
  max?: Double | undefined
}

export interface VisualMapSpec {
  type: 'continuous' | 'piecewise'
  stops: string[]
  domain: [Double, Double]
  pieces: VisualMapPiece[]
  orient: 'horizontal' | 'vertical'
  /** [high, low] end labels for the continuous strip. */
  text: [string, string] | undefined
  fontSize: Double
  labelColor: string
  /** Bar thickness / swatch size in pixels. */
  itemSize: Double
  /** Bar length for the continuous strip. */
  itemLength: Double
  /** Continuous: draggable range handles (`calculable`). */
  calculable: boolean
  /** The selected range (`visualMap.range`), default the domain. */
  range: [Double, Double]
  /** Piecewise: per-piece selection (`visualMap.selected`, by piece index); default all on. */
  selected: boolean[]
  /** ECharts' `inactiveColor`: out-of-selection values and swatches. */
  inactiveColor: string
}

/** Layout of the strip within `box`; the strip is anchored at the box origin. */
export interface VisualMapLayout {
  cmds: DrawCmd[]
  width: Double
  height: Double
}

/** The spec as the engine's strip — the one geometry every target draws and hit-tests. */
export function visualStripOf(spec: VisualMapSpec): VisualStrip {
  return {
    piecewise: spec.type === 'piecewise',
    stops: spec.stops,
    domain: { min: spec.domain[0], max: spec.domain[1] },
    pieces: spec.pieces,
    vertical: spec.orient === 'vertical',
    highText: spec.text?.[0] ?? '',
    lowText: spec.text?.[1] ?? '',
    fontSize: spec.fontSize,
    labelColor: spec.labelColor,
    itemSize: spec.itemSize,
    itemLength: spec.itemLength,
    calculable: spec.calculable,
    outColor: spec.inactiveColor,
  }
}

/** The selection as renderer options (`inRange` / `outBands` / `outColor`), or empty when nothing is excluded. */
export function visualSelectionOptions(spec: VisualMapSpec): { inRange?: { min: Double; max: Double }; outBands?: Double[]; outColor?: string } {
  if (spec.type === 'piecewise') {
    const bands = visualOutBands(visualStripOf(spec), spec.selected)
    return bands.length === 0 ? {} : { outBands: bands, outColor: spec.inactiveColor }
  }
  const [lo, hi] = spec.range
  if (lo <= spec.domain[0] && hi >= spec.domain[1]) return {}
  return { inRange: { min: lo, max: hi }, outColor: spec.inactiveColor }
}

/** Render the strip with its top-left at `at`. */
export function renderVisualMap(spec: VisualMapSpec, at: { x: Double; y: Double }): VisualMapLayout {
  const strip = visualStripOf(spec)
  const size = visualStripSize(strip)
  return { cmds: renderVisualStrip(strip, at, { min: spec.range[0], max: spec.range[1] }, spec.selected), width: size.x, height: size.y }
}

/** What `visualMap()` takes. Only `domain` is required. */
export interface VisualMapOptions {
  /** The value range the strip spans, `[low, high]`. */
  domain: [Double, Double]
  /** `'continuous'` draws a ramp, `'piecewise'` draws swatches. Default `'continuous'`. */
  type?: 'continuous' | 'piecewise' | undefined
  /** The ramp's colours, low to high. Default the heat ramp. */
  stops?: string[] | undefined
  /**
   * Piecewise: the pieces, high to low. A piece without a `label` is named by
   * its bounds, one without a `color` takes the ramp's. Without pieces, the
   * domain is split into `splitNumber` equal ones.
   */
  pieces?: { min?: Double | undefined; max?: Double | undefined; label?: string | undefined; color?: string | undefined }[] | undefined
  /** Piecewise: how many equal pieces to split the domain into when `pieces` is absent. Default 5. */
  splitNumber?: number | undefined
  orient?: 'horizontal' | 'vertical' | undefined
  /** Continuous: `[high, low]` end labels. */
  text?: [string, string] | undefined
  fontSize?: Double | undefined
  labelColor?: string | undefined
  /** Bar thickness / swatch size, in pixels. */
  itemSize?: Double | undefined
  /** Bar length of the continuous strip, in pixels. */
  itemLength?: Double | undefined
  /** Continuous: draggable range handles. */
  calculable?: boolean | undefined
  /** The initially selected range. Default the whole domain. */
  range?: [Double, Double] | undefined
  /** Piecewise: which pieces start selected, by index. Default all. */
  selected?: boolean[] | undefined
  /** The colour of values and swatches outside the selection. */
  inactiveColor?: string | undefined
}

const round2 = (v: Double): Double => Math.round(v * 100.0) / 100.0

/**
 * A value → colour legend for `<HeatmapChart>`, `<CalendarChart>` and
 * `<MapChart>`, with every option defaulted.
 *
 * @example
 * <HeatmapChart data={rows} x="day" y="hour" value="n" visualMap={visualMap({ domain: [0, 100], calculable: true })} />
 */
export function visualMap(o: VisualMapOptions): VisualMapSpec {
  const stops = o.stops !== undefined && o.stops.length >= 2 ? o.stops : HEAT_RAMP
  const type = o.type ?? 'continuous'
  const domain: [Double, Double] = [o.domain[0], o.domain[1]]
  const ramp = colorRamp(stops)
  const pieces: VisualMapPiece[] = []
  if (type === 'piecewise') {
    if (o.pieces !== undefined) {
      const ps = o.pieces
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]!
        const lo = p.min
        const hi = p.max
        const label = p.label ?? (lo !== undefined && hi !== undefined ? `${lo} – ${hi}` : lo !== undefined ? `≥ ${lo}` : hi !== undefined ? `≤ ${hi}` : String(i + 1))
        const t = ps.length <= 1 ? 1.0 : 1.0 - i / (ps.length - 1)
        pieces.push({ label, color: p.color ?? ramp(t), ...(lo !== undefined ? { min: lo } : {}), ...(hi !== undefined ? { max: hi } : {}) })
      }
    } else {
      const n = Math.max(1, Math.floor(o.splitNumber ?? 5))
      const step = (domain[1] - domain[0]) / n
      for (let i = n - 1; i >= 0; i--) {
        const lo = domain[0] + step * i
        const hi = lo + step
        pieces.push({ label: `${round2(lo)} – ${round2(hi)}`, color: ramp(n <= 1 ? 1.0 : i / (n - 1)), min: lo, max: hi })
      }
    }
  }
  const range: [Double, Double] = o.range !== undefined ? [Math.min(o.range[0], o.range[1]), Math.max(o.range[0], o.range[1])] : [domain[0], domain[1]]
  return {
    type,
    stops,
    domain,
    pieces,
    orient: o.orient ?? 'vertical',
    text: o.text,
    fontSize: o.fontSize ?? 11.0,
    labelColor: o.labelColor ?? '#64748b',
    itemSize: o.itemSize ?? (type === 'piecewise' ? 14.0 : 16.0),
    itemLength: o.itemLength ?? 120.0,
    calculable: type === 'continuous' && o.calculable === true,
    range,
    selected: pieces.map((_, i) => o.selected?.[i] !== false),
    inactiveColor: o.inactiveColor ?? '#cccccc',
  }
}
