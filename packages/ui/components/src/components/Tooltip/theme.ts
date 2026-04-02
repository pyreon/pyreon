import { defineComponentTheme } from '@pyreon/ui-theme'

export const tooltipTheme = defineComponentTheme('Tooltip', (t, m) => ({
  base: {
    backgroundColor: m(t.colors.gray[900], t.colors.gray[100]),
    color: m('#fff', t.colors.gray[900]),
    fontSize: t.fontSize.xs,
    borderRadius: t.radii.sm,
    paddingTop: t.spacing[1],
    paddingBottom: t.spacing[1],
    paddingLeft: t.spacing[2],
    paddingRight: t.spacing[2],
    zIndex: 50,
    fontWeight: t.fontWeight.medium,
    lineHeight: t.lineHeight.normal,
    pointerEvents: 'none',
    maxWidth: '200px',
  },
}))
