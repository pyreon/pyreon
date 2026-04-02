import { defineComponentTheme } from '@pyreon/ui-theme'

export const groupTheme = defineComponentTheme('Group', (t) => ({
  base: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  sizes: {
    xs: { gap: t.spacing[1] },
    sm: { gap: t.spacing[2] },
    md: { gap: t.spacing[4] },
    lg: { gap: t.spacing[6] },
    xl: { gap: t.spacing[8] },
  },
}))
