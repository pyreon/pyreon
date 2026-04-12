export type OptimizeTheme = ({
  theme,
  breakpoints,
}: {
  theme: Record<string, Record<string, unknown>>
  breakpoints: string[]
}) => Record<string, Record<string, unknown>>

/**
 * Optimizes responsive theme by emitting only CHANGED properties per
 * breakpoint. The first breakpoint always gets the full property set.
 * Higher breakpoints only include properties whose values differ from
 * the previous breakpoint.
 *
 * This minimizes generated CSS — a Container with 4 breakpoints where
 * only `maxWidth` changes emits `maxWidth` in each media query rather
 * than the full property set.
 *
 * Input:
 * ```
 * xs: { maxWidth: '90%', height: '100%' }
 * sm: { maxWidth: '33.75rem', height: '100%' }
 * ```
 *
 * Output:
 * ```
 * xs: { maxWidth: '90%', height: '100%' }  // full (first breakpoint)
 * sm: { maxWidth: '33.75rem' }              // only maxWidth changed
 * ```
 */
const optimizeTheme: OptimizeTheme = ({ theme, breakpoints }) => {
  const result: Record<string, Record<string, unknown>> = {}

  for (let i = 0; i < breakpoints.length; i++) {
    const key = breakpoints[i] as string
    const current = theme[key]
    if (!current) continue

    if (i === 0) {
      // First breakpoint: emit all properties (baseline)
      result[key] = current
      continue
    }

    // Higher breakpoints: only emit properties that changed from previous.
    const prev = theme[breakpoints[i - 1] as string]
    if (!prev) {
      // No previous breakpoint data — emit all
      result[key] = current
      continue
    }

    const diff: Record<string, unknown> = {}
    let hasDiff = false

    for (const prop of Object.keys(current)) {
      const currVal = current[prop]
      const prevVal = prev[prop]

      if (currVal !== prevVal) {
        diff[prop] = currVal
        hasDiff = true
      }
    }

    // Also check for properties that were in previous but removed in current
    // (key count difference means something was added or removed)
    if (Object.keys(current).length !== Object.keys(prev).length) {
      // Different number of keys — emit the full current set since
      // properties may have been added or removed
      result[key] = current
    } else if (hasDiff) {
      result[key] = diff
    }
    // else: identical to previous — skip (no media query needed)
  }

  return result
}

export default optimizeTheme
