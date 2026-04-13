export type OptimizeTheme = ({
  theme,
  breakpoints,
}: {
  theme: Record<string, Record<string, unknown>>
  breakpoints: string[]
}) => Record<string, Record<string, unknown>>

const shallowEqual = (
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean => {
  if (a === b) return true
  if (!a || !b) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}

/**
 * Removes breakpoints whose full-object styles are identical to the
 * previous one. Simple all-or-nothing: if ANY property differs from
 * the previous breakpoint, emit the ENTIRE current breakpoint.
 *
 * This matches the reference implementation (vitus-labs/ui-system) and
 * the original monorepo-migration version (commit 2b7c5876). Previous
 * "optimizations" (PRs #159, #208) that tried per-property diffing
 * broke responsive styles in subtle ways — shorthand/longhand CSS
 * property interactions, properties that depend on each other,
 * properties that need to be emitted together to cascade correctly.
 *
 * The all-or-nothing approach is the correct level of deduplication —
 * we skip the breakpoint when it's entirely redundant, and let the
 * browser's CSS cascade handle the rest.
 */
const optimizeTheme: OptimizeTheme = ({ theme, breakpoints }) => {
  const result: Record<string, Record<string, unknown>> = {}

  for (let i = 0; i < breakpoints.length; i++) {
    const key = breakpoints[i] as string
    const previousBreakpoint = breakpoints[i - 1] as string
    const current = theme[key]
    if (current && (i === 0 || !shallowEqual(theme[previousBreakpoint], current))) {
      result[key] = current
    }
  }

  return result
}

export default optimizeTheme
