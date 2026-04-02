import { defineComponentTheme } from '@pyreon/ui-theme'

export const navLinkTheme = defineComponentTheme('NavLink', (t, m) => ({
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing[3],
    paddingTop: t.spacing[2],
    paddingBottom: t.spacing[2],
    paddingLeft: t.spacing[3],
    paddingRight: t.spacing[3],
    borderRadius: t.radii.md,
    fontSize: t.fontSize.sm,
    color: m(t.colors.gray[700], t.colors.gray[300]),
    textDecoration: 'none',
    cursor: 'pointer',
    transition: t.transition.fast,
    hover: {
      backgroundColor: m(t.colors.gray[100], t.colors.gray[800]),
    },
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
    active: {
      backgroundColor: m(t.colors.primary[50], t.colors.primary[950]),
      color: m(t.colors.primary[700], t.colors.primary[300]),
    },
  },
}))
