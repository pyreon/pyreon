/**
 * Preact benchmark — same VDOM model as React, but no scheduler overhead.
 * The row tree is written as the automatic JSX runtime's output (`jsx` /
 * `jsxs` from `preact/jsx-runtime`) — byte-for-byte esbuild's
 * `jsx: 'automatic', jsxImportSource: 'preact'` emit for the idiomatic
 * component (see react.ts for the source it was diffed against).
 * Preact flushes batched hook updates via Promise microtask.
 */
import { h, render } from 'preact'
import type { ComponentType, Key, VNode } from 'preact'
import { jsx, jsxs } from 'preact/jsx-runtime'

// `preact/jsx-runtime`'s .d.ts types `jsx`'s key parameter as `string`, while
// Preact's own `Attributes.key` (what `<RowItem key={row.id}>` checks against)
// is `Key` = `string | number | any`, and the runtime stores it verbatim. The
// compiled JSX passes the NUMBER — so this re-types the key slot to match
// what the JSX source type-checks against, rather than stringifying the id.
const jsxKeyed = jsx as <P>(type: ComponentType<P>, props: P, key: Key) => VNode<P>
import { memo } from 'preact/compat'
import { useEffect, useState } from 'preact/hooks'
import type { BenchSuite, Row } from '../runner'
import { bench, buildRows, expectRows, expectRowsWithSelected, resetRng } from '../runner'

/** Preact batches hook updates on a microtask — wait exactly that, no rAF. */
function afterCommit(): Promise<void> {
  return Promise.resolve()
}

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

  useEffect(() => {
    onMounted({ setRows, setSelected })
  }, [onMounted])

  return jsx('table', {
    children: jsx('tbody', {
      children: rows.map((row) =>
        jsxKeyed(RowItem, { row, selected: row.id === selectedId }, row.id),
      ),
    }),
  })
}

export async function runPreact(container: HTMLElement): Promise<BenchSuite> {
  resetRng()
  const suite: BenchSuite = { framework: 'Preact', container, results: [] }

  let resolveSetters!: (s: Setters) => void
  const settersPromise = new Promise<Setters>((res) => {
    resolveSetters = res
  })

  render(h(App, { onMounted: resolveSetters }), container)
  const { setRows: preactSetRows, setSelected: preactSetSelected } = await settersPromise

  const setRows = async (rows: Row[]) => {
    preactSetRows(rows)
    await afterCommit()
  }
  const setSelected = async (id: number | null) => {
    preactSetSelected(id)
    await afterCommit()
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

  let originalLabels: string[] = currentRows.map((r) => r.label)
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
  originalLabels = currentRows.map((r) => r.label)

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
      const updated = [...currentRows]
      updated.splice(500, 1)
      currentRows = updated
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
      // trim back to exactly 10,000 rows (untimed) so each timed run
      // appends to the same 10k baseline, not a growing list
      reset: async () => {
        currentRows = currentRows.slice(0, 10_000)
        await setRows(currentRows)
      },
      verify: expectRows(11_000),
    },
  )

  await setRows([])
  render(null, container)

  return suite
}
