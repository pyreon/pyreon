import { defineComponentTheme } from '@pyreon/ui-theme'

export const dividerTheme = defineComponentTheme('Divider', (t, m) => ({
  base: {
    borderTopStyle: 'solid',
    borderTopColor: m(t.colors.gray[200], t.colors.gray[800]),
  },
  sizes: {
    sm: { borderTopWidth: '1px' },
    md: { borderTopWidth: '2px' },
    lg: { borderTopWidth: '3px' },
  },
  variants: {
    solid: { borderTopStyle: 'solid' },
    dashed: { borderTopStyle: 'dashed' },
    dotted: { borderTopStyle: 'dotted' },
  },
}))
