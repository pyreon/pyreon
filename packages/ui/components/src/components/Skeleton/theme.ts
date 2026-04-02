import { defineComponentTheme } from '@pyreon/ui-theme'

export const skeletonTheme = defineComponentTheme('Skeleton', (t, m) => ({
  base: {
    backgroundColor: m(t.colors.gray[200], t.colors.gray[800]),
    overflow: 'hidden',
  },
  variants: {
    text: {
      borderRadius: t.radii.sm,
      height: '1em',
      width: '100%',
    },
    circle: {
      borderRadius: t.radii.full,
    },
    rect: {
      borderRadius: t.radii.md,
    },
  },
}))
