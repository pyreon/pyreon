import { defineComponentTheme } from '@pyreon/ui-theme'

export const tableTheme = defineComponentTheme('Table', (t, _m) => ({
  base: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: t.fontFamily.sans,
    fontSize: t.fontSize.sm,
  },
  sizes: {
    compact: { fontSize: t.fontSize.xs },
    default: { fontSize: t.fontSize.sm },
    relaxed: { fontSize: t.fontSize.md },
  },
  variants: {
    simple: {},
    striped: {},
    bordered: {
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#e5e7eb',
    },
  },
}))
