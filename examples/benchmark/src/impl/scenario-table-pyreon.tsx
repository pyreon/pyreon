/**
 * Pyreon's table for the `table` scenario — its own `.tsx` so the Pyreon
 * compiler processes it (what a vite-plugin app ships), the same reason as
 * `scenario-dbmon-pyreon.tsx`.
 *
 * Idiomatic fine-grained `@pyreon/table`: a keyed `<For>` over the row model,
 * `visibleCells` for each row's cells list, `flexRenderCell` for each cell —
 * the shape the package documents, and the one the happy-dom bench
 * (`packages/fundamentals/table/bench/table-bench.ts`) times.
 */
import { For } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import {
  columnVisibilityFeature,
  createSortedRowModel,
  flexRenderCell,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  visibleCells,
} from '@pyreon/table'
import { columnDefs, type TableRow } from './scenario-table-data'

const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
})

export interface PyreonTableHandle {
  sort(desc: boolean): void
}

export function PyreonTableApp(props: {
  data: Signal<TableRow[]>
  onReady: (h: PyreonTableHandle) => void
}): VNodeChild {
  const table = useTable(() => ({
    data: props.data(),
    columns: columnDefs,
    features,
    getRowId: (r: TableRow) => String(r.id),
  }))
  props.onReady({ sort: (desc) => table.getColumn('c0')!.toggleSorting(desc) })
  return (
    <table>
      <tbody>
        <For each={() => table.getRowModel().rows} by={(r) => r.id}>
          {(row) => {
            const rowId = row.id
            return (
              <tr data-rowid={rowId}>
                <For each={() => visibleCells(table, rowId)} by={(c) => c.id}>
                  {(cell) => {
                    const colId = cell.column.id
                    return <td>{() => String(flexRenderCell(table, rowId, colId))}</td>
                  }}
                </For>
              </tr>
            )
          }}
        </For>
      </tbody>
    </table>
  )
}
