import { defineComponentTheme } from '@pyreon/ui-theme'

export const tabsTheme = defineComponentTheme('Tabs', (t, m) => ({
  base: {
    display: 'flex',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: m(t.colors.gray[200], t.colors.gray[800]),
    gap: 0,
  },
  variants: {
    line: {},
    enclosed: {
      borderBottomWidth: 0,
      gap: t.spacing[1],
    },
    pills: {
      borderBottomWidth: 0,
      gap: t.spacing[1],
    },
  },
}))

export const tabTheme = defineComponentTheme('Tab', (t, m) => ({
  base: {
    color: m(t.colors.gray[500], t.colors.gray[400]),
    fontSize: t.fontSize.sm,
    fontWeight: t.fontWeight.medium,
    cursor: 'pointer',
    paddingTop: t.spacing[2],
    paddingBottom: t.spacing[2],
    paddingLeft: t.spacing[4],
    paddingRight: t.spacing[4],
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    transition: t.transition.fast,
    whiteSpace: 'nowrap',
    hover: {
      color: m(t.colors.gray[700], t.colors.gray[300]),
    },
    focus: {
      boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`,
      outline: 'none',
      borderRadius: t.radii.sm,
    },
    active: {
      borderBottomColor: m(t.colors.primary[500], t.colors.primary[400]),
      color: m(t.colors.primary[600], t.colors.primary[400]),
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  },
  variants: {
    line: {},
    enclosed: {
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: 'transparent',
      borderBottomWidth: 0,
      borderRadius: `${t.radii.md} ${t.radii.md} 0 0`,
      active: {
        borderColor: m(t.colors.gray[200], t.colors.gray[700]),
        backgroundColor: m('#fff', t.colors.gray[900]),
      },
    },
    pills: {
      borderBottomWidth: 0,
      borderRadius: t.radii.md,
      active: {
        backgroundColor: m(t.colors.primary[500], t.colors.primary[600]),
        color: '#fff',
      },
    },
  },
}))

export const tabPanelTheme = defineComponentTheme('TabPanel', (t) => ({
  base: {
    paddingTop: t.spacing[4],
  },
}))
