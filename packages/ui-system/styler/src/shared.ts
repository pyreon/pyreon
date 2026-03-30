/**
 * Shared utilities used across multiple modules.
 */
import { CSSResult, type Interpolation } from './resolve'

/** Check if an interpolation value is dynamic (contains functions or nested dynamic CSSResults). */
export const isDynamic = (v: Interpolation): boolean => {
  if (typeof v === 'function') return true
  if (Array.isArray(v)) return v.some(isDynamic)
  if (v instanceof CSSResult) return v.values.some(isDynamic)
  return false
}
