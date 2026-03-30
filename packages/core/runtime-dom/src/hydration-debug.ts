/**
 * Hydration mismatch warnings.
 *
 * Enabled automatically in development (NODE_ENV !== "production").
 * Can be toggled manually for testing or verbose production debugging.
 *
 * @example
 * import { enableHydrationWarnings } from "@pyreon/runtime-dom"
 * enableHydrationWarnings()
 */

const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

let _enabled = __DEV__

export function enableHydrationWarnings(): void {
  _enabled = true
}

export function disableHydrationWarnings(): void {
  _enabled = false
}

/**
 * Emit a hydration mismatch warning.
 * @param type  - Kind of mismatch
 * @param expected - What the VNode expected
 * @param actual   - What the DOM had
 * @param path     - Human-readable path in the tree, e.g. "root > div > span"
 */
export function warnHydrationMismatch(
  _type: 'tag' | 'text' | 'missing',
  _expected: unknown,
  _actual: unknown,
  _path: string,
): void {
  if (!_enabled) return
  console.warn(
    `[Pyreon] Hydration mismatch (${_type}): expected ${String(_expected)}, got ${String(_actual)} at ${_path}`,
  )
}
