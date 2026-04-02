import { defineComponentTheme } from '@pyreon/ui-theme'

export const progressTheme = defineComponentTheme('Progress', (t, m) => ({
  base: {
    width: '100%',
    backgroundColor: m(t.colors.gray[200], t.colors.gray[800]),
    borderRadius: t.radii.full,
    overflow: 'hidden',
  },
  states: {
    primary: {
      '& > [data-part="bar"]': {
        backgroundColor: m(t.colors.primary[500], t.colors.primary[400]),
      },
    },
    success: {
      '& > [data-part="bar"]': {
        backgroundColor: m(t.colors.success[500], t.colors.success[400]),
      },
    },
    error: {
      '& > [data-part="bar"]': {
        backgroundColor: m(t.colors.error[500], t.colors.error[400]),
      },
    },
  },
  sizes: {
    sm: { height: '4px' },
    md: { height: '8px' },
    lg: { height: '12px' },
  },
}))
