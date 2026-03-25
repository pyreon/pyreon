import { signal } from "@pyreon/reactivity"
import { afterEach, describe, expect, it, vi } from "vitest"
import { debounce, throttle } from "../timing"

describe("debounce", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("dispose() stops tracking source changes", () => {
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
})

describe("throttle", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("dispose() stops tracking source changes", () => {
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
})
