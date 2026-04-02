import { defineComponentTheme } from '@pyreon/ui-theme'

export const breadcrumbTheme = defineComponentTheme('Breadcrumb', (t) => ({
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing[2],
    fontSize: t.fontSize.sm,
  },
}))

export const breadcrumbItemTheme = defineComponentTheme('BreadcrumbItem', (t, m) => ({
  base: {
    color: m(t.colors.gray[500], t.colors.gray[400]),
    transition: t.transition.fast,
    textDecoration: 'none',
    hover: {
      color: m(t.colors.gray[700], t.colors.gray[300]),
    },
    focus: {
      boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`,
      outline: 'none',
      borderRadius: t.radii.sm,
    },
    active: {
      color: m(t.colors.gray[900], t.colors.gray[100]),
      fontWeight: t.fontWeight.medium,
    },
  },
}))
