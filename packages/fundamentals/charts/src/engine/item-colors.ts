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
// Web only. The descriptor is a closure over each row, which the native
// lowering has no form for; the compiler declines `fill` by name and the bars
// draw in the series colour on a device.

import { HEAT_RAMP, rampColor } from './heat'
import { warnOnce } from './dev-warn'
import type { Domain, Double } from './types'

/** A field name of the row, or an accessor — the same shape every channel takes. */
export type ItemChannel<T, V> = (keyof T & string) | ((d: T, index: number) => V)

/** What a resolved descriptor hands the series: one colour per datum, and the values behind a shade. */
export interface ItemPaint {
  /** One CSS colour per datum; '' leaves that datum in the series colour. */
  colors: string[]
  /** For `shadeBy`: the datum values the colours were mapped from, NaN where there is none. */
  shades?: Double[] | undefined
}

/** The value of `fill` on a mark: resolves against the chart's rows into per-datum colours. */
export interface ItemFill<T> {
  /** Which binding made it — also the literal the tree-shake spec looks for in a bundle. */
  kind: 'fill-by' | 'shade-by'
  resolve: (data: readonly T[]) => ItemPaint
}

/** Options for {@link shadeBy}. */
export interface ShadeOptions {
  /** Colour stops, low to high, as `#rrggbb`. Defaults to the heatmap ramp (cool to warm). */
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
      const colors: string[] = []
      for (let i = 0; i < data.length; i++) {
        const v = read(channel, data[i]!, i)
        colors.push(typeof v === 'string' ? v : '')
      }
      return { colors }
    },
  }
}

/**
 * Colour each datum by a VALUE, mapped through a ramp: low values take the
 * first stop, high values the last. The values stay data: the tooltip and the
 * accessible table list them beside the bar's own value, so the colour is never
 * the only carrier of the number.
 *
 * @example
 * <Bar y="revenue" fill={shadeBy('margin', { ramp: ['#fee2e2', '#b91c1c'] })} />
 */
export function shadeBy<T>(channel: ItemChannel<T, number | undefined>, options: ShadeOptions = {}): ItemFill<T> {
  return {
    kind: 'shade-by',
    resolve: (data) => {
      const shades: Double[] = []
      let lo = Number.POSITIVE_INFINITY
      let hi = Number.NEGATIVE_INFINITY
      for (let i = 0; i < data.length; i++) {
        const raw = read(channel, data[i]!, i)
        if (raw !== undefined && typeof raw !== 'number') warnOnce('shade:nonnumber', 'shadeBy: the channel returned a non-number; that datum keeps the series colour.')
        const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number.NaN
        shades.push(v)
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      const dom = options.domain ?? { min: lo, max: hi }
      const span = dom.max - dom.min
      const stops = options.ramp !== undefined && options.ramp.length > 0 ? options.ramp : HEAT_RAMP
      const colors = shades.map((v) => (Number.isNaN(v) ? '' : rampColor(stops, span > 0 ? (v - dom.min) / span : 0.5)))
      return { colors, shades }
    },
  }
}
