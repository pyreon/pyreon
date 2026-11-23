import type { ExprIR } from './types'

/**
 * Converting an integer to a floating-point number: `Number(n)`.
 *
 * PMTC types a bare `number` as an integer unless it sees float evidence (a fractional literal, a `Double`
 * annotation, a division), and neither native target mixes the two silently: Swift has no implicit Int→Double
 * conversion at all, and Kotlin's `Long / Long` truncates. Code that needs a count as a float (`nF = n` before
 * `plot.w / (nF - 1.0)`) therefore needs an explicit conversion that is ALSO the identity on the web, so the web's
 * behaviour cannot change. That conversion is `Number(n)`:
 *
 *   - over an integer it lowers to `Double(n)` (Swift) / `(n).toDouble()` (Kotlin);
 *   - over a value already known to be a Double it is the identity on every target (no redundant conversion);
 *   - over a string it keeps its parsing meaning (the runtimes' ECMAScript `pyreonToNumber`), unchanged.
 *
 * Before this the numeric form fell through to the string lowering — `(Double(n) ?? 0)` on Swift (a `??` on a
 * non-optional) and `n.toDoubleOrNull()` on Kotlin (a compile error: only `String` has it) — so the chart engine
 * converted counts by COUNTING: `let f = 0.0; for (let i = 0; i < n; i++) f = f + 1.0`, an O(n) loop with an
 * unused counter on every call site.
 */
export type NumberConversion = 'identity' | 'widen' | 'other'

/** What `Number(arg)` lowers to for an argument of the given numeric floatness. */
export function numberConversion(
  arg: ExprIR,
  floatness: (e: ExprIR) => 'double' | 'int' | 'other',
): NumberConversion {
  const f = floatness(arg)
  if (f === 'double') return 'identity'
  if (f === 'int') return 'widen'

  return 'other'
}
