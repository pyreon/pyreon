import { config, isEmpty } from "@pyreon/ui-core";
import { createMediaQueries, sortBreakpoints } from "./responsive";

export type PyreonTheme = {
  rootSize?: number;
  breakpoints?: Record<string, number>;
  __PYREON__?: {
    sortedBreakpoints: string[] | undefined;
    media: Record<string, (...args: any[]) => any> | undefined;
  };
} & Record<string, unknown>;

/**
 * Enrich a theme with pre-computed responsive utilities.
 * Adds sorted breakpoints and media-query tagged-template helpers
 * to `theme.__PYREON__` for consumption by `makeItResponsive`.
 *
 * This is a pure function — safe to call outside of component context.
 *
 * @example
 * const enriched = enrichTheme({ rootSize: 16, breakpoints: { xs: 0, sm: 576, md: 768 } })
 * enriched.__PYREON__.sortedBreakpoints // ['xs', 'sm', 'md']
 * enriched.__PYREON__.media.sm          // tagged-template for @media (min-width: 36em)
 */
export function enrichTheme<T extends PyreonTheme>(
  theme: T,
): T & Required<Pick<PyreonTheme, "__PYREON__">> {
  const { breakpoints, rootSize = 16 } = theme;

  const sortedBreakpoints =
    breakpoints && !isEmpty(breakpoints) ? sortBreakpoints(breakpoints) : undefined;

  const media =
    breakpoints && !isEmpty(breakpoints)
      ? createMediaQueries({ breakpoints, css: config.css, rootSize })
      : undefined;

  return {
    ...theme,
    __PYREON__: { sortedBreakpoints, media },
  };
}
