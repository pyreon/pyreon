import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Table = rocketstyle({ useBooleans: true })({ name: 'Table', component: Element })
  .attrs({ tag: 'table' } as any)
  .theme({
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: 14,
    lineHeight: 1.5,
  })
  .sizes({
    compact: { fontSize: 12 },
    default: { fontSize: 14 },
    relaxed: { fontSize: 16 },
  })
  .variants({
    simple: {},
    striped: { backgroundColor: '#f9fafb' },
    bordered: {
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#e5e7eb',
    },
  })

export default Table
