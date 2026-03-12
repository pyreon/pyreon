import { signal } from "../signal"
import { watch } from "../watch"

describe("watch", () => {
  test("calls callback when source changes", () => {
    const s = signal(1)
    const calls: Array<[number, number | undefined]> = []

    watch(
      () => s(),
      (newVal, oldVal) => {
        calls.push([newVal, oldVal])
      },
    )

    expect(calls.length).toBe(0) // not called on first run without immediate

    s.set(2)
    expect(calls).toEqual([[2, 1]])

    s.set(3)
    expect(calls).toEqual([
      [2, 1],
      [3, 2],
    ])
  })

  test("immediate option calls callback on first run", () => {
    const s = signal(1)
    const calls: Array<[number, number | undefined]> = []

    watch(
      () => s(),
      (newVal, oldVal) => {
        calls.push([newVal, oldVal])
      },
      { immediate: true },
    )

    expect(calls).toEqual([[1, undefined]])
  })

  test("stop function disposes the watcher", () => {
    const s = signal(1)
    let callCount = 0

    const stop = watch(
      () => s(),
      () => {
        callCount++
      },
    )

    s.set(2)
    expect(callCount).toBe(1)

    stop()

    s.set(3)
    expect(callCount).toBe(1) // no more calls
  })

  test("cleanup function is called before each re-run", () => {
    const s = signal(1)
    const log: string[] = []

    watch(
      () => s(),
      (newVal) => {
        log.push(`run-${newVal}`)
        return () => log.push(`cleanup-${newVal}`)
      },
    )

    s.set(2)
    expect(log).toEqual(["run-2"])

    s.set(3)
    expect(log).toEqual(["run-2", "cleanup-2", "run-3"])
  })

  test("cleanup function from immediate is called on next change", () => {
    const s = signal(1)
    const log: string[] = []

    watch(
      () => s(),
      (newVal) => {
        log.push(`run-${newVal}`)
        return () => log.push(`cleanup-${newVal}`)
      },
      { immediate: true },
    )

    expect(log).toEqual(["run-1"])

    s.set(2)
    expect(log).toEqual(["run-1", "cleanup-1", "run-2"])
  })

  test("cleanup is called on stop", () => {
    const s = signal(1)
    const log: string[] = []

    const stop = watch(
      () => s(),
      (newVal) => {
        log.push(`run-${newVal}`)
        return () => log.push(`cleanup-${newVal}`)
      },
    )

    s.set(2)
    expect(log).toEqual(["run-2"])

    stop()
    expect(log).toEqual(["run-2", "cleanup-2"])
  })

  test("callback returning non-function does not set cleanup", () => {
    const s = signal(1)
    let callCount = 0

    watch(
      () => s(),
      () => {
        callCount++
        // returns void, not a function
      },
    )

    s.set(2)
    s.set(3)
    expect(callCount).toBe(2)
  })

  test("stop without cleanup does not throw", () => {
    const s = signal(1)
    const stop = watch(
      () => s(),
      () => {},
    )

    stop() // no cleanup function was set, should not throw
  })
})
