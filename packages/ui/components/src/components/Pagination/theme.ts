import { defineComponentTheme } from '@pyreon/ui-theme'

export const paginationTheme = defineComponentTheme('Pagination', (t, m) => ({
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing[1],
  },
  sizes: {
    sm: {
      gap: t.spacing[0.5],
      fontSize: t.fontSize.xs,
      paddingTop: t.spacing[1],
      paddingBottom: t.spacing[1],
      paddingLeft: t.spacing[2],
      paddingRight: t.spacing[2],
    },
    md: {
      gap: t.spacing[1],
      fontSize: t.fontSize.sm,
      paddingTop: t.spacing[1.5],
      paddingBottom: t.spacing[1.5],
      paddingLeft: t.spacing[3],
      paddingRight: t.spacing[3],
    },
    lg: {
      gap: t.spacing[1.5],
      fontSize: t.fontSize.md,
      paddingTop: t.spacing[2],
      paddingBottom: t.spacing[2],
      paddingLeft: t.spacing[4],
      paddingRight: t.spacing[4],
    },
  },
}))
