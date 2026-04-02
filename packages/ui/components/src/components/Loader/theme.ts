import { defineComponentTheme } from '@pyreon/ui-theme'

export const loaderTheme = defineComponentTheme('Loader', (t, m) => ({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  states: {
    primary: {
      color: m(t.colors.primary[500], t.colors.primary[400]),
    },
    secondary: {
      color: m(t.colors.gray[500], t.colors.gray[400]),
    },
  },
  sizes: {
    sm: { width: '16px', height: '16px' },
    md: { width: '24px', height: '24px' },
    lg: { width: '32px', height: '32px' },
    xl: { width: '48px', height: '48px' },
  },
  variants: {
    spinner: {},
    dots: {},
    bars: {},
  },
}))
