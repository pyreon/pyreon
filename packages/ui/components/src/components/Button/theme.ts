import { defineComponentTheme } from '@pyreon/ui-theme'

export const buttonTheme = defineComponentTheme('Button', (t, m) => ({
  base: {
    fontSize: t.fontSize.sm,
    fontWeight: t.fontWeight.medium,
    lineHeight: t.lineHeight.normal,
    borderRadius: t.radii.md,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    transition: t.transition.fast,
    display: 'inline-flex',
    gap: t.spacing[2],
    whiteSpace: 'nowrap',
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
    active: {
      transform: 'scale(0.98)',
    },
  },
  states: {
    primary: {
      backgroundColor: m(t.colors.primary[500], t.colors.primary[600]),
      color: '#fff',
      hover: { backgroundColor: m(t.colors.primary[600], t.colors.primary[500]) },
      active: { backgroundColor: m(t.colors.primary[700], t.colors.primary[400]) },
    },
    secondary: {
      backgroundColor: m(t.colors.gray[100], t.colors.gray[800]),
      color: m(t.colors.gray[700], t.colors.gray[200]),
      hover: { backgroundColor: m(t.colors.gray[200], t.colors.gray[700]) },
      active: { backgroundColor: m(t.colors.gray[300], t.colors.gray[600]) },
    },
    danger: {
      backgroundColor: m(t.colors.error[500], t.colors.error[600]),
      color: '#fff',
      hover: { backgroundColor: m(t.colors.error[600], t.colors.error[500]) },
      active: { backgroundColor: m(t.colors.error[700], t.colors.error[400]) },
      focus: { boxShadow: `0 0 0 3px ${m(t.colors.error[200], t.colors.error[800])}` },
    },
    success: {
      backgroundColor: m(t.colors.success[500], t.colors.success[600]),
      color: '#fff',
      hover: { backgroundColor: m(t.colors.success[600], t.colors.success[500]) },
      active: { backgroundColor: m(t.colors.success[700], t.colors.success[400]) },
      focus: { boxShadow: `0 0 0 3px ${m(t.colors.success[200], t.colors.success[800])}` },
    },
  },
  sizes: {
    xs: {
      fontSize: t.fontSize.xs,
      paddingTop: t.spacing[1],
      paddingBottom: t.spacing[1],
      paddingLeft: t.spacing[2],
      paddingRight: t.spacing[2],
      borderRadius: t.radii.sm,
    },
    sm: {
      fontSize: t.fontSize.sm,
      paddingTop: t.spacing[1.5],
      paddingBottom: t.spacing[1.5],
      paddingLeft: t.spacing[3],
      paddingRight: t.spacing[3],
      borderRadius: t.radii.md,
    },
    md: {
      fontSize: t.fontSize.sm,
      paddingTop: t.spacing[2],
      paddingBottom: t.spacing[2],
      paddingLeft: t.spacing[4],
      paddingRight: t.spacing[4],
      borderRadius: t.radii.md,
    },
    lg: {
      fontSize: t.fontSize.md,
      paddingTop: t.spacing[2.5],
      paddingBottom: t.spacing[2.5],
      paddingLeft: t.spacing[5],
      paddingRight: t.spacing[5],
      borderRadius: t.radii.lg,
    },
    xl: {
      fontSize: t.fontSize.lg,
      paddingTop: t.spacing[3],
      paddingBottom: t.spacing[3],
      paddingLeft: t.spacing[6],
      paddingRight: t.spacing[6],
      borderRadius: t.radii.lg,
    },
  },
  variants: {
    solid: {},
    outline: {
      backgroundColor: 'transparent',
      borderColor: m(t.colors.primary[500], t.colors.primary[400]),
      color: m(t.colors.primary[600], t.colors.primary[400]),
      hover: { backgroundColor: m(t.colors.primary[50], t.colors.primary[950]) },
    },
    subtle: {
      backgroundColor: m(t.colors.primary[50], t.colors.primary[950]),
      color: m(t.colors.primary[600], t.colors.primary[400]),
      hover: { backgroundColor: m(t.colors.primary[100], t.colors.primary[900]) },
    },
    ghost: {
      backgroundColor: 'transparent',
      color: m(t.colors.primary[600], t.colors.primary[400]),
      hover: { backgroundColor: m(t.colors.gray[100], t.colors.gray[800]) },
    },
    link: {
      backgroundColor: 'transparent',
      color: m(t.colors.primary[600], t.colors.primary[400]),
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      textDecoration: 'underline',
      hover: { color: m(t.colors.primary[700], t.colors.primary[300]) },
    },
  },
}))

export const iconButtonTheme = defineComponentTheme('IconButton', (t, m) => ({
  base: {
    backgroundColor: 'transparent',
    color: m(t.colors.gray[500], t.colors.gray[400]),
    borderRadius: t.radii.md,
    borderWidth: 0,
    cursor: 'pointer',
    transition: t.transition.fast,
    display: 'inline-flex',
    padding: t.spacing[2],
    hover: { backgroundColor: m(t.colors.gray[100], t.colors.gray[800]), color: m(t.colors.gray[900], t.colors.gray[100]) },
    focus: { boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`, outline: 'none' },
    disabled: { opacity: 0.5, cursor: 'not-allowed' },
  },
  sizes: {
    xs: { padding: t.spacing[1], fontSize: t.fontSize.sm },
    sm: { padding: t.spacing[1.5], fontSize: t.fontSize.md },
    md: { padding: t.spacing[2], fontSize: t.fontSize.lg },
    lg: { padding: t.spacing[2.5], fontSize: t.fontSize.xl },
  },
}))

export const closeButtonTheme = defineComponentTheme('CloseButton', (t, m) => ({
  base: {
    backgroundColor: 'transparent',
    color: m(t.colors.gray[400], t.colors.gray[500]),
    borderRadius: t.radii.sm,
    borderWidth: 0,
    cursor: 'pointer',
    transition: t.transition.fast,
    display: 'inline-flex',
    padding: t.spacing[1],
    hover: { backgroundColor: m(t.colors.gray[100], t.colors.gray[800]), color: m(t.colors.gray[700], t.colors.gray[300]) },
    focus: { boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`, outline: 'none' },
    disabled: { opacity: 0.5, cursor: 'not-allowed' },
  },
  sizes: {
    sm: { padding: t.spacing[0.5], fontSize: t.fontSize.sm },
    md: { padding: t.spacing[1], fontSize: t.fontSize.md },
    lg: { padding: t.spacing[1.5], fontSize: t.fontSize.lg },
  },
}))
