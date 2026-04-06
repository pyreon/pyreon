import { defineComponentTheme } from '@pyreon/ui-theme'

export const multiSelectTheme = defineComponentTheme('MultiSelect', (t, m) => ({
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
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: t.spacing[1],
    focus: {
      borderColor: m(t.colors.primary[500], t.colors.primary[400]),
      boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`,
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      backgroundColor: m(t.colors.gray[50], t.colors.gray[800]),
    },
    placeholder: {
      color: m(t.colors.gray[400], t.colors.gray[500]),
    },
  },
  sizes: {
    sm: {
      fontSize: t.fontSize.xs,
      minHeight: '32px',
      paddingTop: t.spacing[1],
      paddingBottom: t.spacing[1],
      paddingLeft: t.spacing[2.5],
      paddingRight: t.spacing[2.5],
      borderRadius: t.radii.sm,
    },
    md: {
      fontSize: t.fontSize.sm,
      minHeight: '40px',
      paddingTop: t.spacing[1.5],
      paddingBottom: t.spacing[1.5],
      paddingLeft: t.spacing[3],
      paddingRight: t.spacing[3],
      borderRadius: t.radii.md,
    },
    lg: {
      fontSize: t.fontSize.md,
      minHeight: '48px',
      paddingTop: t.spacing[2],
      paddingBottom: t.spacing[2],
      paddingLeft: t.spacing[4],
      paddingRight: t.spacing[4],
      borderRadius: t.radii.lg,
    },
  },
}))
