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

      Reactive TanStack Table adapter for Pyreon. Options are passed as a function so signal reads inside (data, columns, sorting) automatically re-sync the table when any tracked signal changes. Returns a Computed<Table<T>> that consumers read inside templates or effects. Re-exports all TanStack Table core utilities and types for single-import convenience.

      \`\`\`typescript
      import { useTable, flexRender, getCoreRowModel, getSortedRowModel, type ColumnDef } from '@pyreon/table'
      import { signal } from '@pyreon/reactivity'

      interface User { name: string; email: string; age: number }

      const users = signal<User[]>([
        { name: 'Alice', email: 'alice@example.com', age: 30 },
        { name: 'Bob', email: 'bob@example.com', age: 25 },
      ])

      const columns: ColumnDef<User>[] = [
        { accessorKey: 'name', header: 'Name' },
        { accessorKey: 'email', header: 'Email' },
        { accessorKey: 'age', header: 'Age' },
      ]

      // Options as a FUNCTION — signal reads inside auto-track.
      // Changing users() re-syncs the entire table reactively.
      const table = useTable(() => ({
        data: users(),
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
      }))

      // In JSX — read table() inside reactive scopes:
      <table>
        <thead>
          <For each={() => table().getHeaderGroups()} by={(g) => g.id}>
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
          <For each={() => table().getRowModel().rows} by={(r) => r.id}>
            {(row) => (
              <tr>
                <For each={() => row.getVisibleCells()} by={(c) => c.id}>
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
      > **Re-exports**: All TanStack Table core utilities (getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, etc.) and types are re-exported from \`@pyreon/table\` — no need to import from \`@tanstack/table-core\` separately.
      >
      > **Computed return**: useTable returns Computed<Table<T>>, not Table<T>. Always call \`table()\` to get the instance. Reading it inside \`<For each={() => table().getRowModel().rows}>\` makes the list reactive.
      >
      > **Fine-grained cells**: For live/editable tables, render cells with \`flexRenderCell(table, row.id, cell.column.id)\` inside an accessor. An in-place data edit then re-runs ONLY the changed rows' cell bindings (per-row signals) and patches ONE cell — no memo boilerplate, matching a hand-optimized react-table. A table-STATE change (sort/filter/selection/column visibility) re-runs all cells (coarse, correct-by-default for state-reading cells).
      >
      > **reorder-on-data-edit limitation**: A DATA edit that changes the SORT ORDER (editing the column you are sorted BY) updates every cell to the correct value but does NOT re-position the keyed rows until the next structure/state change — a pre-existing base-adapter limitation of the sorted-row-model + <For> interaction (it affects plain \`flexRender\` cells too, not just \`flexRenderCell\`). Re-ordering via the sort controls (\`toggleSorting\`/\`setSorting\`) works normally. Workaround: re-apply sorting after such an edit, or sort by a column you do not edit in place.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(3)
    expect(record['table/useTable']).toBeDefined()
    expect(record['table/flexRender']).toBeDefined()
    expect(record['table/flexRenderCell']).toBeDefined()
  })
})
