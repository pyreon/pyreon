import { defineComponentTheme } from '@pyreon/ui-theme'

export const selectTheme = defineComponentTheme('Select', (t, m) => ({
  base: {
    width: '100%',
    backgroundColor: m('#fff', t.colors.gray[900]),
    color: m(t.colors.gray[900], t.colors.gray[100]),
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: m(t.colors.gray[300], t.colors.gray[700]),
    borderRadius: t.radii.md,
    fontSize: t.fontSize.sm,
    lineHeight: t.lineHeight.normal,
    transition: t.transition.fast,
    outline: 'none',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M3 5l3 3 3-3'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    cursor: 'pointer',
    focus: {
      borderColor: m(t.colors.primary[500], t.colors.primary[400]),
      boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`,
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      backgroundColor: m(t.colors.gray[50], t.colors.gray[800]),
    },
  },
  states: {
    error: {
      borderColor: m(t.colors.error[500], t.colors.error[400]),
      focus: {
        boxShadow: `0 0 0 3px ${m(t.colors.error[200], t.colors.error[800])}`,
      },
    },
  },
  sizes: {
    sm: {
      fontSize: t.fontSize.xs,
      paddingTop: t.spacing[1.5],
      paddingBottom: t.spacing[1.5],
      paddingLeft: t.spacing[2.5],
      paddingRight: t.spacing[8],
      borderRadius: t.radii.sm,
    },
    md: {
      fontSize: t.fontSize.sm,
      paddingTop: t.spacing[2],
      paddingBottom: t.spacing[2],
      paddingLeft: t.spacing[3],
      paddingRight: t.spacing[10],
      borderRadius: t.radii.md,
    },
    lg: {
      fontSize: t.fontSize.md,
      paddingTop: t.spacing[2.5],
      paddingBottom: t.spacing[2.5],
      paddingLeft: t.spacing[4],
      paddingRight: t.spacing[12],
      borderRadius: t.radii.lg,
    },
  },
}))
