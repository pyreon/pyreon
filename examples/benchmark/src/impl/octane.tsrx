/**
 * Octane benchmark — idiomatic TSRX (compiled React programming model).
 *
 * Octane is "React's programming model, compiled": `useState` + re-render
 * semantics authored in `.tsrx`, lowered by its compiler to direct DOM
 * mutations with no virtual DOM. So this impl is a deliberate line-for-line
 * port of `react.ts` — same ops, same reset hooks, same commit discipline —
 * with only the two things Octane does differently:
 *
 *   - the keyed list is the compiler's `@for (… ; key …)` block rather than
 *     `rows.map()` + a `key` prop;
 *   - no `memo()` wrapper on the row. React needs `memo` or selecting one row
 *     re-renders all 1,000; Octane compiles the row to fine-grained updates,
 *     so a manual memo is not the idiomatic thing a user would write. This is
 *     Octane's model working as designed, not a handicap applied to React.
 *
 * Setters are published out through `useEffect` (fires post-commit) via a
 * Promise, exactly as `react.ts` does — the value is unknown at bundle time so
 * Rollup cannot dead-code-eliminate the calls. Commit is forced with
 * `flushSync` so the timer measures reconcile+commit CPU rather than scheduler
 * latency, matching the React entry.
 */
import { createRoot, flushSync, useEffect, useState } from 'octane'
import type { BenchSuite, Row } from '../runner'
import {
  BATCH_K_CLEAR,
  BATCH_K_SELECT,
  bench,
  buildRows,
  expectRows,
  expectRowsWithSelected,
  resetRng,
  selectedProbe,
} from '../runner'

interface Setters {
  setRows: (rows: Row[]) => void
  setSelected: (id: number | null) => void
}

export function App(props: { onMounted: (setters: Setters) => void }) @{
  const [rows, setRows] = useState<Row[]>([])
  const [selectedId, setSelected] = useState<number | null>(null)

  useEffect(() => {
    props.onMounted({ setRows, setSelected })
  }, [])

  <table>
    <tbody>
      @for (const row of rows; key row.id) {
        <tr class={row.id === selectedId ? 'selected' : ''}>
          <td>{String(row.id)}</td>
          <td>{row.label}</td>
        </tr>
      }
    </tbody>
  </table>
}

export async function runOctane(container: HTMLElement): Promise<BenchSuite> {
  resetRng()
  const suite: BenchSuite = { framework: 'Octane', container, results: [] }
  const root = createRoot(container)

  let resolveSetters!: (setters: Setters) => void
  const settersPromise = new Promise<Setters>((res) => {
    resolveSetters = res
  })

  root.render(App, { onMounted: resolveSetters })
  const { setRows: octaneSetRows, setSelected: octaneSetSelected } = await settersPromise

  const setRows = async (rows: Row[]) => {
    flushSync(() => octaneSetRows(rows))
  }

  const setSelected = async (id: number | null) => {
    flushSync(() => octaneSetSelected(id))
  }

  let currentRows: Row[] = []

  await bench(
    'create 1,000 rows',
    suite,
    async () => {
      currentRows = buildRows(1_000)
      await setRows(currentRows)
    },
    { verify: expectRows(1_000) },
  )

  await bench(
    'replace all rows',
    suite,
    async () => {
      currentRows = buildRows(1_000)
      await setRows(currentRows)
    },
    { verify: expectRows(1_000) },
  )

  let originalLabels: string[] = currentRows.map((row) => row.label)
  await bench(
    'partial update (every 10th)',
    suite,
    async () => {
      const updated = [...currentRows]
      for (let i = 0; i < updated.length; i += 10) {
        const row = updated[i]
        if (row) updated[i] = { ...row, label: `${row.label} !!!` }
      }
      currentRows = updated
      await setRows(currentRows)
    },
    {
      reset: async () => {
        currentRows = currentRows.map((row, i) => {
          const orig = originalLabels[i]
          return orig !== undefined ? { ...row, label: orig } : row
        })
        await setRows(currentRows)
      },
      verify: expectRows(1_000),
    },
  )

  currentRows = buildRows(1_000)
  await setRows(currentRows)
  originalLabels = currentRows.map((row) => row.label)

  await bench(
    'select row',
    suite,
    async () => {
      await setSelected(currentRows[Math.floor(currentRows.length / 2)]?.id ?? null)
    },
    {
      reset: async () => {
        await setSelected(null)
      },
      verify: expectRowsWithSelected(1_000, 1),
    },
  )

  // Clock-independent twin of 'select row'. One cycle = deselect + select.
  await bench(
    'select row (batch cycle)',
    suite,
    async () => {
      await setSelected(currentRows[Math.floor(currentRows.length / 2)]?.id ?? null)
    },
    {
      reset: async () => {
        await setSelected(null)
      },
      batchK: BATCH_K_SELECT,
      batchProbe: selectedProbe(500),
      batchExpect: 1,
      batchPreExpect: 0,
    },
  )

  await bench(
    'swap rows',
    suite,
    async () => {
      const updated = [...currentRows]
      if (updated.length >= 999) {
        const tmp = updated[1]
        const b = updated[998]
        if (tmp && b) {
          updated[1] = b
          updated[998] = tmp
        }
      }
      currentRows = updated
      await setRows(currentRows)
    },
    { verify: expectRows(1_000) },
  )

  await bench(
    'remove row',
    suite,
    async () => {
      currentRows = currentRows.filter((_, i) => i !== 500)
      await setRows(currentRows)
    },
    {
      reset: async () => {
        currentRows = buildRows(1_000)
        await setRows(currentRows)
      },
      verify: expectRows(999),
    },
  )

  await bench(
    'clear rows',
    suite,
    async () => {
      currentRows = []
      await setRows([])
    },
    {
      reset: async () => {
        await setRows(buildRows(1_000))
      },
      verify: expectRows(0),
    },
  )

  // Clock-independent twin of 'clear rows'. Cycle = build-1000 + clear-1000.
  await bench(
    'clear rows (batch cycle)',
    suite,
    async () => {
      currentRows = []
      await setRows([])
    },
    {
      reset: async () => {
        await setRows(buildRows(1_000))
      },
      batchK: BATCH_K_CLEAR,
      batchExpect: 0,
      batchPreExpect: 1_000,
    },
  )

  currentRows = buildRows(1_000)
  await setRows(currentRows)

  await bench(
    'create 10,000 rows',
    suite,
    async () => {
      currentRows = buildRows(10_000)
      await setRows(currentRows)
    },
    { verify: expectRows(10_000) },
  )

  await bench(
    'append 1,000 to 10,000 rows',
    suite,
    async () => {
      currentRows = [...currentRows, ...buildRows(1_000)]
      await setRows(currentRows)
    },
    {
      reset: async () => {
        currentRows = currentRows.slice(0, 10_000)
        await setRows(currentRows)
      },
      verify: expectRows(11_000),
    },
  )

  await setRows([])
  root.unmount()

  return suite
}
