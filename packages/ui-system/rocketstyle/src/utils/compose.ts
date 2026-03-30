/**
 * Extracts HOC functions from the compose configuration object,
 * filters out non-function entries, and reverses them so the
 * outermost HOC in the chain wraps first (inside-out composition).
 */
type CalculateHocsFuncs = (options: Record<string, any>) => ((arg: any) => any)[]

export const calculateHocsFuncs: CalculateHocsFuncs = (options = {}) =>
  Object.values(options)
    .filter((item) => typeof item === 'function')
    .reverse()
