/**
 * SolidJS 2.0 (release candidate) — the row board on Solid's next major.
 *
 * Same ops, data model and markup as `solid.ts` (a per-row label signal, keyed
 * `<For>`, an O(1) keyed selection), on Solid 2.0's own compiler and runtime:
 *
 *  - The component is IDIOMATIC Solid 2 JSX compiled at BUILD time by
 *    `babel-preset-solid@2.0.0-rc` (`vite.config.ts`, `virtual:solid2-rows`),
 *    not hand-written emit, so it is exactly what a Solid 2 app ships.
 *  - Selection uses `createProjection`, Solid 2's replacement for the removed
 *    `createSelector`: a draft store whose two changed keys notify only the
 *    two affected rows.
 *  - Solid 2 batches writes until `flush()`. Each op flushes ONCE, as an app
 *    committing a user action would (the stable arm needed no flush: Solid 1
 *    applies writes synchronously).
 *
 * Solid 2 is installed under the `solid-js-rc` alias next to the stable 1.9
 * the `SolidJS` arm uses; the build plugin resolves every `solid-js` import
 * from `@solidjs/web` and from this arm to that one copy, so the renderer and
 * the arm share a single reactive graph.
 */
import { createSignal, flush } from 'solid-js-rc'
import { render } from '@solidjs/web'
import { Rows } from 'virtual:solid2-rows'
import type { BenchSuite } from '../runner'
import {
  BATCH_K_CLEAR,
  BATCH_K_SELECT,
  bench,
  buildRowsWith,
  expectRows,
  expectRowsWithSelected,
  resetRng,
  selectedProbe,
  tick,
} from '../runner'
type SolidRow = { id: number; label: () => string; setLabel: (s: string) => void }

function mkRows(n: number): SolidRow[] {
  return buildRowsWith<SolidRow>(n, (id, label) => {
    const [get, set] = createSignal(label)
    return { id, label: get, setLabel: set }
  })
}


export async function runSolid2(container: HTMLElement): Promise<BenchSuite> {
  resetRng()
  const suite: BenchSuite = { framework: 'SolidJS 2.0 (RC)', container, results: [] }

  const [rows, writeRows] = createSignal<SolidRow[]>([])
  const [selectedId, writeSelected] = createSignal<number | null>(null)
  // One flush per op: Solid 2 batches writes until flush().
  const setRows = (v: SolidRow[]) => {
    writeRows(v)
    flush()
  }
  const setSelected = (v: number | null) => {
    writeSelected(v)
    flush()
  }

  const dispose = render(() => Rows({ rows, selectedId }), container)

  await bench(
    'create 1,000 rows',
    suite,
    async () => {
      setRows(mkRows(1_000))
    },
    { verify: expectRows(1_000) },
  )

  await bench(
    'replace all rows',
    suite,
    async () => {
      setRows(mkRows(1_000))
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
      flush()
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
        flush()
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
    },
    {
      // deselect (untimed) so each timed run does a REAL selection,
      // not a no-op re-select of the already-selected row
      reset: () => {
        setSelected(null)
      },
      verify: expectRowsWithSelected(1_000, 1),
    },
  )

  // Clock-independent twin of 'select row'. One cycle = deselect + select.
  await bench(
    'select row (batch cycle)',
    suite,
    async () => {
      const r = rows()
      setSelected(r[Math.floor(r.length / 2)]?.id ?? null)
    },
    {
      reset: () => {
        setSelected(null)
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
    },
    { verify: expectRows(1_000) },
  )

  await bench(
    'remove row',
    suite,
    async () => {
      // Targeted removal — clone + splice, same setter pattern as swap rows.
      // Solid's keyed <For> unmounts only the removed row's DOM node.
      const updated = [...rows()]
      updated.splice(500, 1)
      setRows(updated)
    },
    {
      // restore a full 1,000-row table (untimed) so each timed run removes
      // from the same 1,000-row state
      reset: () => {
        setRows(mkRows(1_000))
      },
      verify: expectRows(999),
    },
  )

  await bench(
    'clear rows',
    suite,
    async () => {
      setRows([])
    },
    {
      // repopulate 1000 rows (untimed) so each timed run clears a FULL list,
      // not an already-empty one (median was 0µs without this)
      reset: () => {
        setRows(mkRows(1_000))
      },
      verify: expectRows(0),
    },
  )

  setRows(mkRows(1_000))
  await tick()

  await bench(
    'create 10,000 rows',
    suite,
    async () => {
      setRows(mkRows(10_000))
    },
    { verify: expectRows(10_000) },
  )

  await bench(
    'append 1,000 to 10,000 rows',
    suite,
    async () => {
      // Idiomatic append — spread-concat the existing rows with 1,000 new
      // ones; Solid's keyed <For> mounts only the appended rows.
      setRows([...rows(), ...mkRows(1_000)])
    },
    {
      // trim back to exactly 10,000 rows (untimed) so each timed run appends
      // to the same 10,000-row state
      reset: () => {
        setRows(rows().slice(0, 10_000))
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
      setRows([])
    },
    {
      reset: () => {
        setRows(mkRows(1_000))
      },
      batchK: BATCH_K_CLEAR,
      batchExpect: 0,
      batchPreExpect: 1_000,
    },
  )

  setRows([])
  dispose()

  return suite
}
