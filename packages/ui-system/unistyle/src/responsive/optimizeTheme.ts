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
    const previousBreakpoint = breakpoints[i - 1] as string
    const current = theme[key]
    if (current && (i === 0 || !shallowEqual(theme[previousBreakpoint], current))) {
      result[key] = current
    }
  }

  return result
}

export default optimizeTheme
