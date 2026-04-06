import { defineComponentTheme } from '@pyreon/ui-theme'

export const segmentedControlTheme = defineComponentTheme('SegmentedControl', (t, m) => ({
  base: {
    display: 'inline-flex',
    backgroundColor: m(t.colors.gray[100], t.colors.gray[800]),
    borderRadius: t.radii.md,
    padding: t.spacing[0.5],
  },
  states: {
    primary: {
      backgroundColor: m(t.colors.gray[100], t.colors.gray[800]),
    },
  },
  sizes: {
    sm: {
      padding: t.spacing[0.5],
      borderRadius: t.radii.sm,
    },
    md: {
      padding: t.spacing[0.5],
      borderRadius: t.radii.md,
    },
    lg: {
      padding: t.spacing[1],
      borderRadius: t.radii.lg,
    },
  },
}))

export const segmentedControlItemTheme = defineComponentTheme('SegmentedControlItem', (t, m) => ({
  base: {
    cursor: 'pointer',
    fontWeight: t.fontWeight.medium,
    fontSize: t.fontSize.sm,
    transition: t.transition.fast,
    borderRadius: t.radii.sm,
    color: m(t.colors.gray[600], t.colors.gray[400]),
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    hover: {
      color: m(t.colors.gray[900], t.colors.gray[100]),
    },
  },
  sizes: {
    sm: {
      fontSize: t.fontSize.xs,
      paddingTop: t.spacing[1],
      paddingBottom: t.spacing[1],
      paddingLeft: t.spacing[2.5],
      paddingRight: t.spacing[2.5],
    },
    md: {
      fontSize: t.fontSize.sm,
      paddingTop: t.spacing[1.5],
      paddingBottom: t.spacing[1.5],
      paddingLeft: t.spacing[3],
      paddingRight: t.spacing[3],
    },
    lg: {
      fontSize: t.fontSize.md,
      paddingTop: t.spacing[2],
      paddingBottom: t.spacing[2],
      paddingLeft: t.spacing[4],
      paddingRight: t.spacing[4],
    },
  },
}))
