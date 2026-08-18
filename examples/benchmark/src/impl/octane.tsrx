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
 *   - no `memo()` wrapper on the row. VERIFIED, not assumed: `memo` is real in
 *     Octane and does bail a child body inside `@for`, but here it is 3.8x
 *     SLOWER (~97µs vs ~25µs per selection) — the per-row props-object
 *     allocation plus `shallowEqualProps` costs more than the child body it
 *     skips, because the item body still runs for every row regardless. So
 *     omitting it is Octane's model working as designed, not a handicap
 *     applied to React.
 *
 * The id cell is `{row.id}`, NOT `{String(row.id)}` — the shape `react.ts` uses,
 * and load-bearing. Octane classifies a `@for` body as DEP-PURE only when it
 * contains no render-time call; a `String(...)` there drops the emitted
 * `forBlock` flags from 30 to 26, clearing bit 2 (`depEligible`) and sending
 * every surviving row through the full `renderBlock` path instead of the
 * lighter direct item-body call. That one wrapper cost ~2.9x on select and also
 * taxed three other ops (real Chromium, `bench-fair --frameworks Octane`, same
 * machine, before -> after: select 100µs -> under the 100µs clamp; swap 1.10ms
 * -> 700µs; partial update 900µs -> 700µs; replace 10.50ms -> 9.50ms; create/
 * remove/clear/create-10k/append unchanged within noise). The rendered DOM is
 * byte-identical either way. If you touch this cell, re-read the emitted flags
 * before trusting any ratio: `compile(src, f, { mode: 'client' })` from
 * `octane/compiler`.
 *
 * Per-selection µs above are median-of-3 at 1,000 rows on an UNCLAMPED clock
 * (node + happy-dom), used because the corrected value falls under Chromium's
 * 100µs `performance.now()` clamp; the browser figures are from bench-fair.
 *
 * Selection is O(n) in Octane by architecture, and that is the honest framing
 * for any published multiplier: a `useState` write dirties the whole component,
 * so every item body re-evaluates (DOM writes stay minimal — 2 — via per-binding
 * `_prev` diffs). Cost is linear at ~0.024µs/row in the shape below (3.5µs at
 * 100 rows, 22µs at 1,000, 243µs at 10,000 — it was ~0.09µs/row before the
 * `String(...)` removal above), so a ratio against an O(1) selector is a
 * function of LIST LENGTH, not a fixed property of either framework — quote the
 * row count with any such multiplier. Octane ships no `createSelector` equivalent (its
 * public API is React's, and its `useState` third tuple member is a
 * transition-rebase getter, not a subscription — verified: reading it still
 * re-runs all 1,000 bodies). The only O(1) route is `useSyncExternalStore` plus
 * a hand-written keyed store (~5.8µs here), a generic React-model escape hatch
 * that `react.ts` and `preact.ts` do not use either — so declining it is
 * uniform, not a handicap.
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
          <td>{row.id}</td>
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

  await setRows([])
  root.unmount()

  return suite
}
