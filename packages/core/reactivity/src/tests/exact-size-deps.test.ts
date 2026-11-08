/**
 * Exact-size dependency lists (`exactDeps` in tracking.ts).
 *
 * Every effect, computed, `_bind` and renderEffect now collects its first-run
 * deps into a fresh array and then KEEPS an exact-size copy of it. The owner's
 * `deps` binding is re-pointed after the collect, so these tests lock that the
 * array that later runs verify against and that `dispose()` walks is the copy
 * holding every dep — including when the collect throws, when a re-run
 * diverges and grows the copy, and when the first run re-enters itself.
 */
import { _bind, computed, effect, effectScope, onCleanup, renderEffect, signal } from '../index'
import { exactDeps } from '../tracking'

const subs = (s: { debug(): { subscriberCount: number } }) => s.debug().subscriberCount

describe('exactDeps', () => {
  test('returns an empty list as-is and copies a non-empty one', () => {
    const empty: never[] = []
    expect(exactDeps(empty)).toBe(empty)
    const one = [signal(0) as never]
    const copy = exactDeps(one)
    expect(copy).not.toBe(one)
    expect(copy).toEqual(one)
  })
})

describe('owners keep a working dep list after the exact-size copy', () => {
  const makers: Record<string, (a: () => number, b: () => number, flip: () => boolean) => () => void> = {
    effect: (a, b, flip) => {
      const e = effect(() => {
        a()
        if (flip()) b()
      })
      return () => e.dispose()
    },
    renderEffect: (a, b, flip) =>
      renderEffect(() => {
        a()
        if (flip()) b()
      }),
    computed: (a, b, flip) => {
      const c = computed(() => a() + (flip() ? b() : 0))
      const e = effect(() => {
        c()
      })
      return () => {
        e.dispose()
        c.dispose()
      }
    },
  }

  for (const [name, make] of Object.entries(makers)) {
    test(`${name}: re-runs track, a diverging re-run grows the list, dispose removes every dep`, () => {
      const a = signal(0)
      const b = signal(0)
      const flip = signal(false)
      const dispose = make(a, b, flip)
      expect(subs(a)).toBe(1)
      expect(subs(b)).toBe(0)

      a.set(1) // steady-state verify against the copy
      expect(subs(a)).toBe(1)

      flip.set(true) // divergence pushes onto the copy
      expect(subs(b)).toBe(1)

      dispose()
      expect(subs(a)).toBe(0)
      expect(subs(b)).toBe(0)
      expect(subs(flip)).toBe(0)
    })
  }

  test('_bind: dispose removes every first-run dep', () => {
    const a = signal(0)
    const b = signal(0)
    const dispose = _bind(() => {
      a()
      b()
    })
    expect(subs(a)).toBe(1)
    expect(subs(b)).toBe(1)
    dispose()
    expect(subs(a)).toBe(0)
    expect(subs(b)).toBe(0)
  })

  test('a throwing first collect keeps the deps it collected, so dispose still removes them', () => {
    // effect() routes the throw to the error handler and still returns a handle.
    const b = signal(0)
    const e = effect(() => {
      b()
      throw new Error('boom')
    })
    expect(subs(b)).toBe(1)
    e.dispose()
    expect(subs(b)).toBe(0)
  })

  test('an effect whose first run writes a signal it reads keeps every dep', () => {
    const a = signal(0)
    const b = signal(0)
    let runs = 0
    const e = effect(() => {
      runs++
      if (a() < 2) a.set(a() + 1)
      b()
    })
    b.set(1)
    expect(runs).toBeGreaterThan(1)
    e.dispose()
    expect(subs(a)).toBe(0)
    expect(subs(b)).toBe(0)
  })

  test('onCleanup and scope collectors still run every entry', () => {
    const calls: string[] = []
    const s = signal(0)
    const e = effect(() => {
      s()
      onCleanup(() => calls.push('c1'))
      onCleanup(() => calls.push('c2'))
    })
    s.set(1)
    expect(calls).toEqual(['c1', 'c2'])
    e.dispose()

    const scope = effectScope()
    const x = signal(0)
    scope.runInScope(() => {
      effect(() => {
        x()
      })
      _bind(() => {
        x()
      })
      renderEffect(() => {
        x()
      })
    })
    expect(subs(x)).toBe(3)
    scope.stop()
    expect(subs(x)).toBe(0)
  })
})
