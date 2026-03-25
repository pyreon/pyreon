import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { _reset, _toasts, toast } from "../toast"

/** Helper — get toast at index with non-null assertion (tests verify length first). */
function at(index: number) {
  const t = _toasts()[index]
  if (!t) throw new Error(`No toast at index ${index}`)
  return t
}

beforeEach(() => {
  _reset()
})

afterEach(() => {
  _reset()
})

describe("toast()", () => {
  it("adds a toast to the stack", () => {
    toast("Hello")
    expect(_toasts().length).toBe(1)
    expect(at(0).message).toBe("Hello")
  })

  it("returns the toast id", () => {
    const id = toast("Hello")
    expect(typeof id).toBe("string")
    expect(id).toMatch(/^pyreon-toast-/)
  })

  it("defaults to type info", () => {
    toast("Hello")
    expect(at(0).type).toBe("info")
  })

  it("defaults dismissible to true", () => {
    toast("Hello")
    expect(at(0).dismissible).toBe(true)
  })

  it("respects custom options", () => {
    toast("Hello", { type: "error", duration: 0, dismissible: false })
    const t = at(0)
    expect(t.type).toBe("error")
    expect(t.duration).toBe(0)
    expect(t.dismissible).toBe(false)
  })
})

describe("toast.success/error/warning/info", () => {
  it("toast.success sets type to success", () => {
    toast.success("Done")
    expect(at(0).type).toBe("success")
  })

  it("toast.error sets type to error", () => {
    toast.error("Failed")
    expect(at(0).type).toBe("error")
  })

  it("toast.warning sets type to warning", () => {
    toast.warning("Watch out")
    expect(at(0).type).toBe("warning")
  })

  it("toast.info sets type to info", () => {
    toast.info("FYI")
    expect(at(0).type).toBe("info")
  })
})

describe("toast.dismiss", () => {
  it("removes a specific toast by id", () => {
    const id1 = toast("First")
    toast("Second")
    expect(_toasts().length).toBe(2)

    toast.dismiss(id1)
    expect(_toasts().length).toBe(1)
    expect(at(0).message).toBe("Second")
  })

  it("clears all toasts when no id is given", () => {
    toast("First")
    toast("Second")
    toast("Third")
    expect(_toasts().length).toBe(3)

    toast.dismiss()
    expect(_toasts().length).toBe(0)
  })

  it("is a no-op for unknown id", () => {
    toast("Hello")
    toast.dismiss("unknown-id")
    expect(_toasts().length).toBe(1)
  })

  it("calls onDismiss callback when dismissing by id", () => {
    const onDismiss = vi.fn()
    const id = toast("Hello", { onDismiss })
    toast.dismiss(id)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it("calls onDismiss for all toasts when dismissing all", () => {
    const onDismiss1 = vi.fn()
    const onDismiss2 = vi.fn()
    toast("First", { onDismiss: onDismiss1 })
    toast("Second", { onDismiss: onDismiss2 })
    toast.dismiss()
    expect(onDismiss1).toHaveBeenCalledOnce()
    expect(onDismiss2).toHaveBeenCalledOnce()
  })
})

describe("auto-dismiss", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("auto-dismisses after default duration (4000ms)", () => {
    toast("Hello")
    expect(_toasts().length).toBe(1)

    vi.advanceTimersByTime(3999)
    expect(_toasts().length).toBe(1)

    vi.advanceTimersByTime(1)
    expect(_toasts().length).toBe(0)
  })

  it("auto-dismisses after custom duration", () => {
    toast("Hello", { duration: 2000 })

    vi.advanceTimersByTime(1999)
    expect(_toasts().length).toBe(1)

    vi.advanceTimersByTime(1)
    expect(_toasts().length).toBe(0)
  })

  it("does not auto-dismiss when duration is 0", () => {
    toast("Persistent", { duration: 0 })

    vi.advanceTimersByTime(10000)
    expect(_toasts().length).toBe(1)
  })
})

describe("toast.promise", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("creates a loading toast that updates on resolve", async () => {
    const promise = Promise.resolve("data")

    toast.promise(promise, {
      loading: "Loading...",
      success: "Done!",
      error: "Failed",
    })

    expect(_toasts().length).toBe(1)
    expect(at(0).message).toBe("Loading...")
    expect(at(0).type).toBe("info")
    expect(at(0).duration).toBe(0) // persistent while loading

    await promise
    // Flush microtasks
    await vi.advanceTimersByTimeAsync(0)

    expect(_toasts().length).toBe(1)
    expect(at(0).message).toBe("Done!")
    expect(at(0).type).toBe("success")
  })

  it("creates a loading toast that updates on reject", async () => {
    const promise = Promise.reject(new Error("oops"))

    // Prevent unhandled rejection
    toast
      .promise(promise, {
        loading: "Loading...",
        success: "Done!",
        error: "Failed",
      })
      .catch(() => {})

    expect(at(0).message).toBe("Loading...")

    try {
      await promise
    } catch {
      // expected
    }

    await vi.advanceTimersByTimeAsync(0)

    expect(_toasts().length).toBe(1)
    expect(at(0).message).toBe("Failed")
    expect(at(0).type).toBe("error")
  })

  it("supports function form for success/error messages", async () => {
    const promise = Promise.resolve(42)

    toast.promise(promise, {
      loading: "Calculating...",
      success: (data) => `Result: ${data}`,
      error: (err) => `Error: ${err}`,
    })

    await promise
    await vi.advanceTimersByTimeAsync(0)

    expect(at(0).message).toBe("Result: 42")
  })

  it("returns the original promise", async () => {
    const promise = Promise.resolve("value")
    const result = toast.promise(promise, {
      loading: "Loading...",
      success: "Done!",
      error: "Failed",
    })

    expect(await result).toBe("value")
  })
})

describe("Toaster renders", () => {
  it("Toaster is a function component", async () => {
    const { Toaster } = await import("../toaster")
    expect(typeof Toaster).toBe("function")
  })
})
