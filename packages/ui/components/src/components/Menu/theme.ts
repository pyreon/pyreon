import { defineComponentTheme } from '@pyreon/ui-theme'

export const menuTheme = defineComponentTheme('Menu', (t, m) => ({
  base: {
    backgroundColor: m('#fff', t.colors.gray[900]),
    boxShadow: t.shadows.lg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: m(t.colors.gray[200], t.colors.gray[700]),
    borderRadius: t.radii.lg,
    padding: t.spacing[1],
    zIndex: 50,
    minWidth: '160px',
  },
}))

export const menuItemTheme = defineComponentTheme('MenuItem', (t, m) => ({
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing[2],
    cursor: 'pointer',
    borderRadius: t.radii.sm,
    color: m(t.colors.gray[700], t.colors.gray[300]),
    transition: t.transition.fast,
    hover: {
      backgroundColor: m(t.colors.gray[100], t.colors.gray[800]),
    },
    focus: {
      backgroundColor: m(t.colors.gray[100], t.colors.gray[800]),
      outline: 'none',
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  },
  sizes: {
    sm: {
      fontSize: t.fontSize.xs,
      paddingTop: t.spacing[1],
      paddingBottom: t.spacing[1],
      paddingLeft: t.spacing[2],
      paddingRight: t.spacing[2],
    },
    md: {
      fontSize: t.fontSize.sm,
      paddingTop: t.spacing[1.5],
      paddingBottom: t.spacing[1.5],
      paddingLeft: t.spacing[3],
      paddingRight: t.spacing[3],
    },
  },
}))
