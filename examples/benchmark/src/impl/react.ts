/**
 * React 19 benchmark — createElement (no JSX, no extra transform needed).
 * Uses useState + re-render model.
 *
 * Setters are captured via a mounted Promise so Rollup's dead-code elimination
 * cannot see them as always-null. Timing uses rAF → setTimeout(0) to wait for
 * React's DefaultLane commit before stopping the clock.
 */
import * as React from "react"
import * as ReactDOM from "react-dom/client"
import type { BenchSuite, Row } from "../runner"
import { bench, buildRows } from "../runner"

const { createElement: r, useState, useCallback, useEffect, memo } = React

/** Wait for React's DefaultLane commit: MessageChannel fires before rAF fires */
function afterCommit(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
}

interface Setters {
  setRows: (rows: Row[]) => void
  setSelected: (id: number | null) => void
}

const RowItem = memo(function RowItemInner({
  row,
  selected,
  onSelect,
}: {
  row: Row
  selected: boolean
  onSelect: (id: number) => void
}) {
  return r(
    "tr",
    { className: selected ? "selected" : undefined },
    r("td", null, row.id),
    r("td", null, row.label),
    r("td", null, r("button", { onClick: () => onSelect(row.id) }, "×")),
  )
})

function App({ onMounted }: { onMounted: (setters: Setters) => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [selectedId, setSelected] = useState<number | null>(null)

  const onSelect = useCallback((id: number) => setSelected(id), [])

  // useEffect fires after React commits — pass setters out so the caller knows React is ready
  useEffect(() => {
    onMounted({ setRows, setSelected })
  }, [])

  return r(
    "table",
    null,
    r(
      "tbody",
      null,
      ...rows.map((row) =>
        r(RowItem, { key: row.id, row, selected: row.id === selectedId, onSelect }),
      ),
    ),
  )
}

export async function runReact(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: "React 19", container, results: [] }
  const root = ReactDOM.createRoot(container)

  // Capture setters via Promise — value is unknown at bundle time, so Rollup cannot
  // dead-code-eliminate the calls to setRows/setSelected below.
  let resolveSetters!: (setters: Setters) => void
  const settersPromise = new Promise<Setters>((res) => {
    resolveSetters = res
  })

  root.render(r(App, { onMounted: resolveSetters }))
  const { setRows: reactSetRows, setSelected: reactSetSelected } = await settersPromise

  const setRows = async (rows: Row[]) => {
    reactSetRows(rows)
    await afterCommit()
  }

  const setSelected = async (id: number | null) => {
    reactSetSelected(id)
    await afterCommit()
  }

  let currentRows: Row[] = []

  await bench("create 1,000 rows", suite, async () => {
    currentRows = buildRows(1_000)
    await setRows(currentRows)
  })

  await bench("replace all rows", suite, async () => {
    currentRows = buildRows(1_000)
    await setRows(currentRows)
  })

  let originalLabels: string[] = currentRows.map((row) => row.label)
  await bench(
    "partial update (every 10th)",
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
    // Reset labels before each run
    async () => {
      currentRows = currentRows.map((row, i) => {
        const orig = originalLabels[i]
        return orig !== undefined ? { ...row, label: orig } : row
      })
      await setRows(currentRows)
    },
  )

  // Re-create clean rows for remaining tests
  currentRows = buildRows(1_000)
  await setRows(currentRows)
  originalLabels = currentRows.map((row) => row.label)

  await bench("select row", suite, async () => {
    await setSelected(currentRows[Math.floor(currentRows.length / 2)]?.id ?? null)
  })

  await bench("swap rows", suite, async () => {
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
  })

  await bench("clear rows", suite, async () => {
    currentRows = []
    await setRows([])
  })

  currentRows = buildRows(1_000)
  await setRows(currentRows)

  await bench("create 10,000 rows", suite, async () => {
    currentRows = buildRows(10_000)
    await setRows(currentRows)
  })

  await setRows([])
  root.unmount()

  return suite
}
