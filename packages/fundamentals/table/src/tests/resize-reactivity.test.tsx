/**
 * Regression lock for the "column resize doesn't move the cells" report.
 *
 * The report blamed `@pyreon/reactivity` for suppressing a same-reference
 * computed notification. That is FALSE — these tests prove `useTable`'s
 * accessor re-notifies on a state change, and pin down the ACTUAL mechanism:
 * a keyed `<For>` reuses cell instances by key and does NOT re-run their render
 * callback, so a value bound as a STATIC prop freezes — while the same value
 * read inside a reactive closure updates. This is fundamental fine-grained
 * reactivity (identical to Solid's `<For>`), not a framework bug.
 *
 * Uses `h()` (not JSX) so the keyed-reconciliation behavior is exercised
 * faithfully — the package's vitest JSX transform is not the real compiler.
 */
import { For, h } from '@pyreon/core'
import { computed, effect } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { getCoreRowModel } from '@tanstack/table-core'
import { describe, expect, it } from 'vitest'
import { useTable } from '../use-table'

const flush = async () => {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

function makeTable() {
  return useTable(() => ({
    data: [{ name: 'Alice' }],
    columns: [{ accessorKey: 'name', id: 'name' }],
    getCoreRowModel: getCoreRowModel(),
  }))
}

describe('column-resize reactivity', () => {
  it('the table() accessor re-notifies subscribers on a size change (NOT suppressed)', () => {
    const table = makeTable()
    let runs = 0
    let size = 0
    effect(() => {
      runs++
      size = table().getColumn('name')!.getSize()
    })
    const runsAtMount = runs

    // Resize the way the TanStack handler commits — through setColumnSizing,
    // which routes onStateChange → the version bump useTable wires.
    table().setColumnSizing({ name: 330 })

    expect(runs).toBeGreaterThan(runsAtMount) // subscriber re-ran
    expect(size).toBe(330) // and observed the new size
  })

  it('a computed derived from table().getSize() re-evaluates on resize', () => {
    const table = makeTable()
    const width = computed(() => table().getColumn('name')!.getSize())
    const before = width()
    table().setColumnSizing({ name: 275 })
    expect(width()).toBe(275)
    expect(width()).not.toBe(before)
  })

  it('FREEZE: keyed <For> + a STATIC width prop does not update (the real bug)', async () => {
    const table = makeTable()
    const el = document.createElement('div')
    document.body.appendChild(el)
    // Width read once in the component body → captured at first mount. A keyed
    // <For> reuses the cell on resize (same key) and never re-runs this body.
    const Cell = (props: { width: number }) =>
      h('span', { class: 'cell', 'data-w': String(props.width) })
    mount(
      <div>
        <For each={() => table().getHeaderGroups()[0]!.headers} by={(hd) => hd.id}>
          {(hd) => h(Cell, { width: hd.column.getSize() })}
        </For>
      </div>,
      el,
    )
    const before = el.querySelector('.cell')?.getAttribute('data-w')
    table().setColumnSizing({ name: 330 })
    await flush()
    const after = el.querySelector('.cell')?.getAttribute('data-w')

    // Frozen — this is the reported symptom, and it's the binding, not reactivity.
    expect(before).toBe('150')
    expect(after).toBe('150')
    el.remove()
  })

  it('FIX: keyed <For> + width read in a REACTIVE closure updates on resize', async () => {
    const table = makeTable()
    const el = document.createElement('div')
    document.body.appendChild(el)
    // Read the size reactively at the point of use → re-subscribes on notify.
    const Cell = (props: { id: string }) =>
      h('span', {
        class: 'cell',
        'data-w': () => String(table().getColumn(props.id)!.getSize()),
      })
    mount(
      <div>
        <For each={() => table().getHeaderGroups()[0]!.headers} by={(hd) => hd.id}>
          {(hd) => h(Cell, { id: hd.column.id })}
        </For>
      </div>,
      el,
    )
    const before = el.querySelector('.cell')?.getAttribute('data-w')
    table().setColumnSizing({ name: 330 })
    await flush()
    const after = el.querySelector('.cell')?.getAttribute('data-w')

    expect(before).toBe('150')
    expect(after).toBe('330')
    el.remove()
  })
})
