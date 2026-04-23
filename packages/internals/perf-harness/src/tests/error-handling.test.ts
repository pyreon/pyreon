// @vitest-environment happy-dom
/**
 * Error handling probe.
 *
 * When a signal read throws, or a computed/effect fn throws, the
 * framework must:
 *   - surface the error (via setErrorHandler or console)
 *   - NOT corrupt the subscriber graph (signal's _s set shouldn't leak)
 *   - NOT wedge the scheduler (subsequent writes should still notify)
 */
import { computed, effect, onCleanup, setErrorHandler, signal } from '@pyreon/reactivity'
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

describe('error handling', () => {
  it('effect fn that throws — error handler is invoked, not swallowed', () => {
    const errors: unknown[] = []
    setErrorHandler((err) => errors.push(err))

    const s = signal(0)
    effect(() => {
      if (s() === 1) throw new Error('boom')
    })

    expect(errors).toHaveLength(0)
    s.set(1) // trigger the throw
    expect(errors).toHaveLength(1)
    expect((errors[0] as Error).message).toBe('boom')

    setErrorHandler((err) => console.error('[pyreon] Unhandled effect error:', err))
  })

  it('computed fn that throws — error handler invoked on read, not subscribe', () => {
    const errors: unknown[] = []
    setErrorHandler((err) => errors.push(err))

    const s = signal(false)
    const c = computed(() => {
      if (s()) throw new Error('throw-in-computed')
      return 42
    })

    // First read — doesn't throw (s is false)
    expect(c()).toBe(42)

    // Flip signal → computed becomes dirty, NEXT read throws internally
    s.set(true)
    // Reading the throwing computed invokes error handler (doesn't crash)
    c()
    expect(errors.length).toBeGreaterThan(0)

    setErrorHandler((err) => console.error('[pyreon] Unhandled effect error:', err))
  })

  it('effect throws then signal still notifies next subscriber', () => {
    const errors: unknown[] = []
    setErrorHandler((err) => errors.push(err))

    const s = signal(0)
    let secondRuns = 0

    effect(() => {
      if (s() === 1) throw new Error('first throws')
    })

    effect(() => {
      s()
      secondRuns++
    })
    const initialSecond = secondRuns

    s.set(1) // First effect throws, second should still fire
    expect(errors).toHaveLength(1)
    expect(secondRuns).toBeGreaterThan(initialSecond)

    setErrorHandler((err) => console.error('[pyreon] Unhandled effect error:', err))
  })

  it('onCleanup that throws — subsequent cleanups still run', () => {
    const log: string[] = []
    setErrorHandler(() => {
      /* swallow */
    })

    const e = effect(() => {
      onCleanup(() => log.push('a'))
      onCleanup(() => {
        log.push('b')
        throw new Error('cleanup-boom')
      })
      onCleanup(() => log.push('c'))
    })

    e.dispose()
    expect(log).toEqual(['a', 'b', 'c'])

    setErrorHandler((err) => console.error('[pyreon] Unhandled effect error:', err))
  })
})
