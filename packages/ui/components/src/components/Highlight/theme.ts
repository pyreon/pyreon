import { defineComponentTheme } from '@pyreon/ui-theme'

export const highlightTheme = defineComponentTheme('Highlight', (t, m) => ({
  base: {
    backgroundColor: m(t.colors.warning[200], t.colors.warning[800]),
    color: 'inherit',
    borderRadius: t.radii.sm,
    padding: `${t.spacing[0]} ${t.spacing[1]}`,
  },
  states: {
    primary: {
      backgroundColor: m(t.colors.primary[100], t.colors.primary[800]),
    },
    success: {
      backgroundColor: m(t.colors.success[100], t.colors.success[800]),
    },
    warning: {
      backgroundColor: m(t.colors.warning[200], t.colors.warning[800]),
    },
    error: {
      backgroundColor: m(t.colors.error[100], t.colors.error[800]),
    },
  },
}))
