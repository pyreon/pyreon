import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Capture registered callbacks so we can invoke lifecycle manually
let mountCallbacks: Array<() => void> = []
let unmountCallbacks: Array<() => void> = []

vi.mock("@pyreon/core", () => ({
  onMount: (fn: () => unknown) => {
    mountCallbacks.push(fn as () => void)
  },
  onUnmount: (fn: () => void) => {
    unmountCallbacks.push(fn)
  },
}))

import { useClickOutside } from "../useClickOutside"

describe("useClickOutside", () => {
  let container: HTMLDivElement

  beforeEach(() => {
    mountCallbacks = []
    unmountCallbacks = []
    container = document.createElement("div")
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it("calls handler when clicking outside the element", () => {
    const handler = vi.fn()
    useClickOutside(() => container, handler)

    // Simulate mount
    mountCallbacks.forEach((cb) => {
      cb()
    })

    const outside = document.createElement("div")
    document.body.appendChild(outside)

    const event = new MouseEvent("mousedown", { bubbles: true })
    Object.defineProperty(event, "target", { value: outside })
    document.dispatchEvent(event)

    expect(handler).toHaveBeenCalledTimes(1)
    document.body.removeChild(outside)
  })

  it("does not call handler when clicking inside the element", () => {
    const handler = vi.fn()
    const child = document.createElement("span")
    container.appendChild(child)

    useClickOutside(() => container, handler)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    const event = new MouseEvent("mousedown", { bubbles: true })
    Object.defineProperty(event, "target", { value: child })
    document.dispatchEvent(event)

    expect(handler).not.toHaveBeenCalled()
  })

  it("does not call handler when clicking the element itself", () => {
    const handler = vi.fn()
    useClickOutside(() => container, handler)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    const event = new MouseEvent("mousedown", { bubbles: true })
    Object.defineProperty(event, "target", { value: container })
    document.dispatchEvent(event)

    expect(handler).not.toHaveBeenCalled()
  })

  it("does not call handler when element is null", () => {
    const handler = vi.fn()
    useClickOutside(() => null, handler)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    const event = new MouseEvent("mousedown", { bubbles: true })
    Object.defineProperty(event, "target", { value: document.body })
    document.dispatchEvent(event)

    expect(handler).not.toHaveBeenCalled()
  })

  it("handles touchstart events", () => {
    const handler = vi.fn()
    useClickOutside(() => container, handler)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    const outside = document.createElement("div")
    document.body.appendChild(outside)

    const event = new Event("touchstart", { bubbles: true })
    Object.defineProperty(event, "target", { value: outside })
    document.dispatchEvent(event)

    expect(handler).toHaveBeenCalledTimes(1)
    document.body.removeChild(outside)
  })

  it("removes listeners on unmount", () => {
    const handler = vi.fn()
    useClickOutside(() => container, handler)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    const removeSpy = vi.spyOn(document, "removeEventListener")
    unmountCallbacks.forEach((cb) => {
      cb()
    })

    expect(removeSpy).toHaveBeenCalledWith("mousedown", expect.any(Function), true)
    expect(removeSpy).toHaveBeenCalledWith("touchstart", expect.any(Function), true)
    removeSpy.mockRestore()
  })

  it("adds listeners with capture phase", () => {
    const handler = vi.fn()
    const addSpy = vi.spyOn(document, "addEventListener")
    useClickOutside(() => container, handler)
    mountCallbacks.forEach((cb) => {
      cb()
    })

    expect(addSpy).toHaveBeenCalledWith("mousedown", expect.any(Function), true)
    expect(addSpy).toHaveBeenCalledWith("touchstart", expect.any(Function), true)
    addSpy.mockRestore()
  })
})
