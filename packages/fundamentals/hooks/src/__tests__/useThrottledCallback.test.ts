import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock @pyreon/core partially - keep real exports but stub lifecycle hooks
vi.mock("@pyreon/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pyreon/core")>()
  return {
    ...actual,
    onMount: (fn: () => void) => fn(),
    onUnmount: (_fn: () => void) => {
      return undefined
    },
  }
})

import { useThrottledCallback } from "../useThrottledCallback"

describe("useThrottledCallback", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("calls immediately on first invocation (leading)", () => {
    const fn = vi.fn()
    const throttled = useThrottledCallback(fn, 100)

    throttled("a")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith("a")
  })

  it("throttles subsequent calls", () => {
    const fn = vi.fn()
    const throttled = useThrottledCallback(fn, 100)

    throttled("a")
    throttled("b")
    throttled("c")

    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith("c")
  })

  it("cancel stops pending trailing call", () => {
    const fn = vi.fn()
    const throttled = useThrottledCallback(fn, 100)

    throttled("a")
    throttled("b")
    throttled.cancel()

    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
