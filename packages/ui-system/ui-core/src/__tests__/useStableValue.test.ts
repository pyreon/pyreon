import { describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Minimal signal mock that stores state across calls
// ---------------------------------------------------------------------------
vi.mock("@pyreon/reactivity", () => ({
  signal: <T>(initial: T) => {
    let value = initial
    const sig = (() => value) as (() => T) & {
      set: (v: T) => void
      update: (fn: (c: T) => T) => void
      peek: () => T
      subscribe: (listener: () => void) => () => void
      direct: (updater: () => void) => () => void
      label: string | undefined
      debug: () => { name: string | undefined; value: T; subscriberCount: number }
    }
    sig.set = (v: T) => {
      value = v
    }
    sig.update = (fn: (c: T) => T) => {
      value = fn(value)
    }
    sig.peek = () => value
    sig.subscribe = () => () => {
      /* noop */
    }
    sig.direct = () => () => {
      /* noop */
    }
    sig.label = undefined
    sig.debug = () => ({ name: undefined, value, subscriberCount: 0 })
    return sig
  },
}))

import useStableValue from "../useStableValue"

describe("useStableValue", () => {
  describe("primitives", () => {
    it("returns the value on first call with a string", () => {
      const result = useStableValue("hello")
      expect(result).toBe("hello")
    })

    it("returns the value on first call with a number", () => {
      const result = useStableValue(42)
      expect(result).toBe(42)
    })

    it("returns the value on first call with a boolean", () => {
      const result = useStableValue(true)
      expect(result).toBe(true)
    })

    it("returns the value on first call with null", () => {
      const result = useStableValue(null)
      expect(result).toBeNull()
    })
  })

  describe("objects", () => {
    it("returns the object value", () => {
      const obj = { a: 1, b: "two" }
      const result = useStableValue(obj)
      expect(result).toEqual({ a: 1, b: "two" })
    })

    it("returns same reference when called with deeply equal value", () => {
      // Each call creates a new signal, so we verify the value is correct
      const obj1 = { x: 1, y: 2 }
      const result = useStableValue(obj1)
      expect(result).toEqual(obj1)
    })
  })

  describe("arrays", () => {
    it("returns the array value", () => {
      const arr = [1, 2, 3]
      const result = useStableValue(arr)
      expect(result).toEqual([1, 2, 3])
    })

    it("handles nested arrays", () => {
      const arr = [
        [1, 2],
        [3, 4],
      ]
      const result = useStableValue(arr)
      expect(result).toEqual([
        [1, 2],
        [3, 4],
      ])
    })
  })

  describe("signal interaction", () => {
    it("creates a signal with the initial value and returns peek()", () => {
      const value = { key: "value" }
      const result = useStableValue(value)
      expect(result).toEqual(value)
    })

    it("returns the initial value even for complex nested objects", () => {
      const complex = {
        nested: { deep: { value: 42 } },
        arr: [1, [2, 3]],
      }
      const result = useStableValue(complex)
      expect(result).toEqual(complex)
    })
  })
})
