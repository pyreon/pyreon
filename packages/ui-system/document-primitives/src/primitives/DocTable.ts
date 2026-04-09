import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

/**
 * Tabular data primitive.
 *
 * The `columns`, `rows`, `headerStyle`, `striped`, `bordered`, and
 * `caption` props are document-export metadata — they belong in
 * `_documentProps` only and must NOT be forwarded to the rendered
 * `<table>` element. The `filter` option on `.attrs()` strips them
 * from the props that flow into the DOM.
 *
 * Why this matters: HTMLTableElement's `rows` property is a
 * read-only `HTMLCollection` of `<tr>` elements. If `rows` were
 * forwarded as a DOM attr, the runtime would call
 * `el.rows = [...]` and crash with
 * `TypeError: Cannot set property rows of [object Object] which has
 * only a getter`. Same family for `columns` (`HTMLTableColElement`'s
 * column collection on parent table). Filtering them at the
 * rocketstyle layer keeps the DOM render path clean.
 */
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
  }>(
    (props) => ({
      tag: 'table',
      _documentProps: {
        columns: props.columns ?? [],
        rows: props.rows ?? [],
        ...(props.headerStyle ? { headerStyle: props.headerStyle } : {}),
        ...(props.striped ? { striped: props.striped } : {}),
        ...(props.bordered ? { bordered: props.bordered } : {}),
        ...(props.caption ? { caption: props.caption } : {}),
      },
    }),
    {
      filter: ['columns', 'rows', 'headerStyle', 'striped', 'bordered', 'caption'],
    },
  )

export default DocTable
