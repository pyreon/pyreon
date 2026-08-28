// The authoring surface: marks over data.
//
// Each mark is an ordinary exported function returning a plain descriptor. That
// is what makes the library tree-shakeable BY CONSTRUCTION: `bars` is an
// imported binding, so a bundler that never sees the import drops the mark and
// everything only it reaches. A string-keyed option bag (`type: 'bars'`) cannot
// have this property at any price, because no bundler can trace a string to
// the code that handles it.
//
// The shape is settled prior art — Swift Charts, Observable Plot, Vega-Lite and
// Recharts all converge on marks-over-data rather than one nested config object.

import type { Series } from './render'
import type { Double } from './types'

/** Reads one numeric channel out of a datum. */
export type Accessor<T> = (d: T, index: number) => Double

export interface MarkOptions {
  /** Series colour. Defaults are the caller's business — a theme sets them. */
  color?: string
  /** Stroke width for line and area outlines. */
  width?: Double
  /** Point radius. */
  radius?: Double
}

/** A mark bound to its accessor, resolved against data at render time. */
export interface Mark<T> {
  kind: Series['kind']
  y: Accessor<T>
  options: MarkOptions
}

const DEFAULT_COLOR = '#0f766e'

function mark<T>(kind: Series['kind'], y: Accessor<T>, options: MarkOptions): Mark<T> {
  return { kind, y, options }
}

/** Vertical bars, one per datum, measured from the zero line. */
export function bars<T>(y: Accessor<T>, options: MarkOptions = {}): Mark<T> {
  return mark('bars', y, options)
}

/** A polyline through every datum. */
export function line<T>(y: Accessor<T>, options: MarkOptions = {}): Mark<T> {
  return mark('line', y, options)
}

/** A filled band between the line and the baseline. */
export function area<T>(y: Accessor<T>, options: MarkOptions = {}): Mark<T> {
  return mark('area', y, options)
}

/** A dot per datum. */
export function points<T>(y: Accessor<T>, options: MarkOptions = {}): Mark<T> {
  return mark('points', y, options)
}

/**
 * Resolve marks against data into the engine's `Series[]`.
 *
 * A non-finite accessor result becomes 0 rather than propagating: `NaN` in a
 * domain makes every scale NaN, and the failure surfaces as a blank chart with
 * nothing to trace it by. Zero is visibly wrong at the right datum, which is
 * the better failure.
 */
export function resolveMarks<T>(data: T[], marks: Mark<T>[]): Series[] {
  return marks.map((m) => {
    const values: Double[] = []
    for (let i = 0; i < data.length; i++) {
      const v = m.y(data[i]!, i)
      values.push(Number.isFinite(v) ? v : 0)
    }
    return {
      kind: m.kind,
      values,
      color: m.options.color ?? DEFAULT_COLOR,
      width: m.options.width ?? 2,
      radius: m.options.radius ?? 3,
    }
  })
}

/** Category labels for the x axis, from an accessor over the same data. */
export function resolveCategories<T>(data: T[], x?: (d: T, index: number) => string): string[] {
  if (x === undefined) return []
  return data.map((d, i) => x(d, i))
}
