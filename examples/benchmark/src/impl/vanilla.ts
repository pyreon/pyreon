/**
 * Vanilla JS baseline — direct DOM manipulation, no framework.
 *
 * Uses targeted DOM updates for partial update, select, and swap —
 * the same approach a skilled developer would use without a framework.
 * Full rebuild is only used for create/replace/clear where it's necessary.
 */
import type { BenchSuite, NumericText, Row } from '../runner'
import {
  BATCH_K_CLEAR,
  BATCH_K_SELECT,
  bench,
  buildRows,
  expectRows,
  expectRowsWithSelected,
  resetRng,
  selectedProbe,
  tick,
} from '../runner'
import type { AppHandle } from '../startup/app-handle'

interface VanillaRefs {
  tbody: HTMLElement
  trElements: HTMLElement[]
  labelTds: HTMLElement[]
}

/**
 * Build the whole table into `container`, replacing its contents.
 *
 * Shared by `runVanilla`'s `renderAll` and `mountVanilla` so the ROW
 * CONSTRUCTION LOOP — the part with actual content — exists exactly once.
 * Both benches therefore measure the same hand-written DOM baseline, and a
 * future edit cannot improve one and leave the other behind.
 *
 * Deliberately returns a refs object rather than writing into closure
 * variables: this keeps the extraction to ONE call and ONE object allocation
 * per `renderAll` (which runs once per timed create/replace/clear run), NOT
 * per row. Against an ~8ms create-1k that is unmeasurable — and the
 * alternative shapes were worse. Passing a mutable refs object down and
 * reading `refs.rows[i]` inside the ops would have added a property load per
 * element access in the timed loops, and duplicating the loop would have put
 * the baseline's definition in two places.
 */
function buildTable(container: HTMLElement, rows: Row[]): VanillaRefs {
  container.innerHTML = ''
  const table = document.createElement('table')
  const tbody = document.createElement('tbody')
  const trElements: HTMLElement[] = new Array(rows.length)
  const labelTds: HTMLElement[] = new Array(rows.length)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Row
    const tr = document.createElement('tr')
    const td1 = document.createElement('td')
    const td2 = document.createElement('td')
    // raw number — see runner.ts "Row-id rendering rule"
    ;(td1 as unknown as NumericText).textContent = row.id
    td2.textContent = row.label
    tr.appendChild(td1)
    tr.appendChild(td2)
    tbody.appendChild(tr)
    trElements[i] = tr
    labelTds[i] = td2
  }

  table.appendChild(tbody)
  container.appendChild(table)
  return { tbody, trElements, labelTds }
}

/**
 * Mount the app — the model shared with the op bench (`runVanilla`) through
 * `buildTable`. See `src/startup/app-handle.ts` for why this seam exists.
 *
 * NOTE this is the one impl whose `run…` does NOT call its `mount…`. The
 * vanilla ops mutate five closure variables in place (`rows`, `trElements`,
 * `labelTds`, `selectedTr`, `tbody`), so routing them through a handle would
 * have meant reading them off an object INSIDE the timed loops. This is the
 * no-framework baseline every "cost vs Vanilla" percentage is measured
 * against, so it does not get extra indirection to serve a different bench.
 * The shared part is `buildTable`; what is not shared is only the bookkeeping
 * around it.
 */
export function mountVanilla(container: HTMLElement): AppHandle {
  let rows: Row[] = []
  let refs: VanillaRefs = buildTable(container, rows)

  return {
    unmount: () => {
      container.innerHTML = ''
    },
    create: async (n) => {
      rows = buildRows(n)
      refs = buildTable(container, rows)
    },
    // Targeted DOM write — the same path 'partial update (every 10th)' times.
    update: async () => {
      for (let i = 0; i < rows.length; i += 10) {
        const row = rows[i] as Row
        row.label = `${row.label} !!!`
        ;(refs.labelTds[i] as HTMLElement).textContent = row.label
      }
    },
    clear: async () => {
      rows = []
      refs = buildTable(container, rows)
    },
  }
}

export async function runVanilla(container: HTMLElement): Promise<BenchSuite> {
  resetRng()
  const suite: BenchSuite = { framework: 'Vanilla JS', container, results: [] }

  let rows: Row[] = []
  let trElements: HTMLElement[] = []
  let labelTds: HTMLElement[] = []
  let selectedTr: HTMLElement | null = null
  let tbody: HTMLElement | null = null

  function renderAll(newRows: Row[]) {
    rows = newRows
    const refs = buildTable(container, rows)
    tbody = refs.tbody
    trElements = refs.trElements
    labelTds = refs.labelTds
    selectedTr = null
  }

  await bench(
    'create 1,000 rows',
    suite,
    async () => {
      renderAll(buildRows(1_000))
    },
    { verify: expectRows(1_000) },
  )

  await bench(
    'replace all rows',
    suite,
    async () => {
      renderAll(buildRows(1_000))
    },
    { verify: expectRows(1_000) },
  )

  // Store original labels for reset
  let originalLabels: string[] = rows.map((r) => r.label)
  await bench(
    'partial update (every 10th)',
    suite,
    async () => {
      for (let i = 0; i < rows.length; i += 10) {
        const row = rows[i] as Row
        row.label = `${row.label} !!!`
        ;(labelTds[i] as HTMLElement).textContent = row.label
      }
    },
    {
      // Reset labels before each run
      reset: () => {
        for (let i = 0; i < rows.length; i += 10) {
          const orig = originalLabels[i]
          if (orig !== undefined) {
            ;(rows[i] as Row).label = orig
            ;(labelTds[i] as HTMLElement).textContent = orig
          }
        }
      },
      verify: expectRows(1_000),
    },
  )

  // Re-create clean rows for remaining tests
  renderAll(buildRows(1_000))
  originalLabels = rows.map((r) => r.label)
  await tick()

  await bench(
    'select row',
    suite,
    async () => {
      if (selectedTr) selectedTr.className = ''
      selectedTr = trElements[500] as HTMLElement
      selectedTr.className = 'selected'
    },
    {
      // deselect (untimed) so each timed run does a REAL selection,
      // not a no-op re-select of the already-selected row
      reset: () => {
        if (selectedTr) {
          selectedTr.className = ''
          selectedTr = null
        }
      },
      verify: expectRowsWithSelected(1_000, 1),
    },
  )

  // Clock-independent twin of 'select row'. One cycle = deselect + select.
  await bench(
    'select row (batch cycle)',
    suite,
    async () => {
      if (selectedTr) selectedTr.className = ''
      selectedTr = trElements[500] as HTMLElement
      selectedTr.className = 'selected'
    },
    {
      reset: () => {
        if (selectedTr) {
          selectedTr.className = ''
          selectedTr = null
        }
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
      if (rows.length < 999 || !tbody) return
      // Swap data
      const tmp = rows[1] as Row
      rows[1] = rows[998] as Row
      rows[998] = tmp
      // Swap element references
      const tmpTr = trElements[1] as HTMLElement
      trElements[1] = trElements[998] as HTMLElement
      trElements[998] = tmpTr
      const tmpTd = labelTds[1] as HTMLElement
      labelTds[1] = labelTds[998] as HTMLElement
      labelTds[998] = tmpTd
      // Move DOM nodes
      const ref2 = trElements[2] as HTMLElement
      tbody.insertBefore(trElements[1] as HTMLElement, ref2)
      const ref999 = (trElements[999] as HTMLElement | undefined) ?? null
      tbody.insertBefore(trElements[998] as HTMLElement, ref999)
    },
    { verify: expectRows(1_000) },
  )

  await bench(
    'remove row',
    suite,
    async () => {
      const tr = trElements[500] as HTMLElement
      tr.remove()
      rows.splice(500, 1)
      trElements.splice(500, 1)
      labelTds.splice(500, 1)
    },
    {
      // restore a full 1,000-row table (untimed) so each timed run removes
      // the row at index 500 from an identical 1,000-row list
      reset: () => {
        renderAll(buildRows(1_000))
      },
      verify: expectRows(999),
    },
  )

  await bench(
    'clear rows',
    suite,
    async () => {
      renderAll([])
    },
    {
      // repopulate 1000 rows (untimed) so each timed run clears a FULL list,
      // not an already-empty one (median was 0µs without this)
      reset: () => {
        renderAll(buildRows(1_000))
      },
      verify: expectRows(0),
    },
  )

  // Re-create for the big test
  renderAll(buildRows(1_000))
  await tick()

  await bench(
    'create 10,000 rows',
    suite,
    async () => {
      renderAll(buildRows(10_000))
    },
    { verify: expectRows(10_000) },
  )

  await bench(
    'append 1,000 to 10,000 rows',
    suite,
    async () => {
      if (!tbody) return
      const appended = buildRows(1_000)
      for (let i = 0; i < appended.length; i++) {
        const row = appended[i] as Row
        const tr = document.createElement('tr')
        const td1 = document.createElement('td')
        const td2 = document.createElement('td')
        // raw number — see runner.ts "Row-id rendering rule"
      ;(td1 as unknown as NumericText).textContent = row.id
        td2.textContent = row.label
        tr.appendChild(td1)
        tr.appendChild(td2)
        tbody.appendChild(tr)
        rows.push(row)
        trElements.push(tr)
        labelTds.push(td2)
      }
    },
    {
      // trim back to exactly 10,000 rows (untimed) so each timed run
      // appends to the same 10,000-row table, not an ever-growing one
      reset: () => {
        while (rows.length > 10_000) {
          rows.pop()
          labelTds.pop()
          const tr = trElements.pop()
          if (tr) tr.remove()
        }
      },
      verify: expectRows(11_000),
    },
  )

  // ── clear-rows batch instrument — DELIBERATELY LAST ──────────────────────
  // This block builds and destroys ~600k rows (K cycles x samples), which is
  // orders of magnitude more DOM churn than any ordinary op. Sited mid-suite it
  // CONTAMINATED the following `append` measurement: samples went bimodal
  // (~18ms vs ~55ms) and only the FREQUENCY of the fast mode differed, so the
  // median was decided by which mode won rather than by the op's cost —
  // Vanilla's append read 46ms against a true ~17ms. Bisected with the K
  // switches: the CLEAR batch causes it, the select batch does not, and a
  // forced JS `gc()` settle does NOT fix it (the backlog is Blink-side, not JS
  // heap). Running it last makes the contamination structurally impossible.
  // Do not move it back above another timed op.
  await bench(
    'clear rows (batch cycle)',
    suite,
    async () => {
      renderAll([])
    },
    {
      reset: () => {
        renderAll(buildRows(1_000))
      },
      batchK: BATCH_K_CLEAR,
      batchExpect: 0,
      batchPreExpect: 1_000,
    },
  )

  // Cleanup
  renderAll([])

  return suite
}
