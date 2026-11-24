/**
 * Owners keep a working dependency list across their lifetime.
 *
 * Every effect, computed, `_bind` and renderEffect records its dependencies
 * as graph edges on the first run and re-uses them on later runs. These tests
 * lock that the edges later runs re-use and that `dispose()` walks hold every
 * dependency — including when the first run throws, when a re-run diverges
 * and grows the list, and when the first run writes a signal it read.
 * (Edge counts per node kind after teardown: `link-teardown.test.ts`.)
 */
import { _bind, computed, effect, effectScope, onCleanup, renderEffect, signal } from '../index'

const subs = (s: { debug(): { subscriberCount: number } }) => s.debug().subscriberCount

describe('owners keep a working dep list', () => {
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

      a.set(1) // steady state re-uses the edges
      expect(subs(a)).toBe(1)

      flip.set(true) // divergence appends an edge
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
      renderEffect(() => {
        x()
      })
    })
    expect(subs(x)).toBe(2)
    scope.stop()
    expect(subs(x)).toBe(0)
  })
})
