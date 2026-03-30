/**
 * Extracts HOC functions from the `.compose()` configuration and reverses
 * them for correct application order. Setting a key to `null`, `undefined`,
 * or `false` removes a previously defined HOC — only actual functions are kept.
 *
 * The reversal is needed because `compose(a, b, c)(Component)` applies as
 * `a(b(c(Component)))`, so the last-defined HOC should wrap innermost.
 */
type CalculateHocsFuncs = (options: Record<string, any>) => ((arg: any) => any)[];

export const calculateHocsFuncs: CalculateHocsFuncs = (options = {}) =>
  Object.values(options)
    .filter((item) => typeof item === "function")
    .reverse();
