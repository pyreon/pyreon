import { defineComponentTheme } from '@pyreon/ui-theme'

export const tableTheme = defineComponentTheme('Table', (t, m) => ({
  base: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: t.fontFamily.sans,
    fontSize: t.fontSize.sm,
    color: m(t.colors.gray[700], t.colors.gray[300]),
  },
  sizes: {
    compact: {
      '& th, & td': {
        paddingTop: t.spacing[1],
        paddingBottom: t.spacing[1],
        paddingLeft: t.spacing[2],
        paddingRight: t.spacing[2],
      },
    },
    default: {
      '& th, & td': {
        paddingTop: t.spacing[3],
        paddingBottom: t.spacing[3],
        paddingLeft: t.spacing[4],
        paddingRight: t.spacing[4],
      },
    },
    relaxed: {
      '& th, & td': {
        paddingTop: t.spacing[5],
        paddingBottom: t.spacing[5],
        paddingLeft: t.spacing[6],
        paddingRight: t.spacing[6],
      },
    },
  },
  variants: {
    simple: {
      '& th': {
        borderBottomWidth: '2px',
        borderBottomStyle: 'solid',
        borderBottomColor: m(t.colors.gray[200], t.colors.gray[700]),
      },
      '& td': {
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: m(t.colors.gray[100], t.colors.gray[800]),
      },
    },
    striped: {
      '& tbody tr:nth-child(even)': {
        backgroundColor: m(t.colors.gray[50], t.colors.gray[800]),
      },
    },
    bordered: {
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: m(t.colors.gray[200], t.colors.gray[700]),
      '& th, & td': {
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: m(t.colors.gray[200], t.colors.gray[700]),
      },
    },
  },
}))
