/**
 * Source of the Vue and Solid rival arms in the `virtual`, `table` and `flow`
 * scenarios, compiled at BUILD time by `vite-rivals.ts` (Vue: the SFC compile
 * options every Vue arm uses; Solid: the real `babel-preset-solid@1.9`).
 *
 * Each entry follows the adapter's own documented example; the URL is above it.
 */

/** Vue templates → `virtual:rival-vue/<key>` (exports `render`). */
export const RIVAL_VUE_TEMPLATES: Record<string, string> = {
  // @tanstack/vue-virtual — https://tanstack.com/virtual/latest/docs/framework/vue/examples/fixed
  // (a relative inner div sized by getTotalSize(), absolutely positioned rows
  // translated by `start`, keyed by index).
  'virtual-tanstack': `<div :style="{ height: v.getTotalSize() + 'px', position: 'relative' }">
  <div
    v-for="vi in v.getVirtualItems()"
    :key="vi.index"
    class="row"
    :data-i="vi.index"
    :style="{ position: 'absolute', top: 0, left: 0, right: 0, height: vi.size + 'px', transform: 'translateY(' + vi.start + 'px)' }"
  >Row {{ vi.index }}</div>
</div>`,

  // vue-virtual-scroller 3 — RecycleScroller "Fixed-size rows" pattern from the
  // package's shipped docs (skills/vue-virtual-scroller/references/recycle-scroller.md;
  // https://github.com/Akryum/vue-virtual-scroller#recyclescroller).
  'virtual-scroller': `<RecycleScroller
  ref="scroller"
  v-slot="{ item }"
  :items="items"
  :item-size="40"
  :buffer="160"
  key-field="id"
  style="height: 600px"
>
  <div class="row" :data-i="item.id">Row {{ item.id }}</div>
</RecycleScroller>`,

  // @tanstack/vue-table v9 — https://tanstack.com/table/latest/docs/framework/vue/examples/basic
  // (rows from getRowModel(), cells from getVisibleCells(), FlexRender per cell).
  'table-tanstack': `<table>
  <tbody>
    <tr v-for="row in table.getRowModel().rows" :key="row.id" :data-rowid="row.id">
      <td v-for="cell in row.getVisibleCells()" :key="cell.id">
        <FlexRender :cell="cell" />
      </td>
    </tr>
  </tbody>
</table>`,
}

/** Solid 1.9 JSX → `virtual:rival-solid/<key>`. */
export const RIVAL_SOLID_SOURCES: Record<string, string> = {
  // @tanstack/solid-virtual — https://tanstack.com/virtual/latest/docs/framework/solid/examples/fixed
  'virtual-tanstack': `
import { For } from 'solid-js'
import { render } from 'solid-js/web'
import { createVirtualizer } from '@tanstack/solid-virtual'

function List(props) {
  const v = createVirtualizer({
    count: props.count,
    getScrollElement: () => props.scroller,
    estimateSize: () => props.rowSize,
    overscan: props.overscan,
  })
  return (
    <div style={{ height: v.getTotalSize() + 'px', position: 'relative' }}>
      <For each={v.getVirtualItems()}>
        {(vi) => (
          <div
            class="row"
            data-i={vi.index}
            style={{ position: 'absolute', top: '0', left: '0', right: '0', height: vi.size + 'px', transform: 'translateY(' + vi.start + 'px)' }}
          >
            Row {vi.index}
          </div>
        )}
      </For>
    </div>
  )
}

export function mountList(scroller, count, rowSize, overscan) {
  return render(() => <List scroller={scroller} count={count} rowSize={rowSize} overscan={overscan} />, scroller)
}
`,

  // @tanstack/solid-table v9 — https://tanstack.com/table/latest/docs/framework/solid/examples/basic
  // (createTable with a getter for reactive data, <For> rows and cells,
  // <FlexRender cell={cell} />).
  'table-tanstack': `
import { For, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { createTable, FlexRender } from '@tanstack/solid-table'

function Table(props) {
  const table = createTable({
    features: props.features,
    columns: props.columns,
    get data() {
      return props.data()
    },
    getRowId: (r) => String(r.id),
  })
  props.onReady(table)
  return (
    <table>
      <tbody>
        <For each={table.getRowModel().rows}>
          {(row) => (
            <tr data-rowid={row.id}>
              <For each={row.getVisibleCells()}>
                {(cell) => (
                  <td>
                    <FlexRender cell={cell} />
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

export function mountTable(host, initial, features, columns, onReady) {
  const [data, setData] = createSignal(initial)
  const dispose = render(
    () => <Table data={data} features={features} columns={columns} onReady={onReady} />,
    host,
  )
  return { dispose, setData }
}
`,
}
