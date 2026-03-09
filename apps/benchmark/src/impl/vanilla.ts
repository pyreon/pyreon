/**
 * Vanilla JS baseline — direct DOM manipulation, no framework.
 * This is the theoretical upper bound for raw DOM speed.
 */
import type { BenchSuite, Row } from "../runner"
import { bench, buildRows, tick } from "../runner"

export async function runVanilla(container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: "Vanilla JS", container, results: [] }

  let rows: Row[] = []
  let selectedId: number | null = null

  function render() {
    container.innerHTML = ""
    const table = document.createElement("table")
    for (const row of rows) {
      const tr = document.createElement("tr")
      if (row.id === selectedId) tr.className = "selected"
      tr.innerHTML = `<td>${row.id}</td><td>${row.label}</td>`
      table.appendChild(tr)
    }
    container.appendChild(table)
  }

  await bench("create 1,000 rows", suite, async () => {
    rows = buildRows(1_000)
    render()
  })

  await bench("replace all rows", suite, async () => {
    rows = buildRows(1_000)
    render()
  })

  await bench("partial update (every 10th)", suite, async () => {
    for (let i = 0; i < rows.length; i += 10) {
      rows[i] = { ...rows[i]!, label: rows[i]!.label + " !!!" }
    }
    render()
  })

  await bench("select row", suite, async () => {
    selectedId = rows[Math.floor(rows.length / 2)]?.id ?? null
    render()
  })

  await bench("swap rows", suite, async () => {
    if (rows.length >= 999) {
      const tmp = rows[1]!
      rows[1] = rows[998]!
      rows[998] = tmp
    }
    render()
  })

  await bench("clear rows", suite, async () => {
    rows = []
    render()
  })

  // Re-create for the big test
  rows = buildRows(1_000)
  render()
  await tick()

  await bench("create 10,000 rows", suite, async () => {
    rows = buildRows(10_000)
    render()
  })

  // Cleanup
  rows = []
  render()

  return suite
}
