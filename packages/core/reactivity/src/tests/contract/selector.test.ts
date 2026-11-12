/**
 * Contract — createSelector (design §1.6: C25).
 *
 * Public API only.
 */
import { batch, createSelector, effect, signal } from '../../index'

function rows(n: number, isSelected: (k: number) => boolean) {
  const runs = Array.from({ length: n }, () => 0)
  const seen = Array.from({ length: n }, () => false)
  for (let k = 0; k < n; k++)
    effect(() => {
      seen[k] = isSelected(k)
      runs[k]!++
    })
  return { runs, seen }
}

describe('C25 — createSelector re-runs only the old and new key subscribers', () => {
  test('C25: a selection change re-runs exactly two rows', () => {
    const sel = signal(1)
    const isSelected = createSelector(sel)
    const { runs, seen } = rows(6, isSelected)
    expect(seen).toEqual([false, true, false, false, false, false])
    sel.set(4)
    expect(runs).toEqual([1, 2, 1, 1, 2, 1])
    expect(seen).toEqual([false, false, false, false, true, false])
  })

  test('C25: an unchanged selection re-runs nothing; a batch that ends where it started re-runs nothing', () => {
    const sel = signal(2)
    const isSelected = createSelector(sel)
    const { runs } = rows(4, isSelected)
    sel.set(2)
    batch(() => {
      sel.set(3)
      sel.set(2)
    })
    expect(runs).toEqual([1, 1, 1, 1])
  })

  test('C25: selecting a key nobody reads re-runs only the deselected row', () => {
    const sel = signal(0)
    const isSelected = createSelector(sel)
    const { runs } = rows(3, isSelected)
    sel.set(99)
    expect(runs).toEqual([2, 1, 1])
    sel.set(2)
    expect(runs).toEqual([2, 1, 2])
  })

  test('C25: several subscribers on one key all re-run, others do not', () => {
    const sel = signal(0)
    const isSelected = createSelector(sel)
    const a = rows(3, isSelected)
    const b = rows(3, isSelected)
    const c = rows(3, isSelected)
    sel.set(1)
    for (const r of [a, b, c]) expect(r.runs).toEqual([2, 2, 1])
  })

  test('C25: selector.subscribe calls the updater once inline, then only on crossings', () => {
    const sel = signal(0)
    const isSelected = createSelector(sel)
    const calls: Array<[number, boolean]> = []
    const disposers = [0, 1, 2].map((k) => isSelected.subscribe(k, (m) => calls.push([k, m])))
    expect(calls).toEqual([
      [0, true],
      [1, false],
      [2, false],
    ])
    calls.length = 0
    sel.set(2)
    expect(calls.sort()).toEqual([
      [0, false],
      [2, true],
    ])
    calls.length = 0
    disposers[2]!()
    sel.set(1)
    expect(calls).toEqual([[1, true]])
  })

  test('C25: a disposed row is not re-run, and the selector source tracks a computed accessor', () => {
    const base = signal(9)
    const isSelected = createSelector(() => base() % 3)
    let runs = 0
    const e = effect(() => {
      isSelected(1)
      runs++
    })
    base.set(11) // 2: key 1 unaffected
    base.set(13) // 1: key 1 selected
    expect(runs).toBe(2)
    e.dispose()
    base.set(14)
    expect(runs).toBe(2)
  })

  test('C25: dispose() stops tracking and keeps the last answer', () => {
    const sel = signal(0)
    const isSelected = createSelector(sel)
    const { runs } = rows(2, isSelected)
    isSelected.dispose()
    sel.set(1)
    expect(runs).toEqual([1, 1])
    expect(isSelected(0)).toBe(true)
  })
})
