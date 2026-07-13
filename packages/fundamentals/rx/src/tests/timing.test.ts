import { effectScope, signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { debounce, throttle } from '../timing'

// ─── Scope-lifecycle teardown (leak class I) ─────────────────────────────────
// A component that unmounts mid-debounce must not leave a pending setTimeout
// that fires post-unmount. The internal effect auto-registers with the active
// EffectScope, so scope.stop() disposes it — and the effect's returned cleanup
// must ALSO clear the pending timer. Bisect-verified: without the cleanup
// return in timing.ts, `debounced()` reads 1 after stop (the timer fired).
describe('debounce/throttle — scope teardown clears the pending timer', () => {
  afterEach(() => vi.useRealTimers())

  it('debounce: scope.stop() clears the pending timer (no post-unmount fire)', () => {
    vi.useFakeTimers()
    const scope = effectScope()
    let debounced!: ReturnType<typeof debounce<number>>
    let src!: ReturnType<typeof signal<number>>
    scope.runInScope(() => {
      src = signal(0)
      debounced = debounce(src, 100)
      src.set(1) // schedule a timer inside the scope
    })
    scope.stop() // simulate component unmount BEFORE the timer fires
    vi.advanceTimersByTime(500)
    expect(debounced()).toBe(0) // timer was cancelled, value frozen at seed
  })

  it('throttle: scope.stop() clears the pending trailing timer', () => {
    vi.useFakeTimers()
    const scope = effectScope()
    let throttled!: ReturnType<typeof throttle<number>>
    let src!: ReturnType<typeof signal<number>>
    scope.runInScope(() => {
      src = signal(0)
      throttled = throttle(src, 100)
      vi.advanceTimersByTime(100)
      src.set(1) // emits immediately
      src.set(2) // trailing timer scheduled
    })
    expect(throttled()).toBe(1)
    scope.stop()
    vi.advanceTimersByTime(500)
    expect(throttled()).toBe(1) // trailing update never fires post-unmount
  })
})

describe('debounce', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('dispose() stops tracking source changes', () => {
    vi.useFakeTimers()
    const src = signal(0)
    const debounced = debounce(src, 100)
    expect(debounced()).toBe(0)

    // Change source and advance past debounce window
    src.set(1)
    vi.advanceTimersByTime(100)
    expect(debounced()).toBe(1)

    // Dispose — further changes should not propagate
    debounced.dispose()

    src.set(2)
    vi.advanceTimersByTime(200)
    expect(debounced()).toBe(1) // still 1, not 2
  })

  it('dispose() clears pending timer so debounced value stays frozen', () => {
    vi.useFakeTimers()
    const src = signal('a')
    const debounced = debounce(src, 200)
    expect(debounced()).toBe('a')

    // Start a debounce cycle
    src.set('b')
    vi.advanceTimersByTime(50) // not yet debounced

    // Dispose mid-cycle — pending timer should be cleared
    debounced.dispose()

    // Advance well past the debounce window
    vi.advanceTimersByTime(500)
    // Value should remain "a" — the pending "b" was cancelled
    expect(debounced()).toBe('a')
  })

  it('debounces rapid updates to only emit the latest', () => {
    vi.useFakeTimers()
    const src = signal(0)
    const debounced = debounce(src, 100)

    src.set(1)
    src.set(2)
    src.set(3)

    // None should have propagated yet
    expect(debounced()).toBe(0)

    vi.advanceTimersByTime(100)
    // Only the last value should propagate
    expect(debounced()).toBe(3)
  })

  it('multiple dispose calls do not throw', () => {
    vi.useFakeTimers()
    const src = signal(0)
    const debounced = debounce(src, 100)

    debounced.dispose()
    expect(() => debounced.dispose()).not.toThrow()
  })
})

describe('throttle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('dispose() stops tracking source changes', () => {
    vi.useFakeTimers()
    const src = signal(0)
    const throttled = throttle(src, 100)
    expect(throttled()).toBe(0)

    // Advance time so the next change passes the throttle window
    vi.advanceTimersByTime(100)

    src.set(1)
    expect(throttled()).toBe(1)

    // Dispose — further changes should not propagate
    throttled.dispose()

    vi.advanceTimersByTime(200)
    src.set(2)
    vi.advanceTimersByTime(200)
    expect(throttled()).toBe(1) // still 1, not 2
  })

  it('dispose() clears pending trailing timer', () => {
    vi.useFakeTimers()
    const src = signal(0)
    const throttled = throttle(src, 200)
    expect(throttled()).toBe(0)

    // First change emits immediately (elapsed >= ms from init)
    vi.advanceTimersByTime(200)
    src.set(1)
    expect(throttled()).toBe(1)

    // Second rapid change — within throttle window, creates trailing timer
    src.set(2)
    expect(throttled()).toBe(1) // not yet

    // Dispose before trailing timer fires
    throttled.dispose()

    vi.advanceTimersByTime(500)
    expect(throttled()).toBe(1) // trailing update never fires
  })

  it('emits immediately on first change after window', () => {
    vi.useFakeTimers()
    const src = signal(0)
    const throttled = throttle(src, 100)

    // Wait for throttle window to pass
    vi.advanceTimersByTime(100)

    src.set(42)
    // Should emit immediately since enough time passed
    expect(throttled()).toBe(42)
  })

  it('trailing timer fires the latest value after throttle window', () => {
    vi.useFakeTimers()
    const src = signal(0)
    const throttled = throttle(src, 100)
    expect(throttled()).toBe(0)

    vi.advanceTimersByTime(100)
    src.set(1) // emits immediately
    expect(throttled()).toBe(1)

    // Rapid changes within window
    src.set(2)
    src.set(3)
    expect(throttled()).toBe(1) // still 1

    vi.advanceTimersByTime(100) // trailing timer fires
    expect(throttled()).toBe(3) // latest value
  })

  it('multiple dispose calls do not throw', () => {
    vi.useFakeTimers()
    const src = signal(0)
    const throttled = throttle(src, 100)

    throttled.dispose()
    expect(() => throttled.dispose()).not.toThrow()
  })
})
