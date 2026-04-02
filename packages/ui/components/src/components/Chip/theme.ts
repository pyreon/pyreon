import { defineComponentTheme } from '@pyreon/ui-theme'

export const chipTheme = defineComponentTheme('Chip', (t, m) => ({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: t.spacing[1],
    fontWeight: t.fontWeight.medium,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: t.transition.fast,
    userSelect: 'none',
    focus: {
      boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`,
      outline: 'none',
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  },
  states: {
    primary: {
      backgroundColor: m(t.colors.primary[100], t.colors.primary[900]),
      color: m(t.colors.primary[700], t.colors.primary[300]),
      hover: { backgroundColor: m(t.colors.primary[200], t.colors.primary[800]) },
    },
    secondary: {
      backgroundColor: m(t.colors.gray[100], t.colors.gray[800]),
      color: m(t.colors.gray[700], t.colors.gray[300]),
      hover: { backgroundColor: m(t.colors.gray[200], t.colors.gray[700]) },
    },
    success: {
      backgroundColor: m(t.colors.success[100], t.colors.success[900]),
      color: m(t.colors.success[700], t.colors.success[300]),
      hover: { backgroundColor: m(t.colors.success[200], t.colors.success[800]) },
    },
    error: {
      backgroundColor: m(t.colors.error[100], t.colors.error[900]),
      color: m(t.colors.error[700], t.colors.error[300]),
      hover: { backgroundColor: m(t.colors.error[200], t.colors.error[800]) },
    },
  },
  sizes: {
    sm: {
      fontSize: t.fontSize.xs,
      paddingTop: t.spacing[0.5],
      paddingBottom: t.spacing[0.5],
      paddingLeft: t.spacing[2],
      paddingRight: t.spacing[2],
      borderRadius: t.radii.sm,
    },
    md: {
      fontSize: t.fontSize.sm,
      paddingTop: t.spacing[1],
      paddingBottom: t.spacing[1],
      paddingLeft: t.spacing[3],
      paddingRight: t.spacing[3],
      borderRadius: t.radii.md,
    },
    lg: {
      fontSize: t.fontSize.md,
      paddingTop: t.spacing[1.5],
      paddingBottom: t.spacing[1.5],
      paddingLeft: t.spacing[4],
      paddingRight: t.spacing[4],
      borderRadius: t.radii.lg,
    },
  },
  variants: {
    filled: {},
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderStyle: 'solid',
    },
  },
}))
