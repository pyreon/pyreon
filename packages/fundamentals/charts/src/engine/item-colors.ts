// Per-datum colour for bars and dots: `fill={fillBy('colour')}` and
// `fill={shadeBy('margin')}`.
//
// Both are IMPORTED BINDINGS that return a small descriptor, the way a curve
// is (`curve={smooth}`): a chart that never colours a datum never references
// this file, so the ramp arithmetic is not in its bundle, and `<Bar color="…">`
// (one colour for the series) and `<Chart color="field">` (the long-format
// split) keep their meanings. Three props, three different jobs, and the third
// cannot be mistaken for the other two because it is not a string.
//
// Everything a coloured datum needs beyond the fill itself rides on the
// descriptor: the values behind a shade as extra table / tooltip series, and the
// ramp legend. The shared host calls them through the descriptor, so a chart
// that never imports `shadeBy` carries none of this code.

import { HEAT_RAMP } from './heat'
import { warnOnce } from './dev-warn'
import { shiftCmds } from './canvas-host'
import { shadeColors, shadeExtent } from './shade'
import { plain } from './format'
import { renderVisualStrip, visualStripSize } from './visual-strip'
import type { VisualStrip } from './visual-strip'
import type { ChartTheme, Series } from './render'
import type { Domain, Double, DrawCmd } from './types'

/** A field name of the row, or an accessor — the same shape every channel takes. */
export type ItemChannel<T, V> = (keyof T & string) | ((d: T, index: number) => V)

/** What a resolved descriptor hands the series: one colour per datum, and the values behind a shade. */
export interface ItemPaint {
  /** One CSS colour per datum; '' leaves that datum in the series colour. */
  itemColors: string[]
  /** For `shadeBy`: the datum values the colours were mapped from, NaN where there is none. */
  shades?: Double[] | undefined
}

/** The series shape a descriptor can add a companion to — an `A11ySeries`, a `TooltipSeries` or a `Series`. */
export interface Companionable {
  label: string
  values: readonly Double[]
  kind: string
  shades?: Double[] | undefined
}

/** A drawn legend: its commands and the height it takes above the plot. */
export interface PaintLegend {
  cmds: DrawCmd[]
  height: Double
  /** Moves a plot's commands down past the legend — for a caller (`chartToSvg`) that composes the frame itself. */
  shift: (cmds: DrawCmd[]) => DrawCmd[]
}

/** The value of `fill` on a mark: resolves against the chart's rows into per-datum colours. */
export interface ItemFill<T> {
  /** Which binding made it — also the literal the tree-shake spec looks for in a bundle. */
  kind: 'fill-by' | 'shade-by'
  /** `ramp` is the theme's value ramp, the default stops of a shade. */
  resolve: (data: readonly T[], ramp?: readonly string[]) => ItemPaint
  /**
   * The same series with each shaded one followed by a `<label> (shade)`
   * companion holding the values behind the colour — what the accessible table
   * and the tooltip print, so a colour is never the only carrier of its number.
   */
  companions?: <S extends Companionable>(series: S[]) => S[]
  /** A compact ramp legend for the shaded series, drawn above the plot. */
  legend?: (series: readonly Series[], at: { x: Double; y: Double; w: Double }, theme: ChartTheme) => PaintLegend
}

/** Options for {@link shadeBy}. */
export interface ShadeOptions {
  /** Colour stops, low to high, as `#rrggbb`. Defaults to the theme's value ramp (light and dark each have their own). */
  ramp?: readonly string[] | undefined
  /** The values the ramp spans; defaults to the extent of the finite values. */
  domain?: Domain | undefined
}

function read<T, V>(c: ItemChannel<T, V>, d: T, i: number): V {
  return typeof c === 'function' ? c(d, i) : ((d as Record<string, unknown>)[c] as V)
}

/**
 * Colour each datum by a colour the row already carries: a field holding
 * `'#rrggbb'` (or any CSS colour), or an accessor returning one. A datum whose
 * colour is missing or not a string keeps the series colour.
 *
 * @example
 * <Bar y="revenue" fill={fillBy('tone')} />
 */
export function fillBy<T>(channel: ItemChannel<T, string | undefined>): ItemFill<T> {
  return {
    kind: 'fill-by',
    resolve: (data) => {
      const itemColors: string[] = []
      for (let i = 0; i < data.length; i++) {
        const v = read(channel, data[i]!, i)
        itemColors.push(typeof v === 'string' ? v : '')
      }

      return { itemColors }
    },
  }
}

/** The extent of the finite values across every shaded series, or the pinned domain. */
function legendDomain(series: readonly Series[], pinned: Domain | undefined): Domain {
  const all: Double[] = []
  for (const s of series) for (const v of s.shades ?? []) all.push(v)

  return pinned ?? shadeExtent(all)
}

/**
 * Colour each datum by a VALUE, mapped through a ramp: low values take the
 * first stop, high values the last. The values stay data: the tooltip and the
 * accessible table list them beside the bar's own value, and a ramp legend sits
 * above the plot, so the colour is never the only carrier of the number.
 *
 * @example
 * <Bar y="revenue" fill={shadeBy('margin', { ramp: ['#fee2e2', '#b91c1c'] })} />
 */
export function shadeBy<T>(channel: ItemChannel<T, number | undefined>, options: ShadeOptions = {}): ItemFill<T> {
  let stops: readonly string[] = HEAT_RAMP

  return {
    kind: 'shade-by',
    resolve: (data, ramp) => {
      const shades: Double[] = []
      for (let i = 0; i < data.length; i++) {
        const raw = read(channel, data[i]!, i)
        if (raw !== undefined && typeof raw !== 'number') warnOnce('shade:nonnumber', 'shadeBy: the channel returned a non-number; that datum keeps the series colour.')
        shades.push(typeof raw === 'number' && Number.isFinite(raw) ? raw : Number.NaN)
      }
      const domain = options.domain ?? shadeExtent(shades)
      stops = options.ramp !== undefined && options.ramp.length > 0 ? options.ramp : ramp ?? HEAT_RAMP
      const itemColors = shadeColors(shades, [...stops], domain.min, domain.max)

      return { itemColors, shades }
    },
    companions: (series) => {
      const out: typeof series = []
      for (const s of series) {
        out.push(s)
        if (s.shades !== undefined) out.push({ ...s, label: `${s.label} (shade)`, values: s.shades, kind: 'line', shades: undefined })
      }

      return out
    },
    legend: (series, at, theme) => {
      if (!series.some((x) => x.shades !== undefined)) return { cmds: [], height: 0, shift: (c) => c }
      const dom = legendDomain(series, options.domain)
      const fmt = plain
      const strip: VisualStrip = {
        piecewise: false,
        stops: [...stops],
        domain: dom,
        pieces: [],
        vertical: false,
        highText: fmt(dom.max),
        lowText: fmt(dom.min),
        fontSize: theme.fontSize,
        labelColor: theme.label,
        itemSize: 8,
        itemLength: Math.min(120, at.w * 0.4),
        calculable: false,
        outColor: theme.muted,
      }
      const size = visualStripSize(strip)

      const height = size.y + 6

      return { cmds: renderVisualStrip(strip, { x: at.x, y: at.y + 2 }, dom, []), height, shift: (c) => shiftCmds(c, 0, height) }
    },
  }
}
