import { defineComponentTheme } from '@pyreon/ui-theme'

export const timelineTheme = defineComponentTheme('Timeline', (t, m) => ({
  base: {
    paddingLeft: t.spacing[6],
    borderLeftWidth: '2px',
    borderLeftStyle: 'solid',
    borderLeftColor: m(t.colors.gray[200], t.colors.gray[700]),
    fontFamily: t.fontFamily.sans,
  },
}))
