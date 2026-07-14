/**
 * Real-Chromium — `renderHook` inside a real Pyreon mount. Proves that a hook's
 * reactive return is readable through `result.current` and reflects a signal
 * update after a flush, AND that `rerender` (updating the reactive props
 * signal) re-derives a computed WITHOUT re-invoking the hook — Pyreon's
 * fine-grained-reactivity mapping of Testing-Library's renderHook.
 */
import { describe, expect, it } from 'vitest'
import { computed, signal } from '@pyreon/reactivity'
import { cleanup, renderHook } from '../index'

describe('@pyreon/testing — renderHook (real browser)', () => {
  it('result.current reflects the hook return + updates after a signal set', () => {
    const useCounter = () => {
      const count = signal(0)
      return { count, inc: () => count.set(count() + 1) }
    }
    const { result } = renderHook(useCounter)
    expect(result.current.count()).toBe(0)
    result.current.inc()
    // result.current is a live getter over the SAME hook return — reading it
    // after a signal set reflects the new value (no re-invocation needed).
    expect(result.current.count()).toBe(1)
    cleanup()
  })

  it('rerender updates the reactive props → a derived computed re-derives, hook not re-invoked', () => {
    let invocations = 0
    const useDouble = (props: () => number) => {
      invocations++
      return computed(() => props() * 2)
    }
    const { result, rerender } = renderHook(useDouble, { initialProps: 5 })
    expect(result.current()).toBe(10)
    const afterMount = invocations
    rerender(8)
    expect(invocations).toBe(afterMount) // NOT re-invoked (Pyreon semantics)
    expect(result.current()).toBe(16) // computed re-derived through reactivity
    cleanup()
  })
})
