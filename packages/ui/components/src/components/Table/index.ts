import { el } from '../../factory'

const Table = el
  .config({ name: 'Table' })
  .attrs({ tag: 'table' })
  .theme((t) => ({
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: t.fontSize.small,
    // Market-standard default: a subtle divider under each body row (Mantine/
    // Chakra table default). The `simple` variant removes it; `striped` and
    // `simple` carry SELF-CONTAINED extendCss strings because a variant's
    // extendCss REPLACES the base string (key-level theme merge).
    extendCss: `
      & tbody tr { border-bottom: 1px solid ${t.color.system.base[200]}; }
    `,
  }))
  .sizes((t) => ({
    compact: { fontSize: t.fontSize.xSmall },
    default: { fontSize: t.fontSize.small },
    relaxed: { fontSize: t.fontSize.base },
  }))
  .variants((t) => ({
    // Borderless: no row dividers at all (the pre-divider minimal look).
    simple: {
      extendCss: `
        & tbody tr { border-bottom: 0; }
      `,
    },
    // Alternating body-row background + the default dividers (self-contained).
    striped: {
      extendCss: `
        & tbody tr { border-bottom: 1px solid ${t.color.system.base[200]}; }
        & tbody tr:nth-child(even) { background-color: ${t.color.system.base[50]}; }
      `,
    },
    bordered: {
      borderWidth: t.borderWidth.base,
      borderStyle: t.borderStyle.base,
      borderColor: t.color.system.base[200],
    },
  }))

export default Table
