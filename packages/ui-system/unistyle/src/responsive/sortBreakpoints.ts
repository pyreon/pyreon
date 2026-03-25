export type SortBreakpoints = <T extends Record<string, number>>(breakpoints: T) => (keyof T)[]

const sortBreakpoints: SortBreakpoints = (breakpoints) => {
  const result = Object.keys(breakpoints).sort(
    (a, b) => (breakpoints[a] ?? 0) - (breakpoints[b] ?? 0),
  )
  return result
}

export default sortBreakpoints
