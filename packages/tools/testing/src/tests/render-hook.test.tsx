/**
 * renderHook — Pyreon semantics: the hook runs ONCE; props are reactive and
 * `rerender` updates the backing signal (the hook is not re-invoked). A hook
 * that derives via computed sees the new props through fine-grained reactivity.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { computed, signal } from '@pyreon/reactivity'
import { cleanup, renderHook } from '../index'

afterEach(cleanup)

describe('renderHook', () => {
  it('exposes the hook return via result.current', () => {
    const useCounter = () => {
      const count = signal(0)
      return { count, inc: () => count.set(count() + 1) }
    }
    const { result } = renderHook(useCounter)
    expect(result.current.count()).toBe(0)
    result.current.inc()
    expect(result.current.count()).toBe(1)
  })

  it('props are reactive: rerender updates a derived computed WITHOUT re-invoking the hook', () => {
    let invocations = 0
    const useDouble = (props: () => number) => {
      invocations++
      const doubled = computed(() => props() * 2)
      return doubled
    }
    const { result, rerender } = renderHook(useDouble, { initialProps: 5 })
    expect(result.current()).toBe(10)
    const afterMount = invocations // baseline (dev-mode may validate-invoke)
    rerender(8)
    // The CONTRACT: rerender updates the reactive props signal; the hook is
    // NOT re-invoked (Pyreon semantics — the computed re-derives instead).
    expect(invocations).toBe(afterMount)
    expect(result.current()).toBe(16)
  })

  it('unmount disposes the probe', () => {
    const { unmount, result } = renderHook(() => signal('alive'))
    expect(result.current()).toBe('alive')
    expect(() => unmount()).not.toThrow()
  })
})
