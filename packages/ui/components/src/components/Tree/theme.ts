import { defineComponentTheme } from '@pyreon/ui-theme'

export const treeTheme = defineComponentTheme('Tree', (t, m) => ({
  base: {
    fontSize: t.fontSize.sm,
    color: m(t.colors.gray[700], t.colors.gray[300]),
  },
}))
