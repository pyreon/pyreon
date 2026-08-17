import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — table snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/table — Pyreon adapter for TanStack Table — reactive options, signal-driven state, flexRender. Options must be a FUNCTION \`() => TableOptions<T>\`, not a plain object. Signal reads inside the function are tracked reactively — changing any tracked signal re-syncs the table automatically."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/table — TanStack Table Adapter

      Reactive TanStack Table v9 adapter for Pyreon. Options are passed as a function so signal reads inside (data, columns, state) automatically re-sync the table when any tracked signal changes. Returns the Table instance directly: its state lives in Pyreon signals through v9's pluggable reactivity seam, so reads track natively inside templates and effects. Re-exports the TanStack Table author surface — all 16 features, every row model and built-in fn — as an explicit, curated list.

      \`\`\`typescript
      import {
        useTable, flexRender, flexRenderCell, visibleCells,
        tableFeatures, rowSortingFeature, createSortedRowModel, sortFn_alphanumeric,
        type ColumnDef,
      } from '@pyreon/table'
      import { signal } from '@pyreon/reactivity'

      interface User { name: string; email: string; age: number }

      // v9 registers capabilities EXPLICITLY — define the set once, at module scope,
      // with only what this table uses (that is what keeps the bundle small).
      const features = tableFeatures({
        rowSortingFeature,
        sortedRowModel: createSortedRowModel(),
        sortFns: { alphanumeric: sortFn_alphanumeric },
      })

      const users = signal<User[]>([
        { name: 'Alice', email: 'alice@example.com', age: 30 },
        { name: 'Bob', email: 'bob@example.com', age: 25 },
      ])

      const columns: ColumnDef<typeof features, User>[] = [
        { accessorKey: 'name', header: 'Name' },
        { accessorKey: 'email', header: 'Email' },
        { accessorKey: 'age', header: 'Age' },
      ]

      // Options as a FUNCTION — signal reads inside auto-track.
      // Changing users() re-syncs the entire table reactively.
      const table = useTable(() => ({
        features,
        data: users(),
        columns,
      }))

      // In JSX — read the table inside reactive scopes (no accessor call):
      <table>
        <thead>
          <For each={() => table.getHeaderGroups()} by={(g) => g.id}>
            {(group) => (
              <tr>
                <For each={() => group.headers} by={(h) => h.id}>
                  {(header) => (
                    <th onClick={header.column.getToggleSortingHandler()}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
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
                  {/* flexRenderCell(table, …) inside an accessor = fine-grained:
                      a single-cell edit patches ONLY this cell. Plain
                      flexRender(cell…, cell.getContext()) FREEZES on a value change
                      because the keyed <For> reuses the cell and never re-runs it. */}
                  {(cell) => <td>{() => flexRenderCell(table, row.id, cell.column.id)}</td>}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      \`\`\`

      > **Note**: Options must be a FUNCTION \`() => TableOptions<T>\`, not a plain object. Signal reads inside the function are tracked reactively — changing any tracked signal re-syncs the table automatically.
      >
      > **Re-exports**: The TanStack Table author surface is re-exported from \`@pyreon/table\` — all 16 features (rowSortingFeature, columnFilteringFeature, …), every row model (createSortedRowModel, createFilteredRowModel, createPaginatedRowModel, …), every built-in filter/sort/aggregation fn, plus \`tableFeatures\`/\`stockFeatures\`. All types are re-exported too. Import from \`@pyreon/table\`, not \`@tanstack/table-core\`. The runtime list is explicit and curated (not \`export *\`) so an upstream major is OUR migration, not yours, and adapter-construction internals never leak.
      >
      > **Computed return**: useTable returns the Table INSTANCE (v9), not a Computed — there is no \`table()\` call. Its state lives in Pyreon signals, so reading it inside a reactive scope subscribes: \`<For each={() => table.getRowModel().rows}>\` makes the list reactive. The v8 accessor form was only ever a workaround for v8 having no reactivity seam.
      >
      > **Fine-grained cells**: For live/editable tables, render cells with \`flexRenderCell(table, row.id, cell.column.id)\` inside an accessor, and drive the inner cells loop with \`visibleCells(table, row.id)\` — NOT the captured \`row.getVisibleCells()\`, whose tracked memo-dep reads subscribe every row to the options atom (a data edit then re-runs ALL N cells-list accessors; measured ~3× a memoized react-table update at N=1000). With both, an in-place data edit re-runs ONLY the changed rows' bindings and patches ONE cell — no memo boilerplate, matching (and on wall-clock beating) a hand-optimized react-table. A table-STATE change (sort/filter/selection/column visibility) re-runs all cells (coarse, correct-by-default for state-reading cells).
      >
      > **reorder-on-data-edit limitation**: A DATA edit that changes the SORT ORDER (editing the column you are sorted BY) updates every cell to the correct value but does NOT re-position the keyed rows until the next structure/state change — a pre-existing base-adapter limitation of the sorted-row-model + <For> interaction (it affects plain \`flexRender\` cells too, not just \`flexRenderCell\`). Re-ordering via the sort controls (\`toggleSorting\`/\`setSorting\`) works normally. Workaround: re-apply sorting after such an edit, or sort by a column you do not edit in place.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(5)
    expect(record['table/useTable']).toBeDefined()
    expect(record['table/flexRender']).toBeDefined()
    expect(record['table/flexRenderCell']).toBeDefined()
    expect(record['table/visibleCells']).toBeDefined()
    expect(record['table/createTableState']).toBeDefined()
  })
})
