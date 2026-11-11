<!--
  `Svelte 5 (svelte-table)` arm of the `table` scenario.

  @tanstack/svelte-table v9 basic example
  (https://tanstack.com/table/latest/docs/framework/svelte/examples/basic):
  `createTable` with a getter for reactive data, keyed `{#each}` over
  `getRowModel().rows` and `getVisibleCells()`, `<FlexRender cell={cell} />`.
  Data is `$state.raw` because it is replaced wholesale, never mutated in place
  (the same reason as `bench-state.svelte.ts`).
-->
<script lang="ts">
  import {
    columnVisibilityFeature,
    createSortedRowModel,
    createTable,
    FlexRender,
    rowSortingFeature,
    sortFns,
    tableFeatures,
  } from '@tanstack/svelte-table'
  import { columnDefs, type TableRow } from './scenario-table-data'

  interface Handle {
    setData: (rows: TableRow[]) => void
    sort: (desc: boolean) => void
  }
  let { initial, onReady }: { initial: TableRow[]; onReady: (h: Handle) => void } = $props()

  const features = tableFeatures({
    rowSortingFeature,
    columnVisibilityFeature,
    sortedRowModel: createSortedRowModel(),
    sortFns,
  })

  let data = $state.raw(initial)
  const table = createTable({
    features,
    columns: columnDefs as never,
    get data() {
      return data
    },
    getRowId: (r: TableRow) => String(r.id),
  })

  onReady({
    setData: (rows) => {
      data = rows
    },
    sort: (desc) => table.getColumn('c0')!.toggleSorting(desc),
  })
</script>

<table>
  <tbody>
    {#each table.getRowModel().rows as row (row.id)}
      <tr data-rowid={row.id}>
        {#each row.getVisibleCells() as cell (cell.id)}
          <td><FlexRender {cell} /></td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>
