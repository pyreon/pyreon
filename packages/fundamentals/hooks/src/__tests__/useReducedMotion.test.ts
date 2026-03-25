import { beforeEach, describe, expect, it, vi } from "vitest"

let mountCallbacks: Array<() => unknown> = []
let unmountCallbacks: Array<() => void> = []

vi.mock("@pyreon/core", () => ({
  onMount: (fn: () => unknown) => {
    mountCallbacks.push(fn)
  },
  onUnmount: (fn: () => void) => {
    unmountCallbacks.push(fn)
  },
}))

import { useReducedMotion } from "../useReducedMotion"

describe("useReducedMotion", () => {
  let changeListeners: Map<string, (e: MediaQueryListEvent) => void>

  beforeEach(() => {
    mountCallbacks = []
    unmountCallbacks = []
    changeListeners = new Map()

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === "change") changeListeners.set(query, cb)
        }),
        removeEventListener: vi.fn(),
      })),
    })
  })

  it("returns false when no motion preference", () => {
    const reduced = useReducedMotion()
    mountCallbacks.forEach((cb) => {
      cb()
    })
    expect(reduced()).toBe(false)
  })

  it("returns true when reduced motion is preferred", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === "change") changeListeners.set(query, cb)
        }),
        removeEventListener: vi.fn(),
      })),
    })

    const reduced = useReducedMotion()
    mountCallbacks.forEach((cb) => {
      cb()
    })
    expect(reduced()).toBe(true)
  })

  it("updates when preference changes", () => {
    const reduced = useReducedMotion()
    mountCallbacks.forEach((cb) => {
      cb()
    })
    expect(reduced()).toBe(false)

    const listener = changeListeners.get("(prefers-reduced-motion: reduce)")
    listener?.({ matches: true } as MediaQueryListEvent)
    expect(reduced()).toBe(true)
  })

  it("queries the correct media string", () => {
    const matchMediaSpy = vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: matchMediaSpy,
    })

    useReducedMotion()
    mountCallbacks.forEach((cb) => {
      cb()
    })
    expect(matchMediaSpy).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)")
  })
})
