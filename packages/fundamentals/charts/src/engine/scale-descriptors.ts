// Scale descriptors: `sqrt()`, `symlog()` and `log()`, imported where a chart
// wants a non-linear axis — `<Scale y={sqrt()} />`, `<Axis x scale={log()} />`.
//
// Imported bindings, like `fillBy` and `curve={smooth}`: the transform, the
// pipeline and the tick builders are bundled only by a chart that imports one.
// (`yScale="log"` stays a plain string for the value axis, and works the same.)

import type { Formatter } from './format'
import type { ScaleView } from './render'
import { applyScaleView, viewTicks } from './scale-view'
import type { Domain, Double } from './types'

function descriptor(kind: string, param: Double): ScaleView {
  return {
    kind,
    param,
    apply: (spec, axis) => applyScaleView(spec, axis, kind, param),
    ticks: (real: Domain, r0: Double, r1: Double, count: Double, format: Formatter | undefined) => viewTicks(kind, real, r0, r1, count, format, param),
  }
}

/**
 * A square-root axis: `sqrt(v)`, defined from zero up (a negative value is a
 * gap, drawn as nothing). Ticks are the ordinary nice values, spaced by the
 * root, so denser near zero.
 *
 * @example
 * <Scale y={sqrt()} />
 */
export function sqrt(): ScaleView {
  return descriptor('sqrt', 1.0)
}

/** Options for {@link symlog}. */
export interface SymlogOptions {
  /** The linear region's width: values within about `constant` of zero read as linear. Default 1. */
  constant?: number | undefined
}

/**
 * A symmetric-log axis: `sign(v) * log10(1 + |v| / constant)` — linear-looking
 * near zero, logarithmic far from it, defined for every real value. Ticks are
 * zero and the decades either side of it.
 *
 * @example
 * <Scale x={symlog({ constant: 10 })} />
 */
export function symlog(options: SymlogOptions = {}): ScaleView {
  const c = options.constant !== undefined && options.constant > 0 ? options.constant : 1.0

  return descriptor('symlog', c)
}

/**
 * A logarithmic axis: only values above zero are placed (the rest are gaps).
 * Ticks are decades, with 1-2-5 minors when the span is short. On the value
 * axis `yScale="log"` is the same thing; on a numeric x axis use this.
 *
 * @example
 * <Scale x={log()} />
 */
export function log(): ScaleView {
  return descriptor('log', 1.0)
}
