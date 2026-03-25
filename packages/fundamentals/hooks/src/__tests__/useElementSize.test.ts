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

import { useElementSize } from "../useElementSize"

describe("useElementSize", () => {
  let resizeCallback: ((entries: ResizeObserverEntry[]) => void) | undefined
  let observeSpy: ReturnType<typeof vi.fn>
  let disconnectSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mountCallbacks = []
    unmountCallbacks = []
    resizeCallback = undefined
    observeSpy = vi.fn()
    disconnectSpy = vi.fn()

    globalThis.ResizeObserver = vi.fn(function (this: unknown, cb: ResizeObserverCallback) {
      resizeCallback = cb as (entries: ResizeObserverEntry[]) => void
      return {
        observe: observeSpy,
        unobserve: vi.fn(),
        disconnect: disconnectSpy,
      }
    }) as unknown as typeof ResizeObserver
  })

  it("returns initial size of 0x0", () => {
    const size = useElementSize(() => null)
    expect(size().width).toBe(0)
    expect(size().height).toBe(0)
  })

  it("measures initial element size on mount", () => {
    const el = document.createElement("div")
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 100,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 100,
      right: 200,
      toJSON: () => {
        /* no-op */
      },
    })

    const size = useElementSize(() => el)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    expect(size().width).toBe(200)
    expect(size().height).toBe(100)
  })

  it("observes the element with ResizeObserver", () => {
    const el = document.createElement("div")
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      toJSON: () => {
        /* no-op */
      },
    })

    useElementSize(() => el)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    expect(observeSpy).toHaveBeenCalledWith(el)
  })

  it("updates size when ResizeObserver fires", () => {
    const el = document.createElement("div")
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 50,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 50,
      right: 100,
      toJSON: () => {
        /* no-op */
      },
    })

    const size = useElementSize(() => el)
    mountCallbacks.forEach((cb) => {
      cb()
    })
    expect(size().width).toBe(100)

    // Simulate resize
    resizeCallback?.([
      {
        contentRect: { width: 300, height: 150 },
      } as unknown as ResizeObserverEntry,
    ])

    expect(size().width).toBe(300)
    expect(size().height).toBe(150)
  })

  it("does nothing on mount when element is null", () => {
    useElementSize(() => null)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    expect(observeSpy).not.toHaveBeenCalled()
  })

  it("disconnects ResizeObserver on unmount", () => {
    const el = document.createElement("div")
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      toJSON: () => {
        /* no-op */
      },
    })

    useElementSize(() => el)
    mountCallbacks.forEach((cb) => {
      cb()
    })
    unmountCallbacks.forEach((cb) => {
      cb()
    })

    expect(disconnectSpy).toHaveBeenCalled()
  })

  it("handles ResizeObserver callback with no entry", () => {
    const el = document.createElement("div")
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      width: 50,
      height: 25,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 25,
      right: 50,
      toJSON: () => {
        /* no-op */
      },
    })

    const size = useElementSize(() => el)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    // Empty entries array
    resizeCallback?.([])
    // Should keep initial measurement
    expect(size().width).toBe(50)
    expect(size().height).toBe(25)
  })
})
