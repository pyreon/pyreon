/**
 * Preact benchmark — same VDOM model as React, but no scheduler overhead.
 * Uses h() directly (no JSX needed) like the React impl uses createElement.
 * Preact flushes batched hook updates via Promise microtask.
 */
import { h, render } from "preact"
import { memo } from "preact/compat"
import { useEffect, useState } from "preact/hooks"
import type { BenchSuite, Row } from "../runner"
import { bench, buildRows } from "../runner"

/** Wait for Preact's async batch flush (microtask + one macro turn) */
function afterCommit(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
}

interface Setters {
  setRows: (rows: Row[]) => void
  setSelected: (id: number | null) => void
}

const RowItem = memo(function RowItem({
  row,
  selected,
}: {
  row: Row
  selected: boolean
}) {
  return h(
    "tr",
    { className: selected ? "selected" : undefined },
    h("td", null, row.id),
    h("td", null, row.label),
  )
})

function App({ onMounted }: { onMounted: (setters: Setters) => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [selectedId, setSelected] = useState<number | null>(null)

  useEffect(() => {
    onMounted({ setRows, setSelected })
  }, [])

  return h(
    "table",
    null,
    h(
      "tbody",
      null,
      ...rows.map((row) => h(RowItem, { key: row.id, row, selected: row.id === selectedId })),
    ),
  )
}

export async function runPreact(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: "Preact", container, results: [] }

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

  await bench("create 1,000 rows", suite, async () => {
    currentRows = buildRows(1_000)
    await setRows(currentRows)
  })

  await bench("replace all rows", suite, async () => {
    currentRows = buildRows(1_000)
    await setRows(currentRows)
  })

  let originalLabels: string[] = currentRows.map((r) => r.label)
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
  originalLabels = currentRows.map((r) => r.label)

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
  render(null, container)

  return suite
}
