import { defineComponentTheme } from '@pyreon/ui-theme'

export const colorPickerTheme = defineComponentTheme('ColorPicker', (t, m) => ({
  base: {
    backgroundColor: m('#fff', t.colors.gray[900]),
    borderRadius: t.radii.lg,
    padding: t.spacing[3],
    boxShadow: t.shadows.md,
  },
}))
