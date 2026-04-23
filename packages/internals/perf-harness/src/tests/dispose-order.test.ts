// @vitest-environment happy-dom
/**
 * Dispose ordering / subscriber cleanup probe.
 *
 * When a computed/effect disposes, its subscriber reference in the
 * parent signals' `_s` Set must be removed, otherwise signals
 * accumulate stale subscriber references until GC (if ever).
 */
import { computed, effect, signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

describe('dispose cleans subscriber set', () => {
  it('disposed effect is removed from signal subscribers', () => {
    const s = signal(0)
    const e = effect(() => {
      s()
    })
    expect(s.debug().subscriberCount).toBe(1)
    e.dispose()
    expect(s.debug().subscriberCount).toBe(0)
  })

  it('disposed computed is removed from signal subscribers AFTER first read', () => {
    const s = signal(0)
    const c = computed(() => s() * 2)
    c() // primes the dependency
    expect(s.debug().subscriberCount).toBe(1)
    c.dispose()
    expect(s.debug().subscriberCount).toBe(0)
  })

  it('disposing 100 effects subscribed to the same signal leaves 0 subscribers', () => {
    const s = signal(0)
    const effects = Array.from({ length: 100 }, () =>
      effect(() => {
        s()
      }),
    )
    expect(s.debug().subscriberCount).toBe(100)
    for (const e of effects) e.dispose()
    expect(s.debug().subscriberCount).toBe(0)
  })

  it('effect re-run with CHANGED deps — old signal drops subscription', () => {
    const a = signal('a')
    const b = signal('b')
    const which = signal<'a' | 'b'>('a')
    const e = effect(() => {
      which() === 'a' ? a() : b()
    })
    expect(a.debug().subscriberCount).toBe(1)
    expect(b.debug().subscriberCount).toBe(0)

    which.set('b')
    // Now effect reads b, not a — a should be released
    expect(a.debug().subscriberCount).toBe(0)
    expect(b.debug().subscriberCount).toBe(1)

    e.dispose()
    expect(a.debug().subscriberCount).toBe(0)
    expect(b.debug().subscriberCount).toBe(0)
    expect(which.debug().subscriberCount).toBe(0)
  })

  it('deeply nested computeds all dispose their deps when the root disposes', () => {
    const s = signal(0)
    const c1 = computed(() => s() + 1)
    const c2 = computed(() => c1() + 1)
    const c3 = computed(() => c2() + 1)
    c3() // primes the chain
    expect(s.debug().subscriberCount).toBeGreaterThan(0)
    c3.dispose()
    c2.dispose()
    c1.dispose()
    expect(s.debug().subscriberCount).toBe(0)
  })
})
