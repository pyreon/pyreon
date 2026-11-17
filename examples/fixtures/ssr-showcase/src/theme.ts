/**
 * Theme for the sections showcase — exercises the full responsive +
 * rocketstyle pipeline with a real-world scale of tokens: breakpoints,
 * spacing, color modes, typography. Used as a reference target for
 * Playwright browser tests and SSR hydration tests.
 */

export const theme = {
  rootSize: 16,
  breakpoints: {
    xs: 0,
    sm: 576,
    md: 768,
    lg: 992,
    xl: 1200,
    xxl: 1440,
  },
  grid: {
    columns: 12,
    container: {
      xs: '90%',
      sm: 540,
      md: 700,
      lg: 940,
      xl: 1140,
      xxl: 1280,
    },
  },
  space: {
    reset: 0,
    xSmall: 8,
    small: 12,
    medium: 16,
    large: 24,
    xLarge: 32,
    xxLarge: 64,
  },
  fontFamily: {
    base: "'Inter', system-ui, sans-serif",
  },
  fontSize: {
    small: 14,
    base: 16,
    medium: 20,
    large: 24,
    xLarge: 28,
    xxLarge: 32,
    xxxLarge: 54,
    jumbo: 120,
  },
  lineHeight: {
    reset: 1,
    small: 1.2,
    base: 1.7,
    large: 2,
  },
  borderWidth: {
    base: 1,
  },
  borderStyle: {
    base: 'solid' as const,
  },
  borderRadius: {
    base: 8,
    large: 12,
    extra: 180,
  },
  transition: {
    base: 'all .15s ease-in-out',
  },
  color: {
    light: {
      base: '#F8F8F8',
      alt: '#EEEEEE',
      border: '#DDDDDD',
    },
    dark: {
      base: '#212121',
      alt: '#2A2A2A',
      border: '#3A3A3A',
    },
    neutral: {
      base: '#6B7280',
    },
    primary: {
      base: '#228BE6',
      alt: '#1971C2',
    },
    secondary: {
      base: '#F06595',
      alt: '#D6336C',
    },
  },
  shadow: {
    light: {
      small: '0px 2px 16px rgba(211, 211, 211, 0.5)',
      large: '0px 2px 44px rgba(211, 211, 211, 0.5)',
    },
    dark: {
      small: '0px 2px 16px rgba(61, 61, 61, 0.5)',
      large: '0px 2px 44px rgba(61, 61, 61, 0.5)',
    },
  },
}

export type ShowcaseTheme = typeof theme
