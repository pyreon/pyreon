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

const optimizeTheme: OptimizeTheme = ({ theme, breakpoints }) => {
  const result: Record<string, Record<string, unknown>> = {}

  for (let i = 0; i < breakpoints.length; i++) {
    const key = breakpoints[i] as string
    const current = theme[key]
    if (!current) continue

    if (i === 0) {
      // First breakpoint: emit all properties
      result[key] = current
    } else {
      // Higher breakpoints: only emit properties that CHANGED from previous.
      // This prevents duplicating e.g. height: 100% in every media query
      // when only maxWidth changes per breakpoint.
      const prev = theme[breakpoints[i - 1] as string]
      const diff: Record<string, unknown> = {}
      let hasDiff = false

      for (const prop of Object.keys(current)) {
        if (!prev || current[prop] !== prev[prop]) {
          diff[prop] = current[prop]
          hasDiff = true
        }
      }

      if (hasDiff) result[key] = diff
    }
  }

  return result
}

export default optimizeTheme
