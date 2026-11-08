/**
 * A disposed computed must never re-link to its sources.
 *
 * Before the fix, reading a computed that a write had dirty-marked and that was
 * disposed before anything pulled it went `_dirty` → `runVerify` over the
 * now-empty dep list → `addSubscriber`, so its `recompute` re-joined the
 * source's subscriber set for the source's lifetime (count 2 → 3 in the shape
 * below) — a leak, plus a dead call per write. `@pyreon/flow` papered over it
 * by poking `_dirty = false` after `dispose()`.
 */
import { batch } from '../batch'
import { computed } from '../computed'
import { effect } from '../effect'
import { signal } from '../signal'

const subs = (s: { debug(): { subscriberCount: number } }) => s.debug().subscriberCount

describe('disposed computed — no re-subscription on read', () => {
  test('a read of a disposed-while-dirty lazy computed does not re-subscribe it', () => {
    const s = signal(0)
    // Two live subscribers, so the source sits in its inline + tier shape.
    const live = computed(() => s() + 1)
    effect(() => {
      live()
    })
    const other = computed(() => s() * 2)
    other()

    let evals = 0
    const d = computed(() => {
      evals++
      return s() + 100
    })
    expect(d()).toBe(100)
    expect(subs(s)).toBe(3)

    s.set(2) // d is now dirty, nobody pulled it
    d.dispose()
    expect(subs(s)).toBe(2)

    // No re-link (the bug: 2 -> 3), last value, no re-evaluation.
    const late = d()
    expect(subs(s)).toBe(2)
    expect(late).toBe(100)
    expect(evals).toBe(1)

    // And later writes do not reach it.
    s.set(3)
    const later = d()
    expect(subs(s)).toBe(2)
    expect(later).toBe(100)
    expect(evals).toBe(1)
  })

  test('batched write + dispose, then a late read (the @pyreon/flow sweep shape)', () => {
    const s = signal(0)
    const d = computed(() => s() + 1)
    effect(() => {
      d()
    })
    const live = computed(() => s())
    live()
    const before = subs(s)

    batch(() => {
      s.set(1) // dirty-marks d and books its refresh
      d.dispose() // swept in the same batch
    })
    d() // late read after the sweep
    expect(subs(s)).toBe(before - 1)
  })

  test('an eager ({ equals }) computed disposed while dirty does not re-subscribe', () => {
    const s = signal(0)
    const d = computed(() => s() + 1, { equals: Object.is })
    d()
    batch(() => {
      s.set(1)
      d.dispose()
    })
    const late = d()
    expect(subs(s)).toBe(0)
    expect(late).toBe(1)
  })

  test('a computed disposed before its first read evaluates once, untracked', () => {
    const s = signal(5)
    let evals = 0
    const d = computed(() => {
      evals++
      return s() * 2
    })
    d.dispose()
    const first = d()
    expect(subs(s)).toBe(0)
    expect(first).toBe(10)
    expect(d()).toBe(10)
    expect(evals).toBe(1)
  })

  test('a reader tracking a disposed computed does not pull the source into its deps', () => {
    const s = signal(0)
    const d = computed(() => s() + 1)
    d()
    s.set(1)
    d.dispose()
    let runs = 0
    effect(() => {
      runs++
      d()
    })
    s.set(2)
    expect(runs).toBe(1)
    expect(subs(s)).toBe(0)
  })
})
