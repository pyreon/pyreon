/**
 * SolidJS benchmark — fine-grained reactivity + compiled template cloning.
 *
 * Uses solid-js/web template() for row creation — this matches what Solid's
 * JSX compiler emits (cloneNode(true) from cached <template> elements).
 *
 * Each row gets a createSignal for its label so partial updates only touch
 * the changed text nodes — same model as Pyreon's per-row signal.
 *
 * Uses createSelector for O(1) selection — only 2 effects fire per
 * selection change, matching idiomatic Solid patterns.
 *
 * Solid renders synchronously, so await tick() is just a layout flush.
 */
import { createComponent, createEffect, createSelector, createSignal, For } from 'solid-js'
import { insert, render, template } from 'solid-js/web'
import type { BenchSuite } from '../runner'
import { bench, buildRowsWith, expectRows, expectRowsWithSelected, resetRng, tick } from '../runner'

type SolidRow = { id: number; label: () => string; setLabel: (s: string) => void }

function mkRows(n: number): SolidRow[] {
  return buildRowsWith<SolidRow>(n, (id, label) => {
    const [get, set] = createSignal(label)
    return { id, label: get, setLabel: set }
  })
}

// Pre-compiled template — same as what Solid's JSX compiler emits
const _tmpl$ = template('<tr><td></td><td></td></tr>')

export async function runSolid(container: HTMLElement): Promise<BenchSuite> {
  resetRng()
  const suite: BenchSuite = { framework: 'SolidJS', container, results: [] }

  const [rows, setRows] = createSignal<SolidRow[]>([])
  const [selectedId, setSelected] = createSignal<number | null>(null)

  // O(1) selection — only the deselected and newly selected rows re-run
  const isSelected = createSelector(selectedId)

  const dispose = render(() => {
    const table = document.createElement('table')
    const tbody = document.createElement('tbody')
    table.appendChild(tbody)

    insert(
      tbody,
      createComponent(
        For as unknown as (props: {
          each: SolidRow[]
          children: (row: SolidRow) => HTMLElement
        }) => HTMLElement[],
        {
          get each() {
            return rows()
          },
          children(row: SolidRow) {
            // Template-cloned row — matches Solid compiler output
            const el = _tmpl$() as HTMLElement
            const td1 = el.children[0] as HTMLElement
            const td2 = el.children[1] as HTMLElement
            td1.textContent = String(row.id)
            // Reactive label — only this row's td2 updates when label changes
            createEffect(() => {
              td2.textContent = row.label()
            })
            // O(1) selection via createSelector — only 2 effects fire per change
            createEffect(() => {
              el.className = isSelected(row.id) ? 'selected' : ''
            })
            return el
          },
        },
      ),
    )

    return table
  }, container)

  await bench(
    'create 1,000 rows',
    suite,
    async () => {
      setRows(mkRows(1_000))
      await tick()
    },
    { verify: expectRows(1_000) },
  )

  await bench(
    'replace all rows',
    suite,
    async () => {
      setRows(mkRows(1_000))
      await tick()
    },
    { verify: expectRows(1_000) },
  )

  // Store original labels for reset
  let originalLabels: string[] = []
  await bench(
    'partial update (every 10th)',
    suite,
    async () => {
      const cur = rows()
      for (let i = 0; i < cur.length; i += 10) {
        cur[i]?.setLabel(`${cur[i]?.label() ?? ''} !!!`)
      }
      await tick()
    },
    {
      // Reset labels before each run
      reset: () => {
        const cur = rows()
        for (let i = 0; i < cur.length; i += 10) {
          const orig = originalLabels[i]
          if (orig !== undefined) {
            cur[i]?.setLabel(orig)
          }
        }
      },
      verify: expectRows(1_000),
    },
  )

  // Re-create clean rows for remaining tests
  setRows(mkRows(1_000))
  originalLabels = rows().map((r) => r.label())
  await tick()

  await bench(
    'select row',
    suite,
    async () => {
      const r = rows()
      setSelected(r[Math.floor(r.length / 2)]?.id ?? null)
      await tick()
    },
    { verify: expectRowsWithSelected(1_000, 1) },
  )

  await bench(
    'swap rows',
    suite,
    async () => {
      const updated = [...rows()]
      if (updated.length >= 999) {
        const tmp = updated[1]
        const b = updated[998]
        if (tmp && b) {
          updated[1] = b
          updated[998] = tmp
        }
      }
      setRows(updated)
      await tick()
    },
    { verify: expectRows(1_000) },
  )

  await bench(
    'clear rows',
    suite,
    async () => {
      setRows([])
      await tick()
    },
    { verify: expectRows(0) },
  )

  setRows(mkRows(1_000))
  await tick()

  await bench(
    'create 10,000 rows',
    suite,
    async () => {
      setRows(mkRows(10_000))
      await tick()
    },
    { verify: expectRows(10_000) },
  )

  setRows([])
  dispose()

  return suite
}
