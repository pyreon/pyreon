import { defineComponentTheme } from '@pyreon/ui-theme'

export const cardTheme = defineComponentTheme('Card', (t, m) => ({
  base: {
    backgroundColor: m('#ffffff', t.colors.gray[900]),
    borderRadius: t.radii.lg,
    padding: t.spacing[6],
  },
  variants: {
    elevated: {
      boxShadow: t.shadows.sm,
    },
    outline: {
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: m(t.colors.gray[200], t.colors.gray[700]),
    },
    filled: {
      backgroundColor: m(t.colors.gray[50], t.colors.gray[800]),
    },
  },
}))
