/**
 * CROSSOVER arm — SolidJS. See `crossover-shared.ts` for why this suite exists.
 *
 * Solid is here as the SECOND O(1) reference point. If Pyreon's `select` line
 * were flat and every other line sloped, the result would be easy to dismiss as
 * an artifact of the Pyreon arm or of the author's own instrument. Solid
 * reaches O(1) selection by the same mechanism (`createSelector`) through a
 * completely independent implementation, so the two flat lines corroborate each
 * other — and if Solid's line sloped while Pyreon's did not, that would be
 * strong evidence the rig is wrong rather than the architecture right.
 *
 * The rendered tree is a line-for-line copy of `solid.ts`'s: same `For`, same
 * `template()` clone, same `insert()` for the label, same `createRenderEffect`
 * over `createSelector`. Only the row COUNT is parameterised.
 */
import { createComponent, createRenderEffect, createSelector, createSignal, For } from 'solid-js'
import { insert, render, template } from 'solid-js/web'
import type { BenchSuite, NumericText } from '../runner'
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

type SolidRow = { id: number; label: () => string; setLabel: (s: string) => void }

const SUFFIX = ' !!!'

const _tmpl$ = template('<tr><td></td><td></td></tr>')

function mkRows(n: number): SolidRow[] {
  return buildRowsWith<SolidRow>(n, (id, label) => {
    const [get, set] = createSignal(label)
    return { id, label: get, setLabel: set }
  })
}

export async function runCrossoverSolid(container: HTMLElement): Promise<BenchSuite> {
  resetRng()
  const N = crossoverRows()
  const targetMs = crossoverTargetMs()
  const suite: BenchSuite = { framework: 'SolidJS', container, results: [] }
  const k: Record<string, number> = {}

  const [rows, setRows] = createSignal<SolidRow[]>([])
  const [selectedId, setSelected] = createSignal<number | null>(null)

  const isSelected = createSelector(selectedId)

  const dispose = render(() => {
    const table = document.createElement('table')
    const tbody = document.createElement('tbody')
    table.appendChild(tbody)

    insert(
      tbody,
      createComponent(
        For as unknown as (props: {
          each: SolidRow[]
          children: (row: SolidRow) => HTMLElement
        }) => HTMLElement[],
        {
          get each() {
            return rows()
          },
          children(row: SolidRow) {
            const el = _tmpl$() as HTMLElement
            const td1 = el.children[0] as HTMLElement
            const td2 = el.children[1] as HTMLElement
            // raw number — see runner.ts "Row-id rendering rule"
            ;(td1 as unknown as NumericText).textContent = row.id
            insert(td2, () => row.label())
            createRenderEffect(() => {
              el.className = isSelected(row.id) ? 'selected' : ''
            })
            return el
          },
        },
      ),
    )

    return table
  }, container)

  setRows(mkRows(N))
  await tick()

  const mid = midIndex(N)
  const midId = rows()[mid]?.id ?? null
  const originalLabels = rows().map((r) => r.label())

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
  const partialFn = () => {
    const cur = rows()
    for (let i = 0; i < cur.length; i += 10) {
      cur[i]?.setLabel(`${cur[i]?.label() ?? ''}${SUFFIX}`)
    }
  }
  const partialReset = () => {
    const cur = rows()
    for (let i = 0; i < cur.length; i += 10) {
      const orig = originalLabels[i]
      if (orig !== undefined) cur[i]?.setLabel(orig)
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
  const lo = 1
  const hi = Math.max(1, N - 2)
  const swap = () => {
    const updated = [...rows()]
    const a = updated[lo]
    const b = updated[hi]
    if (a && b) {
      updated[lo] = b
      updated[hi] = a
      setRows(updated)
    }
  }
  const canonicalIdAtLo = rows()[lo]?.id ?? -1

  await bench('swap rows', suite, swap, { verify: expectRows(N) })

  if (rows()[lo]?.id !== canonicalIdAtLo) swap()
  await tick()

  k.swap = await calibrateK(async () => {
    swap()
    swap()
    container.getBoundingClientRect()
  }, targetMs)
  if (rows()[lo]?.id !== canonicalIdAtLo) swap()

  await bench('swap rows (batch cycle)', suite, swap, {
    reset: swap,
    batchK: k.swap,
    batchProbe: idAt(lo, canonicalIdAtLo),
    batchExpect: 1,
    batchPreExpect: 0,
  })

  setRows([])
  dispose()

  publishMeta({ framework: 'SolidJS', rows: N, targetMs, k })
  return suite
}
