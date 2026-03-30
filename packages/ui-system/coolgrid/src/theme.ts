/**
 * Default Bootstrap-like grid configuration. Provides 5 breakpoints (xs-xl),
 * a 12-column grid, and responsive container max-widths matching Bootstrap 4.
 */
export default {
  rootSize: 16,
  breakpoints: {
    xs: 0,
    sm: 576,
    md: 768,
    lg: 992,
    xl: 1200,
  },
  grid: {
    columns: 12,
    container: {
      xs: "100%",
      sm: 540,
      md: 720,
      lg: 960,
      xl: 1140,
    },
  },
} as const;

export const defaultBreakpoints: Record<string, number> = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
};

export const defaultContainerWidths: Record<string, string | number> = {
  xs: "100%",
  sm: 540,
  md: 720,
  lg: 960,
  xl: 1140,
};
