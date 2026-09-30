import type { Double } from './types'

/** Native-subset-safe finite-number predicate shared by chart arithmetic. */
export function isFiniteNumber(v: Double): boolean {
  // Intentional IEEE-754 checks: the native subset cannot lower Number.isFinite.
  return v === v && v - v === 0.0 // lgtm[js/identical-operand]
}
