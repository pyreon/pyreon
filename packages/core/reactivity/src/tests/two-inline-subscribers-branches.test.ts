/**
 * Branch coverage for the SECOND inline tracking subscriber — the shapes the
 * storage-invariant suites (`inline-tracking-slot`, `sole-subscriber-suspend-
 * set-shape`) do not reach because they assert STORAGE, not dispatch:
 *
 *   - a write under an OUTER `batch()` with two inline subscribers, and with a
 *     promoted Set (signal.ts batching branch);
 *   - `.trigger()` with two inline subscribers, batched and unbatched;
 *   - the lazy chain hop reading a computed that carries two inline
 *     subscribers, and a Set that shrank back to ONE entry (no demotion);
 *   - `why()` counting a function-shaped `_s`;
 *   - `_hasSubscribers` / `_tierCount` on the function form;
 *   - `createSelector.subscribe` reviving a holder an earlier unsubscribe
 *     left dead.
 *
 * Every spec asserts observable behaviour (fire counts / order), so a change
 * that keeps the branch but breaks dispatch fails here, not only in coverage.
 */
import { batch } from '../batch'
import { computed } from '../computed'
import { createSelector } from '../createSelector'
import { why } from '../debug'
import { effect } from '../effect'
import { _hasSubscribers, _tierCount, signal } from '../signal'

type Host = { _s1: unknown; _s: unknown }
const host = (x: unknown) => x as unknown as Host

describe('two inline tracking subscribers — dispatch branches', () => {
  it('a write under an outer batch() fires both inline subscribers once, in order', () => {
    const s = signal(0)
    const log: string[] = []
    const d1 = effect(() => {
      s()
      log.push('a')
    })
    const d2 = effect(() => {
      s()
      log.push('b')
    })
    expect(typeof host(s)._s).toBe('function')
    log.length = 0
    batch(() => {
      s.set(1)
      s.set(2)
    })
    expect(log).toEqual(['a', 'b'])
    d1.dispose()
    d2.dispose()
  })

  it('a write under an outer batch() with a promoted Set fires all three once', () => {
    const s = signal(0)
    let n = 0
    const ds = [1, 2, 3].map(() =>
      effect(() => {
        s()
        n++
      }),
    )
    expect(host(s)._s instanceof Set).toBe(true)
    n = 0
    batch(() => {
      s.set(1)
      s.set(2)
    })
    expect(n).toBe(3)
    for (const d of ds) d.dispose()
  })

  it('trigger() re-runs two inline subscribers, unbatched and under batch()', () => {
    const items = signal<number[]>([])
    const log: string[] = []
    const d1 = effect(() => {
      items()
      log.push('a')
    })
    const d2 = effect(() => {
      items()
      log.push('b')
    })
    log.length = 0
    items.peek().push(1)
    items.trigger()
    expect(log).toEqual(['a', 'b'])
    log.length = 0
    batch(() => {
      items.trigger()
      items.trigger()
    })
    expect(log).toEqual(['a', 'b'])
    d1.dispose()
    d2.dispose()
  })

  it('trigger() with a promoted Set fires every subscriber', () => {
    const s = signal({ n: 0 })
    let n = 0
    const ds = [1, 2, 3].map(() =>
      effect(() => {
        s()
        n++
      }),
    )
    n = 0
    s.trigger()
    expect(n).toBe(3)
    for (const d of ds) d.dispose()
  })

  it('lazy chain hop: a computed carrying two inline subscribers fans out to both', () => {
    const s = signal(1)
    const c = computed(() => s() * 2)
    const seen: number[] = []
    const d1 = effect(() => seen.push(c()))
    const d2 = effect(() => seen.push(c() + 100))
    expect(typeof host(c)._s).toBe('function')
    seen.length = 0
    s.set(2)
    expect(seen).toEqual([4, 104])
    d1.dispose()
    d2.dispose()
  })

  it('lazy chain hop: a Set that shrank back to ONE entry still hops (no demotion)', () => {
    const s = signal(1)
    const c = computed(() => s() * 2)
    const seen: number[] = []
    const d1 = effect(() => seen.push(c()))
    const d2 = effect(() => seen.push(c() + 100))
    const d3 = effect(() => seen.push(c() + 200))
    expect(host(c)._s instanceof Set).toBe(true)
    d1.dispose()
    d2.dispose()
    expect((host(c)._s as Set<unknown>).size).toBe(1)
    seen.length = 0
    s.set(3)
    expect(seen).toEqual([206])
    d3.dispose()
  })

  it('_hasSubscribers / _tierCount see the function-shaped second tier', () => {
    const s = signal(0)
    const d1 = effect(() => s())
    const d2 = effect(() => s())
    expect(_tierCount(host(s)._s as never)).toBe(1)
    expect(_hasSubscribers(s)).toBe(true)
    d1.dispose()
    // the second packs down into the inline slot; still subscribed
    expect(_hasSubscribers(s)).toBe(true)
    d2.dispose()
    expect(_hasSubscribers(s)).toBe(false)
    expect(_tierCount(null)).toBe(0)
    expect(_tierCount(new Set([() => {}, () => {}]) as never)).toBe(2)
  })

  it('why() counts a function-shaped second tier as one subscriber', async () => {
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '))
    try {
      const s = signal(1, { name: 'pair' })
      const d1 = effect(() => s())
      const d2 = effect(() => s())
      why()
      s.set(2)
      await new Promise((r) => queueMicrotask(() => r(undefined)))
      expect(logs.some((l) => l.includes('"pair"') && l.includes('(2 subscribers)'))).toBe(true)
      d1.dispose()
      d2.dispose()
    } finally {
      console.log = origLog
    }
  })

  it('trigger() under batch() with a promoted DIRECT Set and a promoted tracking Set', () => {
    const s = signal({ n: 0 })
    let direct = 0
    const offA = s.direct(() => direct++)
    const offB = s.direct(() => direct++)
    let tracked = 0
    const ds = [1, 2, 3].map(() =>
      effect(() => {
        s()
        tracked++
      }),
    )
    direct = 0
    tracked = 0
    batch(() => s.trigger())
    expect(direct).toBe(2)
    expect(tracked).toBe(3)
    offA()
    offB()
    for (const d of ds) d.dispose()
  })

  it('_hasSubscribers sees a sole DIRECT subscriber', () => {
    const s = signal(0)
    expect(_hasSubscribers(s)).toBe(false)
    const off = s.direct(() => {})
    expect(_hasSubscribers(s)).toBe(true)
    off()
    expect(_hasSubscribers(s)).toBe(false)
  })

  it('why() counts a promoted Set by its size', async () => {
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '))
    try {
      const s = signal(1, { name: 'trio' })
      const ds = [1, 2, 3].map(() => effect(() => s()))
      why()
      s.set(2)
      await new Promise((r) => queueMicrotask(() => r(undefined)))
      expect(logs.some((l) => l.includes('"trio"') && l.includes('(3 subscribers)'))).toBe(true)
      for (const d of ds) d.dispose()
    } finally {
      console.log = origLog
    }
  })

  it('a lazy cascade past the recursion window fans out to two effects at the tail', () => {
    const s = signal(0)
    let tail = computed(() => s())
    for (let i = 0; i < 520; i++) {
      const prev = tail
      tail = computed(() => prev() + 1)
    }
    const seen: number[] = []
    const d1 = effect(() => seen.push(tail()))
    const d2 = effect(() => seen.push(tail() * 10))
    seen.length = 0
    s.set(1)
    expect(seen).toEqual([521, 5210])
    d1.dispose()
    d2.dispose()
  })

  it('createSelector.subscribe revives a holder left dead by an earlier unsubscribe', () => {
    const selected = signal<string | null>('a')
    const isSelected = createSelector(() => selected())
    // A second live key keeps the map from being cleared when `a` goes dead.
    const offKeep = isSelected.subscribe('keep', () => {})
    const first: boolean[] = []
    const off = isSelected.subscribe('a', (m) => first.push(m))
    expect(first).toEqual([true])
    off()
    // Same key, no insert in between — the map still holds the dead holder.
    const second: boolean[] = []
    const off2 = isSelected.subscribe('a', (m) => second.push(m))
    expect(second).toEqual([true])
    selected.set('b')
    expect(second).toEqual([true, false])
    expect(first).toEqual([true])
    off2()
    offKeep()
    isSelected.dispose()
  })
})
