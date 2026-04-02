import { defineComponentTheme } from '@pyreon/ui-theme'

export const badgeTheme = defineComponentTheme('Badge', (t, m) => ({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    fontWeight: t.fontWeight.medium,
    fontFamily: t.fontFamily.sans,
    lineHeight: t.lineHeight.tight,
    borderRadius: t.radii.full,
    whiteSpace: 'nowrap',
  },
  states: {
    primary: {
      backgroundColor: m(t.colors.primary[100], t.colors.primary[900]),
      color: m(t.colors.primary[800], t.colors.primary[200]),
    },
    secondary: {
      backgroundColor: m(t.colors.gray[100], t.colors.gray[800]),
      color: m(t.colors.gray[800], t.colors.gray[200]),
    },
    success: {
      backgroundColor: m(t.colors.success[100], t.colors.success[900]),
      color: m(t.colors.success[800], t.colors.success[200]),
    },
    error: {
      backgroundColor: m(t.colors.error[100], t.colors.error[900]),
      color: m(t.colors.error[800], t.colors.error[200]),
    },
    warning: {
      backgroundColor: m(t.colors.warning[100], t.colors.warning[900]),
      color: m(t.colors.warning[800], t.colors.warning[200]),
    },
  },
  sizes: {
    sm: {
      fontSize: t.fontSize.xs,
      paddingLeft: t.spacing[2],
      paddingRight: t.spacing[2],
      paddingTop: t.spacing[0],
      paddingBottom: t.spacing[0],
    },
    md: {
      fontSize: t.fontSize.sm,
      paddingLeft: t.spacing[3],
      paddingRight: t.spacing[3],
      paddingTop: t.spacing[1],
      paddingBottom: t.spacing[1],
    },
    lg: {
      fontSize: t.fontSize.md,
      paddingLeft: t.spacing[4],
      paddingRight: t.spacing[4],
      paddingTop: t.spacing[1],
      paddingBottom: t.spacing[1],
    },
  },
  variants: {
    solid: {},
    outline: {
      backgroundColor: 'transparent',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'currentColor',
    },
    subtle: {
      opacity: 0.8,
    },
  },
}))
