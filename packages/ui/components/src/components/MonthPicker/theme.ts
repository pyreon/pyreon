import { defineComponentTheme } from '@pyreon/ui-theme'

export const monthPickerTheme = defineComponentTheme('MonthPicker', (t, m) => ({
  base: {
    backgroundColor: m('#fff', t.colors.gray[900]),
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: m(t.colors.gray[200], t.colors.gray[800]),
    borderRadius: t.radii.lg,
    padding: t.spacing[3],
  },
}))
