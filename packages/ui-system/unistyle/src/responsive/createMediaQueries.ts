type Css = (strings: TemplateStringsArray, ...values: any[]) => any;

export type CreateMediaQueries = <
  B extends Record<string, number>,
  R extends number,
  C extends Css,
>(props: {
  breakpoints: B;
  rootSize: R;
  css: C;
}) => Record<keyof B, (...args: any[]) => string>;

// Implementation uses Record<string, ...> which is widened from Record<keyof B, ...>;
// the generic constraint on CreateMediaQueries ensures callers get the narrower type.
const createMediaQueries: CreateMediaQueries = ((props: {
  breakpoints: Record<string, number>;
  rootSize: number;
  css: Css;
}) => {
  const { breakpoints, rootSize, css } = props;

  return Object.keys(breakpoints).reduce<
    Record<string, (...args: [TemplateStringsArray, ...any[]]) => string>
  >((acc, key) => {
    const breakpointValue = breakpoints[key];

    if (breakpointValue === 0) {
      acc[key] = (...args: [TemplateStringsArray, ...any[]]) => css(...args);
    } else if (breakpointValue != null) {
      const emSize = breakpointValue / rootSize;

      acc[key] = (...args: [TemplateStringsArray, ...any[]]) => css`
        @media only screen and (min-width: ${emSize}em) {
          ${css(...args)};
        }
      `;
    }

    return acc;
  }, {});
}) as CreateMediaQueries;

export default createMediaQueries;
