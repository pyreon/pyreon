/**
 * CROSSOVER arm — Pyreon. See `crossover-shared.ts` for why this suite exists.
 *
 * The rendered tree is a LINE-FOR-LINE copy of `pyreon.tsx`'s: same `<For>`
 * with the same `by` key, same `createSelector`, same per-row label signal,
 * same raw-number id cell. Only the row COUNT is parameterised. If this arm
 * diverged from the published one it would be measuring a different Pyreon
 * than the suite everyone else reads.
 */
import { For } from '@pyreon/core'
import { createSelector, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import type { BenchSuite } from '../runner'
import { bench, buildRowsWith, expectRows, expectRowsWithSelected, resetRng, tick } from '../runner'
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

const SUFFIX = ' !!!'

export async function runCrossoverPyreon(container: HTMLElement): Promise<BenchSuite> {
  resetRng()
  const N = crossoverRows()
  const targetMs = crossoverTargetMs()
  const suite: BenchSuite = { framework: 'Pyreon', container, results: [] }
  const k: Record<string, number> = {}

  type ReactiveRow = { id: number; label: ReturnType<typeof signal<string>> }
  const rows = signal<ReactiveRow[]>([])
  const selectedId = signal<number | null>(null)

  const isSelected = createSelector(selectedId)

  const unmount = mount(
    <table>
      <tbody>
        <For each={rows} by={(row: ReactiveRow) => row.id}>
          {(row: ReactiveRow) => (
            <tr class={() => (isSelected(row.id) ? 'selected' : '')}>
              {/* raw number — see runner.ts "Row-id rendering rule" */}
              <td>{row.id}</td>
              <td>{() => row.label()}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>,
    container,
  )

  const mkRows = (n: number) =>
    buildRowsWith<ReactiveRow>(n, (id, label) => ({ id, label: signal(label) }))

  rows.set(mkRows(N))
  await tick()

  const mid = midIndex(N)
  const midId = rows()[mid]?.id ?? null
  const originalLabels = rows().map((r) => r.label())

  // ── select row ────────────────────────────────────────────────────────────
  const selectFn = () => {
    selectedId.set(midId)
  }
  const selectReset = () => {
    selectedId.set(null)
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
  const partialFn = () => {
    const current = rows()
    for (let i = 0; i < current.length; i += 10) {
      current[i]?.label.update((l) => `${l}${SUFFIX}`)
    }
  }
  const partialReset = () => {
    const current = rows()
    for (let i = 0; i < current.length; i += 10) {
      const orig = originalLabels[i]
      if (orig !== undefined) current[i]?.label.set(orig)
    }
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
  // A swap is its own inverse, so `reset` is the same operation as `fn` and the
  // cycle alternates canonical → swapped → canonical. That makes the batch
  // probe deterministic (see `idAt` in crossover-shared) without maintaining a
  // second array, and keeps both halves of the cycle identical work.
  const lo = 1
  const hi = Math.max(1, N - 2)
  const swap = () => {
    const current = [...rows()]
    const a = current[lo]
    const b = current[hi]
    if (a && b) {
      current[lo] = b
      current[hi] = a
      rows.set(current)
    }
  }
  const canonicalIdAtLo = rows()[lo]?.id ?? -1

  await bench('swap rows', suite, swap, { verify: expectRows(N) })

  // Restore canonical order if the odd number of direct-swap iterations left it
  // swapped, so the batch arm starts from the state its probes assume.
  if (rows()[lo]?.id !== canonicalIdAtLo) swap()
  await tick()

  k.swap = await calibrateK(async () => {
    swap()
    swap()
    container.getBoundingClientRect()
  }, targetMs)
  if (rows()[lo]?.id !== canonicalIdAtLo) swap()

  // One probe serves both halves: after the reset-swap the far-end id sits at
  // `lo` (probe → 0), after `fn`'s swap the canonical id is back (probe → 1).
  // So the precondition gate is real here, not a formality — it fails loudly if
  // the alternation ever desynchronises.
  await bench('swap rows (batch cycle)', suite, swap, {
    reset: swap,
    batchK: k.swap,
    batchProbe: idAt(lo, canonicalIdAtLo),
    batchExpect: 1,
    batchPreExpect: 0,
  })

  rows.set([])
  unmount()

  publishMeta({ framework: 'Pyreon', rows: N, targetMs, k })
  return suite
}
