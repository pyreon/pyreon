import { For, onMount, onUnmount } from '@pyreon/core'
import { batch, signal } from '@pyreon/reactivity'
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  flexRender,
  flexRenderCell,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  visibleCells,
} from '@pyreon/table'
import { font, paper } from '../theme'
import { el } from '../kit/bases'
import { DemoSurface } from '../kit/cards'
import { DemoGrid, DemoPanel, Meters, PaperField, PaperHint, PaperLabel } from '../kit/demo'

interface Product {
  id: number
  name: string
  cat: string
  price: number
  stock: number
}

const NAMES = ['Desk', 'Lamp', 'Chair', 'Shelf', 'Mug', 'Pen', 'Notebook', 'Cable', 'Monitor', 'Keyboard']
const CATS = ['Office', 'Home', 'Tech', 'Kitchen']

/** 1,000 deterministic products (the server render and the first client render agree). */
const PRODUCTS: Product[] = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  name: `${NAMES[i % 10]} ${100 + i}`,
  cat: CATS[i % 4] as string,
  price: ((i * 37) % 480) + 9,
  stock: (i * 13) % 120,
}))

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
})

const col = createColumnHelper<typeof features, Product>()
const columns = col.columns([
  col.accessor('name', { header: 'Product', sortFn: 'alphanumeric' }),
  col.accessor('cat', { header: 'Category', sortFn: 'alphanumeric' }),
  col.accessor('price', { header: 'Price', sortFn: 'basic', enableGlobalFilter: false, cell: (info) => `$${info.getValue()}` }),
  col.accessor('stock', { header: 'Stock', sortFn: 'basic', enableGlobalFilter: false }),
])

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const
const ariaSort = (s: false | 'asc' | 'desc') => (s ? ARIA_SORT[s] : 'none')

const TableBox = el
  .config({ name: 'DemoTableBox' })
  // Top-aligned: a centred flex child taller than the box overflows upwards, out of scroll reach.
  .attrs({ block: true, contentAlignX: 'block', contentAlignY: 'top' })
  .theme(() => ({
    minWidth: 0,
    maxHeight: 420,
    overflow: 'auto',
    border: '1px solid',
    borderColor: paper.line,
    borderRadius: 12,
    backgroundColor: paper.field,
    extendCss: `
      & table { width: 100%; min-width: 440px; border-collapse: collapse; font: 13.5px ${font.system}; color: ${paper.text}; }
      & th { position: sticky; top: 0; z-index: 1; padding: 0; text-align: left; background: ${paper.bg}; border-bottom: 1px solid ${paper.line}; }
      & th button {
        display: flex; gap: 6px; align-items: center; width: 100%; padding: 11px 14px; border: 0; background: transparent;
        color: ${paper.mist}; font: 11px ${font.mono}; letter-spacing: .12em; text-transform: uppercase; cursor: pointer;
      }
      & th[aria-sort='ascending'] button, & th[aria-sort='descending'] button { color: ${paper.text}; }
      & th button:focus-visible, & td button:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: -2px; }
      & td { padding: 8px 14px; border-bottom: 1px solid ${paper.line}; white-space: nowrap; }
      & td.num { font-variant-numeric: tabular-nums; }
      & td.price { position: relative; padding: 0; }
      & td.price button {
        width: 100%; padding: 8px 14px; border: 0; background: transparent; color: ${paper.text};
        font: inherit; font-variant-numeric: tabular-nums; text-align: left; cursor: text;
      }
      & td.price input {
        position: absolute; top: 3px; left: 6px; width: calc(100% - 12px); height: calc(100% - 6px); box-sizing: border-box;
        padding: 0 8px; border: 1px solid ${paper.accent}; border-radius: 6px; background: ${paper.field}; color: ${paper.text}; font: inherit;
      }
      & td.price input:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 1px; }
      & tbody tr:last-child td { border-bottom: 0; }
    `,
  }))

/**
 * Table demo (`table.json` → demo): a real `@pyreon/table` (TanStack Table v9
 * on Pyreon signals). Sorting and the global filter are the table's own
 * state; rows and cells render through keyed `<For>` + `visibleCells` +
 * `flexRenderCell`. A price edit writes ONE new row object into the data
 * signal; the counters then show what that edit cost: cell accessors that
 * re-ran and the mutation records a MutationObserver on the tbody saw.
 */
export default function DemoTable() {
  const data = signal(PRODUCTS)
  const editing = signal<number | null>(null)
  const lastCells = signal<number | string>('–')
  const lastWrites = signal<number | string>('–')
  const status = signal('')

  // Plain counters: cell accessors bump `cellRuns`; the observer adds to `writes`.
  let cellRuns = 0
  let writes = 0
  let tbody: HTMLElement | undefined
  let observer: MutationObserver | undefined
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (fn: () => void) => {
    // pyreon-lint-disable-next-line pyreon/no-raw-setinterval
    const t = setTimeout(() => {
      timers.delete(t)
      fn()
    }, 0)
    timers.add(t)
  }

  const table = useTable(() => ({
    features,
    data: data(),
    columns,
    getRowId: (r: Product) => String(r.id),
    initialState: { sorting: [{ id: 'name', desc: false }] },
  }))

  onMount(() => {
    if (!tbody) return
    observer = new MutationObserver((records) => {
      writes += records.length
    })
    observer.observe(tbody, { subtree: true, childList: true, characterData: true })
  })
  onUnmount(() => {
    observer?.disconnect()
    for (const t of timers) clearTimeout(t)
    timers.clear()
  })

  const find = (id: number) => data.peek().find((p) => p.id === id)

  const commit = (id: number, raw: string) => {
    if (editing.peek() !== id) return
    editing.set(null)
    const row = find(id)
    const value = Math.round(Number.parseFloat(raw) * 100) / 100
    if (!row || Number.isNaN(value) || value < 0 || value === row.price) {
      status.set(row ? `${row.name}: price unchanged.` : '')
      return
    }
    // Let the editor's own DOM changes settle first, so the counters see only
    // what the data write did: one new row object, nothing else.
    later(() => {
      observer?.takeRecords()
      writes = 0
      const before = cellRuns
      data.set(data.peek().map((p) => (p.id === id ? { ...p, price: value } : p)))
      later(() => {
        writes += observer?.takeRecords().length ?? 0
        batch(() => {
          lastCells.set(cellRuns - before)
          lastWrites.set(writes)
          status.set(`${row.name}: price set to $${value}.`)
        })
      })
    })
  }

  /** Enter (`raw` = the input's value) or Escape (`raw` = null); focus goes back to the price. */
  const close = (e: Event, id: number, raw: string | null) => {
    const button = (e.target as HTMLElement).closest('td')?.querySelector('button')
    if (raw === null) {
      editing.set(null)
      status.set('Edit cancelled.')
    } else commit(id, raw)
    button?.focus()
  }

  return (
    <DemoGrid>
      <DemoSurface>
        <PaperLabel for="demo-table-filter">Filter products</PaperLabel>
        <PaperField>
          <input
            id="demo-table-filter"
            type="search"
            placeholder="Name or category"
            autoComplete="off"
            onInput={(e: Event) => table.setGlobalFilter((e.target as HTMLInputElement).value)}
          />
        </PaperField>
        <TableBox>
          <table aria-label="Products">
            <thead>
              <For each={() => table.getHeaderGroups()} by={(g) => g.id}>
                {(hg) => (
                  <tr>
                    <For each={() => hg.headers} by={(h) => h.id}>
                      {(header) => (
                        <th
                          scope="col"
                          aria-sort={ariaSort(header.column.getIsSorted())}
                        >
                          <button type="button" onClick={header.column.getToggleSortingHandler()}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <span aria-hidden="true">
                              {() => {
                                const s = header.column.getIsSorted()
                                return s === 'asc' ? '↑' : s === 'desc' ? '↓' : ''
                              }}
                            </span>
                          </button>
                        </th>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </thead>
            <tbody
              ref={(n: HTMLElement | null) => {
                tbody = n ?? undefined
              }}
            >
              <For each={() => table.getRowModel().rows} by={(r) => r.id}>
                {(row) => (
                  <tr>
                    <For each={() => visibleCells(table, row.id)} by={(c) => c.id}>
                      {(cell) => {
                        const text = () => {
                          cellRuns++
                          return flexRenderCell(table, row.id, cell.column.id)
                        }
                        if (cell.column.id !== 'price') {
                          return <td class={cell.column.id === 'stock' ? 'num' : undefined}>{text}</td>
                        }
                        const id = row.original.id
                        return (
                          <td class="price">
                            <button
                              type="button"
                              onDblClick={() => editing.set(id)}
                              onClick={(e: MouseEvent) => {
                                // Enter / Space fire a click with detail 0; a pointer needs a double-click.
                                if (e.detail === 0) editing.set(id)
                              }}
                            >
                              {text}
                            </button>
                            {() =>
                              editing() === id ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  aria-label={`New price for ${row.original.name}`}
                                  value={String(find(id)?.price ?? '')}
                                  ref={(n: HTMLInputElement | null) => {
                                    queueMicrotask(() => {
                                      n?.focus()
                                      n?.select()
                                    })
                                  }}
                                  onKeyDown={(e: KeyboardEvent) => {
                                    if (e.key === 'Enter') {
                                      // Without this the Enter's keypress lands on the price button
                                      // focused below and re-opens the editor.
                                      e.preventDefault()
                                      close(e, id, (e.target as HTMLInputElement).value)
                                    }
                                    if (e.key === 'Escape') close(e, id, null)
                                  }}
                                  onBlur={(e: FocusEvent) => commit(id, (e.target as HTMLInputElement).value)}
                                />
                              ) : null
                            }
                          </td>
                        )
                      }}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </TableBox>
        <PaperHint>Double-click a price, or focus it and press Enter, to edit. Enter saves, Escape cancels.</PaperHint>
        <PaperHint aria-live="polite">{() => status()}</PaperHint>
      </DemoSurface>
      <DemoPanel note="The two edit counters move on edits only. Sorting and filtering are table state: rows move and are re-read, which is a different cost.">
        <Meters
          label="What the last edit cost"
          items={[
            { label: 'rows shown', value: () => table.getRowModel().rows.length },
            { label: 'cells re-run by the last edit', value: () => lastCells() },
            { label: 'DOM writes by the last edit', value: () => lastWrites() },
          ]}
        />
      </DemoPanel>
    </DemoGrid>
  )
}
