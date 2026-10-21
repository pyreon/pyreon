/**
 * `propagateEagerChange` exits early when there is nothing to propagate: no
 * direct updaters, and the only subscriber is a lazy computed that is already
 * dirty or disposed (the pull-through-a-chain case). These specs lock what the
 * guard must NOT skip, plus the values the fast exit must keep correct.
 */
import { computed, effect, signal } from '../index'

describe('propagateEagerChange fast exit', () => {
  it('a 50-deep lazy chain pulls the right value on every update', () => {
    const s = signal(0)
    let cur: () => number = s
    for (let i = 0; i < 50; i++) {
      const prev = cur
      cur = computed(() => prev() + 1)
    }
    const tail = cur
    for (let i = 0; i < 20; i++) {
      s.set(i)
      expect(tail()).toBe(i + 50)
    }
  })

  it('still fires a direct updater when the sole tracking subscriber is already dirty', () => {
    // `d` reads both `c` and `s`, so a write to `s` leaves `d` dirty. `c` has a
    // direct updater, so it re-evaluates in the drain with `d` as its sole,
    // already-dirty subscriber — the updater must still receive the new value.
    const s = signal(1)
    const c = computed(() => s() * 10)
    const d = computed(() => c() + s())
    expect(d()).toBe(11)
    const seen: number[] = []
    c.direct(() => seen.push(c()))
    s.set(2)
    expect(seen).toEqual([20])
    expect(d()).toBe(22)
  })

  it('an effect downstream of a chain re-runs once per write with the settled value', () => {
    const s = signal(0)
    const a = computed(() => s() + 1)
    const b = computed(() => a() * 2)
    const runs: number[] = []
    const e = effect(() => {
      runs.push(b())
    })
    s.set(1)
    s.set(2)
    expect(runs).toEqual([2, 4, 6])
    e.dispose()
  })

  it('a diamond settles both branches before the join reads them', () => {
    const s = signal(1)
    const left = computed(() => s() + 1)
    const right = computed(() => s() * 2)
    const join = computed(() => left() + right())
    const seen: number[] = []
    const e = effect(() => {
      seen.push(join())
    })
    for (let i = 2; i <= 4; i++) s.set(i)
    expect(seen).toEqual([4, 7, 10, 13])
    e.dispose()
  })
})
