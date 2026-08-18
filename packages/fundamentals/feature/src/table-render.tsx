/**
 * `feature.Table` — render the table `useTable()` already computes.
 *
 * `useTable()` derives columns from the schema, wires sorting and the global
 * filter to signals, and hands back a live TanStack table. Nothing rendered it,
 * so every app hand-wrote ~50 lines of thead/tbody — and in doing so met two
 * traps that have nothing to do with their domain:
 *
 *  1. A `<th>` carries a `key`, so the keyed reconciler REUSES the node on a
 *     state change and never re-runs its body. A sort indicator read bare
 *     therefore freezes at its first value. It must sit inside an accessor.
 *     (The documented keyed-freeze anti-pattern names a sort indicator as its
 *     example; a table e2e once caught the arrow never appearing.)
 *  2. `getVisibleCells()` comes from `columnVisibilityFeature`, which
 *     `featureTableFeatures` does not register — so `getAllCells()` is the
 *     correct call here, and reaching for the other one silently renders
 *     nothing.
 *
 * Owning both once is most of the value: an app author should never have to
 * know either.
 *
 * Per-COLUMN overrides rather than all-or-nothing, for the same reason
 * `Field` is per-field — a generated table is excellent until one column needs
 * a badge, a link or a formatted date.
 */
import { h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { flexRender } from '@pyreon/table'
import type { FeatureTableResult } from './types'

/** Context handed to a per-column cell renderer. */
export interface CellContext<TValues> {
  /** The cell's value, already extracted from the row. */
  value: unknown
  /** The whole row object. */
  row: TValues
}

export interface TableProps<TValues extends Record<string, unknown>> {
  /** The result of `feature.useTable()`. */
  of: FeatureTableResult<TValues>
  /** Class for the `<table>` element. */
  class?: string
  /** Clickable headers + sort indicator. Default true. */
  sortable?: boolean
  /** Per-column cell renderers, keyed by column id. */
  cell?: Record<string, (ctx: CellContext<TValues>) => VNodeChild>
  /** Rendered in a full-width row when there are no rows. */
  empty?: VNodeChild
}

export function createTableComponent<TValues extends Record<string, unknown>>(): (
  props: TableProps<TValues>,
) => VNodeChild {
  return function Table(props: TableProps<TValues>): VNodeChild {
    const sortable = props.sortable !== false

    const head = () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (props.of.table as any).getHeaderGroups().map((group: any) =>
        h(
          'tr',
          { key: group.id },
          group.headers.map((header: any) =>
            h(
              'th',
              {
                key: header.id,
                ...(sortable
                  ? {
                      onClick: header.column.getToggleSortingHandler(),
                      'data-sortable': 'true',
                    }
                  : {}),
              },
              flexRender(header.column.columnDef.header, header.getContext()) as VNodeChild,
              // MUST be an accessor — see the keyed-freeze note above.
              sortable
                ? () => {
                    const dir = header.column.getIsSorted()
                    return dir === 'asc' ? ' ↑' : dir === 'desc' ? ' ↓' : ''
                  }
                : null,
            ),
          ),
        ),
      )

    const body = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (props.of.table as any).getRowModel().rows as any[]
      if (rows.length === 0 && props.empty !== undefined) {
        return h(
          'tr',
          { key: '__empty__', 'data-empty': 'true' },
          h('td', { colSpan: props.of.columns.length || 1 }, props.empty as never),
        )
      }
      return rows.map((row: any) =>
        h(
          'tr',
          { key: row.id },
          // `getAllCells()`, not `getVisibleCells()` — see the note above.
          row.getAllCells().map((cell: any) => {
            const override = props.cell?.[cell.column.id]
            return h(
              'td',
              { key: cell.id, 'data-col': cell.column.id },
              override
                ? (override({ value: cell.getValue(), row: row.original as TValues }) as never)
                : (flexRender(cell.column.columnDef.cell, cell.getContext()) as VNodeChild),
            )
          }),
        ),
      )
    }

    return h(
      'table',
      { ...(props.class !== undefined ? { class: props.class } : {}) },
      h('thead', null, head),
      h('tbody', null, body),
    )
  }
}
