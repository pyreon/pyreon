/**
 * The brand's look for the packages that draw outside `@pyreon/ui-components`,
 * as values those packages already accept. Only values with an existing API are
 * here; `tests/package-defaults.test.ts` feeds each one to the real package.
 *
 * Plain data with structural types, so `@pyreon/ui-theme` does not depend on
 * the packages it describes.
 */

type Mode = 'light' | 'dark'

/** `--pyreon-flow-*` custom properties as an inline `style` string. */
const cssVars = (vars: Record<string, string>): string =>
  Object.entries(vars)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ')

export interface BrandPackageDefaults {
  /**
   * `@pyreon/charts`: `<ChartThemeProvider light={charts.light} dark={charts.dark}>`.
   * Six-series palette (the light set is darker, for contrast on paper) and the
   * axis/crosshair colour. The accessible data table is already on by default.
   */
  readonly charts: Readonly<Record<Mode, { readonly palette: readonly string[]; readonly axis: string }>>
  /** `@pyreon/toast`: `<Toaster {...toast} />` — at most three toasts on screen. */
  readonly toast: { readonly max: number }
  /**
   * `@pyreon/flow`: `<Flow style={flow.style[mode]}>` (inline, because Flow's own
   * dark-mode rule sets these variables on the `.pyreon-flow` element, which an
   * ancestor cannot override) and `<Background {...flow.background} />`.
   */
  readonly flow: {
    readonly style: Readonly<Record<Mode, string>>
    readonly background: { readonly variant: 'dots'; readonly gap: number }
  }
  /**
   * `@pyreon/document`: `render(doc, 'html', { styles: document.styles })`.
   * Paper page, ink text, serif headings. Only the HTML renderer reads `styles`.
   */
  readonly document: {
    readonly styles: {
      readonly page: { readonly backgroundColor: string; readonly color: string }
      readonly heading: { readonly fontFamily: string }
    }
  }
}

export const brandPackageDefaults: BrandPackageDefaults = {
  charts: {
    dark: {
      palette: ['#FF5E1A', '#22D3EE', '#A78BFA', '#FACC15', '#4ADE80', '#FF1F8C'],
      axis: '#2E2E3B',
    },
    light: {
      palette: ['#E2510F', '#0891B2', '#7C3AED', '#B98900', '#15803D', '#DB2777'],
      axis: '#D6CFC2',
    },
  },
  toast: { max: 3 },
  flow: {
    style: {
      light: cssVars({
        '--pyreon-flow-node-selected': '#FF5E1A',
        '--pyreon-flow-accent': '#FF5E1A',
        '--pyreon-flow-edge': '#D6CFC2',
        '--pyreon-flow-bg-pattern': '#E6DFD2',
      }),
      dark: cssVars({
        '--pyreon-flow-node-selected': '#FF5E1A',
        '--pyreon-flow-accent': '#FF5E1A',
        '--pyreon-flow-edge': '#2E2E3B',
        '--pyreon-flow-bg-pattern': '#23232E',
      }),
    },
    background: { variant: 'dots', gap: 14 },
  },
  document: {
    styles: {
      page: { backgroundColor: '#FFFCF5', color: '#14141C' },
      heading: { fontFamily: 'Georgia, serif' },
    },
  },
}
