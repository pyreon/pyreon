type Css = (strings: TemplateStringsArray, ...values: any[]) => any

export type CreateMediaQueries = <
  B extends Record<string, number>,
  R extends number,
  C extends Css,
>(props: {
  breakpoints: B
  rootSize: R
  css: C
}) => Record<keyof B, (...args: any[]) => string>

// Implementation uses Record<string, ...> which is widened from Record<keyof B, ...>;
// the generic constraint on CreateMediaQueries ensures callers get the narrower type.
const createMediaQueries: CreateMediaQueries = ((props: {
  breakpoints: Record<string, number>
  rootSize: number
  css: Css
}) => {
  const { breakpoints, rootSize, css } = props

  // Direct for-in + mutation. The prior `Object.keys.reduce` allocated the
  // keys array and paid reduce-callback overhead per iteration. Hot at
  // PyreonUI mount and on any theme/rootSize change. Ported from
  // vitus-labs `e573e6c4`; measured upstream: +15.9%.
  const acc: Record<string, (...args: [TemplateStringsArray, ...any[]]) => string> = {}
  for (const key in breakpoints) {
    const breakpointValue = breakpoints[key]
    if (breakpointValue === 0) {
      acc[key] = (...args: [TemplateStringsArray, ...any[]]) => css(...args)
    /* v8 ignore next — defensive null-breakpoint guard; type-system constrains values */
    } else if (breakpointValue != null) {
      const emSize = breakpointValue / rootSize
      acc[key] = (...args: [TemplateStringsArray, ...any[]]) => css`
        @media only screen and (min-width: ${emSize}em) {
          ${css(...args)};
        }
      `
    }
  }
  return acc
}) as CreateMediaQueries

export default createMediaQueries
