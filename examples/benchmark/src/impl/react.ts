/**
 * React 19 benchmark — useState + re-render model.
 *
 * The row tree is written as the automatic JSX runtime's output (`jsx` /
 * `jsxs` from `react/jsx-runtime`), i.e. exactly what a React app compiled
 * with its own toolchain ships — diffed against esbuild's `jsx: 'automatic'`
 * emit for the idiomatic component:
 *
 *   <tr className={selected ? 'selected' : undefined}><td>{row.id}</td><td>{row.label}</td></tr>
 *   <table><tbody>{rows.map((row) => <RowItem key={row.id} … />)}</tbody></table>
 *
 * (key as `jsx`'s 3rd argument, the mapped array as ONE `children` value — not
 * `createElement` varargs, which a JSX app never produces.)
 *
 * Setters are captured via a mounted Promise so Rollup's dead-code elimination
 * cannot see them as always-null. Timing wraps each update in `flushSync`, so
 * React commits synchronously and the clock measures reconcile + commit, not
 * scheduler latency.
 */
import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import { flushSync } from 'react-dom'
import { jsx, jsxs } from 'react/jsx-runtime'
import type { BenchSuite, Row } from '../runner'
import { bench, buildRows, expectRows, expectRowsWithSelected, resetRng } from '../runner'

const { createElement: r, useState, useEffect, memo } = React

interface Setters {
  setRows: (rows: Row[]) => void
  setSelected: (id: number | null) => void
}

const RowItem = memo(function RowItemInner({ row, selected }: { row: Row; selected: boolean }) {
  return jsxs('tr', {
    className: selected ? 'selected' : undefined,
    children: [jsx('td', { children: row.id }), jsx('td', { children: row.label })],
  })
})

function App({ onMounted }: { onMounted: (setters: Setters) => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [selectedId, setSelected] = useState<number | null>(null)

  // useEffect fires after React commits — pass setters out so the caller knows React is ready
  useEffect(() => {
    onMounted({ setRows, setSelected })
  }, [])

  return jsx('table', {
    children: jsx('tbody', {
      children: rows.map((row) => jsx(RowItem, { row, selected: row.id === selectedId }, row.id)),
    }),
  })
}

export async function runReact(container: HTMLElement): Promise<BenchSuite> {
  resetRng()
  const suite: BenchSuite = { framework: 'React 19', container, results: [] }
  const root = ReactDOM.createRoot(container)

  // Capture setters via Promise — value is unknown at bundle time, so Rollup cannot
  // dead-code-eliminate the calls to setRows/setSelected below.
  let resolveSetters!: (setters: Setters) => void
  const settersPromise = new Promise<Setters>((res) => {
    resolveSetters = res
  })

  root.render(r(App, { onMounted: resolveSetters }))
  const { setRows: reactSetRows, setSelected: reactSetSelected } = await settersPromise

  // flushSync forces React's commit SYNCHRONOUSLY — isolates reconcile+commit
  // CPU from scheduler latency (no rAF / MessageChannel wait).
  const setRows = async (rows: Row[]) => {
    flushSync(() => reactSetRows(rows))
  }

  const setSelected = async (id: number | null) => {
    flushSync(() => reactSetSelected(id))
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
      // Reset labels before each run
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

  // Re-create clean rows for remaining tests
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
      // deselect (untimed) so each timed run does a REAL selection,
      // not a no-op re-select of the already-selected row
      reset: async () => {
        await setSelected(null)
      },
      verify: expectRowsWithSelected(1_000, 1),
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
      // restore a full 1,000-row table (untimed) so each timed run removes
      // a row from a complete list, not an already-shrunk one
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
      // repopulate 1000 rows (untimed) so each timed run clears a FULL list,
      // not an already-empty one (median was 0µs without this)
      reset: async () => {
        await setRows(buildRows(1_000))
      },
      verify: expectRows(0),
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
      // restore the table to exactly 10,000 rows (untimed) so each timed
      // run appends to the same-size base list
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
