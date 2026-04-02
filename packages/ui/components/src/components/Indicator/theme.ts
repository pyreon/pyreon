import { defineComponentTheme } from '@pyreon/ui-theme'

export const indicatorTheme = defineComponentTheme('Indicator', (t, m) => ({
  base: {
    display: 'inline-block',
    borderRadius: t.radii.full,
    flexShrink: 0,
  },
  states: {
    primary: {
      backgroundColor: m(t.colors.primary[500], t.colors.primary[400]),
    },
    success: {
      backgroundColor: m(t.colors.success[500], t.colors.success[400]),
    },
    error: {
      backgroundColor: m(t.colors.error[500], t.colors.error[400]),
    },
    warning: {
      backgroundColor: m(t.colors.warning[500], t.colors.warning[400]),
    },
  },
  sizes: {
    sm: { width: '8px', height: '8px' },
    md: { width: '10px', height: '10px' },
    lg: { width: '12px', height: '12px' },
  },
}))
