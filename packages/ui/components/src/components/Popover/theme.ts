import { defineComponentTheme } from '@pyreon/ui-theme'

export const popoverTheme = defineComponentTheme('Popover', (t, m) => ({
  base: {
    backgroundColor: m('#fff', t.colors.gray[900]),
    borderRadius: t.radii.lg,
    boxShadow: t.shadows.lg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: m(t.colors.gray[200], t.colors.gray[700]),
    padding: t.spacing[4],
    zIndex: 50,
  },
}))
