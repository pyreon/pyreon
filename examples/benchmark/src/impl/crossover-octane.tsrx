/**
 * CROSSOVER arm — Octane. See `crossover-shared.ts` for why this suite exists.
 *
 * The component is a LINE-FOR-LINE copy of `octane.tsrx`'s, and every line of
 * it is load-bearing in a way that is easy to break by accident:
 *
 *   - the id cell is `{row.id}`, NOT `{String(row.id)}`. Octane classifies a
 *     `@for` body as DEP-PURE only when it contains no render-time call; a
 *     `String(...)` there clears the `depEligible` flag and sends every row
 *     through the heavier `renderBlock` path, which cost ~2.9× on select. See
 *     the header of `octane.tsrx` for the emitted-flag evidence.
 *   - no `memo()` on the row. Not a handicap: `octane.tsrx` records that memo
 *     is real in Octane and measured 3.8× SLOWER here, because the props-object
 *     allocation plus `shallowEqualProps` costs more than the child body it
 *     skips — the item body still runs for every row regardless.
 *   - `flushSync` so the timer measures reconcile+commit CPU rather than
 *     scheduler latency, matching the React entry.
 *
 * If this arm drifted from the published one, the sweep would be measuring a
 * strawman rather than Octane. The whole point of the exercise is to find out
 * whether Octane's own documented O(n) selection actually shows up as a slope,
 * so the arm has to be Octane at its best.
 */
import { createRoot, flushSync, useEffect, useState } from 'octane'
import type { BenchSuite, Row } from '../runner'
import { bench, buildRows, expectRows, expectRowsWithSelected, resetRng, tick } from '../runner'
import {
  calibrateK,
  crossoverRows,
  crossoverTargetMs,
  idAt,
  labelSuffixAt,
  midIndex,
  publishMeta,
  selectedAt,
} from './crossover-shared'

interface Setters {
  setRows: (rows: Row[]) => void
  setSelected: (id: number | null) => void
}

const SUFFIX = ' !!!'

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

export async function runCrossoverOctane(container: HTMLElement): Promise<BenchSuite> {
  resetRng()
  const N = crossoverRows()
  const targetMs = crossoverTargetMs()
  const suite: BenchSuite = { framework: 'Octane', container, results: [] }
  const k: Record<string, number> = {}

  const root = createRoot(container)

  let resolveSetters!: (setters: Setters) => void
  const settersPromise = new Promise<Setters>((res) => {
    resolveSetters = res
  })

  root.render(App, { onMounted: resolveSetters })
  const { setRows: octaneSetRows, setSelected: octaneSetSelected } = await settersPromise

  const setRows = (rows: Row[]) => {
    flushSync(() => octaneSetRows(rows))
  }
  const setSelected = (id: number | null) => {
    flushSync(() => octaneSetSelected(id))
  }

  let currentRows: Row[] = buildRows(N)
  setRows(currentRows)
  await tick()

  const mid = midIndex(N)
  const midId = currentRows[mid]?.id ?? null
  const originalLabels = currentRows.map((r) => r.label)

  // ── select row ────────────────────────────────────────────────────────────
  const selectFn = () => {
    setSelected(midId)
  }
  const selectReset = () => {
    setSelected(null)
  }

  await bench('select row', suite, selectFn, {
    reset: selectReset,
    verify: expectRowsWithSelected(N, 1),
  })

  k.select = await calibrateK(async () => {
    selectReset()
    selectFn()
    container.getBoundingClientRect()
  }, targetMs)

  await bench('select row (batch cycle)', suite, selectFn, {
    reset: selectReset,
    batchK: k.select,
    batchProbe: selectedAt(mid),
    batchExpect: 1,
    batchPreExpect: 0,
  })

  selectReset()
  await tick()

  // ── partial update (every 10th) ───────────────────────────────────────────
  // Same shape as the published op: a fresh array with fresh row objects for
  // the touched indices, which is what the React programming model requires.
  const partialFn = () => {
    const updated = [...currentRows]
    for (let i = 0; i < updated.length; i += 10) {
      const row = updated[i]
      if (row) updated[i] = { ...row, label: `${row.label}${SUFFIX}` }
    }
    currentRows = updated
    setRows(currentRows)
  }
  const partialReset = () => {
    currentRows = currentRows.map((row, i) => {
      const orig = originalLabels[i]
      return orig !== undefined ? { ...row, label: orig } : row
    })
    setRows(currentRows)
  }

  await bench('partial update (every 10th)', suite, partialFn, {
    reset: partialReset,
    verify: expectRows(N),
  })

  k.partial = await calibrateK(async () => {
    partialReset()
    partialFn()
    container.getBoundingClientRect()
  }, targetMs)

  await bench('partial update (every 10th) (batch cycle)', suite, partialFn, {
    reset: partialReset,
    batchK: k.partial,
    batchProbe: labelSuffixAt(0, SUFFIX),
    batchExpect: 1,
    batchPreExpect: 0,
  })

  partialReset()
  await tick()

  // ── swap rows (control) ───────────────────────────────────────────────────
  const lo = 1
  const hi = Math.max(1, N - 2)
  const swap = () => {
    const updated = [...currentRows]
    const a = updated[lo]
    const b = updated[hi]
    if (a && b) {
      updated[lo] = b
      updated[hi] = a
      currentRows = updated
      setRows(currentRows)
    }
  }
  const canonicalIdAtLo = currentRows[lo]?.id ?? -1

  await bench('swap rows', suite, swap, { verify: expectRows(N) })

  if (currentRows[lo]?.id !== canonicalIdAtLo) swap()
  await tick()

  k.swap = await calibrateK(async () => {
    swap()
    swap()
    container.getBoundingClientRect()
  }, targetMs)
  if (currentRows[lo]?.id !== canonicalIdAtLo) swap()

  await bench('swap rows (batch cycle)', suite, swap, {
    reset: swap,
    batchK: k.swap,
    batchProbe: idAt(lo, canonicalIdAtLo),
    batchExpect: 1,
    batchPreExpect: 0,
  })

  setRows([])
  root.unmount()

  publishMeta({ framework: 'Octane', rows: N, targetMs, k })
  return suite
}
