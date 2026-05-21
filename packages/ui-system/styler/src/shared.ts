/**
 * Shared utilities used across multiple modules.
 */
import { CSSResult, type Interpolation } from './resolve'

/** Check if an interpolation value is dynamic (contains functions or nested dynamic CSSResults). */
export const isDynamic = (v: Interpolation): boolean => {
  if (typeof v === 'function') return true
  if (Array.isArray(v)) return v.some(isDynamic)
  if (v instanceof CSSResult) {
    // Memoize per-instance — CSSResults are created once at module level
    // (one per `css\`...\`` literal) and reused across many `styled()` /
    // `useCSS()` / nested-interpolation checks. Avoids rescanning whole
    // sub-trees on every consumer. Ported from vitus-labs `c483cabc`.
    const cached = v._isDynamic
    if (cached !== undefined) return cached
    const r = v.values.some(isDynamic)
    v._isDynamic = r
    return r
  }
  return false
}
