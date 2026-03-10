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

let _enabled = typeof process !== "undefined" && process.env.NODE_ENV !== "production"

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
  type: "tag" | "text" | "missing",
  expected: unknown,
  actual: unknown,
  path: string,
): void {
  if (!_enabled) return
  console.warn(
    `[pyreon] Hydration mismatch (${type}) at <${path}>: ` +
      `expected "${String(expected)}", got "${String(actual)}"`,
  )
}
