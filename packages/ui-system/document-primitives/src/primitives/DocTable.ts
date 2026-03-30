import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const DocTable = rocketstyle({
  dimensions: {
    variants: 'variant',
  },
  useBooleans: true,
})({ name: 'DocTable', component: Element })
  .theme({
    fontSize: 14,
    borderColor: '#dddddd',
  })
  .statics({ _documentType: 'table' as const })
  .attrs<{
    columns?: unknown[]
    rows?: unknown[]
    headerStyle?: Record<string, unknown>
    striped?: boolean
    bordered?: boolean
    caption?: string
    tag: string
    _documentProps: Record<string, unknown>
  }>((props) => ({
    tag: 'table',
    _documentProps: {
      columns: props.columns ?? [],
      rows: props.rows ?? [],
      ...(props.headerStyle ? { headerStyle: props.headerStyle } : {}),
      ...(props.striped ? { striped: props.striped } : {}),
      ...(props.bordered ? { bordered: props.bordered } : {}),
      ...(props.caption ? { caption: props.caption } : {}),
    },
  }))

export default DocTable
