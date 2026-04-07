import { el } from '../../factory'

const Table = el
  .config({ name: 'Table' })
  .attrs({ tag: 'table' })
  .theme((t) => ({
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: t.fontSize.small,
  }))
  .sizes((t) => ({
    compact: { fontSize: t.fontSize.xSmall },
    default: { fontSize: t.fontSize.small },
    relaxed: { fontSize: t.fontSize.base },
  }))
  .variants((t) => ({
    simple: {},
    striped: {},
    bordered: {
      borderWidth: t.borderWidth.base,
      borderStyle: t.borderStyle.base,
      borderColor: t.color.system.base[200],
    },
  }))

export default Table
