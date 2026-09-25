import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import {
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  flexRenderCell,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  visibleCells,
} from '@pyreon/table'

interface Person {
  name: string
  age: number
  role: string
}

// One feature set, module scope — `rowSortingFeature` gives columns
// `toggleSorting`/`getToggleSortingHandler`; `columnVisibilityFeature`
// gives rows `getVisibleCells`. See the "Registering features" section
// on this page for why v9 needs this explicit set.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
  columnVisibilityFeature,
})

const columnHelper = createColumnHelper<typeof features, Person>()

const columns = columnHelper.columns([
  columnHelper.accessor('name', { header: 'Name' }),
  columnHelper.accessor('age', { header: 'Age' }),
  columnHelper.accessor('role', { header: 'Role' }),
])

/**
 * The live counterpart to the "Basic Usage" snippet on this page — a REAL
 * `@pyreon/table` instance wired to `useTable`, sorted via the real
 * `rowSortingFeature`, and rendered with a keyed `<For>` (not `.map()`) so
 * sorting reorders/reuses DOM nodes instead of rebuilding the whole
 * `<tbody>` on every click.
 */
export default function SortableTable() {
  const data = signal<Person[]>([
    { name: 'Alice', age: 30, role: 'Engineer' },
    { name: 'Bob', age: 25, role: 'Designer' },
    { name: 'Charlie', age: 35, role: 'Manager' },
    { name: 'Diana', age: 28, role: 'Engineer' },
  ])

  const table = useTable(() => ({
    features,
    data: data(),
    columns,
  }))

  return (
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <thead>
        <For each={() => table.getHeaderGroups()} by={(g) => g.id}>
          {(headerGroup) => (
            <tr>
              <For each={() => headerGroup.headers} by={(h) => h.id}>
                {(header) => (
                  <th
                    onClick={header.column.getToggleSortingHandler()}
                    style="cursor: pointer; padding: 6px 12px; text-align: left; border-bottom: 2px solid #ddd;"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {() => {
                      const dir = header.column.getIsSorted()
                      return dir === 'asc' ? ' ▲' : dir === 'desc' ? ' ▼' : ''
                    }}
                  </th>
                )}
              </For>
            </tr>
          )}
        </For>
      </thead>
      <tbody>
        <For each={() => table.getRowModel().rows} by={(r) => r.id}>
          {(row) => (
            <tr>
              <For each={() => visibleCells(table, row.id)} by={(c) => c.id}>
                {/* Fine-grained: flexRenderCell inside an accessor so a
                    single-cell edit would patch ONLY this cell — no
                    re-render of the row or table. */}
                {(cell) => (
                  <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">
                    {() => flexRenderCell(table, row.id, cell.column.id)}
                  </td>
                )}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}
