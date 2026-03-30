import { effect, onCleanup, renderEffect, setErrorHandler } from "../effect"
import { effectScope, setCurrentScope } from "../scope"
import { signal } from "../signal"

describe("effect", () => {
  test("runs immediately", () => {
    let ran = false
    effect(() => {
      ran = true
    })
    expect(ran).toBe(true)
  })

  test("re-runs when tracked signal changes", () => {
    const s = signal(0)
    let count = 0
    effect(() => {
      s() // track
      count++
    })
    expect(count).toBe(1)
    s.set(1)
    expect(count).toBe(2)
    s.set(2)
    expect(count).toBe(3)
  })

  test("does not re-run after dispose", () => {
    const s = signal(0)
    let count = 0
    const e = effect(() => {
      s()
      count++
    })
    e.dispose()
    s.set(1)
    expect(count).toBe(1) // only the initial run
  })

  test("tracks multiple signals", () => {
    const a = signal(1)
    const b = signal(2)
    let result = 0
    effect(() => {
      result = a() + b()
    })
    expect(result).toBe(3)
    a.set(10)
    expect(result).toBe(12)
    b.set(20)
    expect(result).toBe(30)
  })

  test("does not track signals accessed after conditional branch", () => {
    const toggle = signal(true)
    const a = signal(1)
    const b = signal(100)
    let result = 0
    effect(() => {
      result = toggle() ? a() : b()
    })
    expect(result).toBe(1)
    a.set(2)
    expect(result).toBe(2)
    toggle.set(false)
    expect(result).toBe(100)
    // a is no longer tracked
    a.set(999)
    expect(result).toBe(100)
  })

  test("catches errors via default error handler", () => {
    const errors: unknown[] = []
    const origError = console.error
    console.error = (...args: unknown[]) => errors.push(args)

    const s = signal(0)
    effect(() => {
      s()
      throw new Error("boom")
    })

    expect(errors.length).toBe(1)
    console.error = origError
  })

  test("calls cleanup before re-run", () => {
    const s = signal(0)
    let cleanups = 0
    effect(() => {
      s()
      return () => {
        cleanups++
      }
    })
    expect(cleanups).toBe(0)
    s.set(1) // re-run: previous cleanup fires
    expect(cleanups).toBe(1)
    s.set(2)
    expect(cleanups).toBe(2)
  })

  test("calls cleanup on dispose", () => {
    const s = signal(0)
    let cleanups = 0
    const e = effect(() => {
      s()
      return () => {
        cleanups++
      }
    })
    expect(cleanups).toBe(0)
    e.dispose()
    expect(cleanups).toBe(1)
    // Disposing again should not call cleanup again
    e.dispose()
    expect(cleanups).toBe(1)
  })

  test("cleanup errors are caught by error handler", () => {
    const caught: unknown[] = []
    setErrorHandler((err) => caught.push(err))

    const s = signal(0)
    effect(() => {
      s()
      return () => {
        throw new Error("cleanup boom")
      }
    })
    s.set(1) // triggers cleanup which throws
    expect(caught.length).toBe(1)
    expect((caught[0] as Error).message).toBe("cleanup boom")

    // Restore default handler
    setErrorHandler((_err) => {})
  })

  test("works with no cleanup return (backwards compatible)", () => {
    const s = signal(0)
    let count = 0
    effect(() => {
      s()
      count++
      // no return
    })
    expect(count).toBe(1)
    s.set(1)
    expect(count).toBe(2)
  })

  test("setErrorHandler replaces the error handler", () => {
    const caught: unknown[] = []
    setErrorHandler((err) => caught.push(err))

    const s = signal(0)
    effect(() => {
      s()
      throw new Error("custom")
    })

    expect(caught.length).toBe(1)
    expect((caught[0] as Error).message).toBe("custom")

    // Restore default handler
    setErrorHandler((_err) => {})
  })

  test("effect notifies scope on re-run (not first run)", async () => {
    const scope = effectScope()
    setCurrentScope(scope)

    let updateCount = 0
    scope.addUpdateHook(() => {
      updateCount++
    })

    const s = signal(0)
    effect(() => {
      s()
    })

    setCurrentScope(null)

    expect(updateCount).toBe(0) // first run does not notify

    s.set(1) // re-run triggers notifyEffectRan
    await new Promise((r) => setTimeout(r, 10))
    expect(updateCount).toBe(1)

    scope.stop()
  })
})

describe("renderEffect", () => {
  test("runs immediately and tracks signals", () => {
    const s = signal(0)
    let count = 0
    renderEffect(() => {
      s()
      count++
    })
    expect(count).toBe(1)
    s.set(1)
    expect(count).toBe(2)
  })

  test("dispose stops tracking", () => {
    const s = signal(0)
    let count = 0
    const dispose = renderEffect(() => {
      s()
      count++
    })
    expect(count).toBe(1)
    dispose()
    s.set(1)
    expect(count).toBe(1)
  })

  test("dispose is idempotent", () => {
    const s = signal(0)
    const dispose = renderEffect(() => {
      s()
    })
    dispose()
    dispose() // should not throw
  })

  test("tracks dynamic dependencies", () => {
    const toggle = signal(true)
    const a = signal(1)
    const b = signal(100)
    let result = 0
    renderEffect(() => {
      result = toggle() ? a() : b()
    })
    expect(result).toBe(1)
    toggle.set(false)
    expect(result).toBe(100)
    a.set(999) // no longer tracked
    expect(result).toBe(100)
  })

  test("does not re-run after disposed during signal update", () => {
    const s = signal(0)
    let count = 0
    const dispose = renderEffect(() => {
      s()
      count++
    })
    dispose()
    s.set(5)
    expect(count).toBe(1)
  })
})

describe("onCleanup", () => {
  test("runs cleanup before effect re-runs", () => {
    const s = signal(0)
    const log: string[] = []
    effect(() => {
      const val = s()
      onCleanup(() => log.push(`cleanup-${val}`))
      log.push(`run-${val}`)
    })
    expect(log).toEqual(["run-0"])
    s.set(1)
    expect(log).toEqual(["run-0", "cleanup-0", "run-1"])
    s.set(2)
    expect(log).toEqual(["run-0", "cleanup-0", "run-1", "cleanup-1", "run-2"])
  })

  test("runs cleanup on dispose", () => {
    let cleaned = false
    const e = effect(() => {
      onCleanup(() => {
        cleaned = true
      })
    })
    expect(cleaned).toBe(false)
    e.dispose()
    expect(cleaned).toBe(true)
  })

  test("supports multiple onCleanup calls", () => {
    const s = signal(0)
    const log: string[] = []
    effect(() => {
      s()
      onCleanup(() => log.push("a"))
      onCleanup(() => log.push("b"))
    })
    s.set(1)
    expect(log).toEqual(["a", "b"])
  })

  test("works alongside return cleanup", () => {
    const s = signal(0)
    const log: string[] = []
    effect(() => {
      s()
      onCleanup(() => log.push("onCleanup"))
      return () => log.push("return")
    })
    s.set(1)
    expect(log).toEqual(["onCleanup", "return"])
  })

  test("no-ops outside effect", () => {
    // Should not throw
    onCleanup(() => {})
  })

  test("cleanup ordering: onCleanup runs before return cleanup", () => {
    const s = signal(0)
    const log: string[] = []
    effect(() => {
      const val = s()
      onCleanup(() => log.push(`onCleanup-${val}`))
      return () => log.push(`return-${val}`)
    })
    s.set(1)
    // onCleanup should fire first, then return cleanup
    expect(log).toEqual(["onCleanup-0", "return-0"])
    s.set(2)
    expect(log).toEqual(["onCleanup-0", "return-0", "onCleanup-1", "return-1"])
  })

  test("multiple onCleanup callbacks run in registration order", () => {
    const s = signal(0)
    const log: string[] = []
    effect(() => {
      s()
      onCleanup(() => log.push("first"))
      onCleanup(() => log.push("second"))
      onCleanup(() => log.push("third"))
    })
    s.set(1)
    expect(log).toEqual(["first", "second", "third"])
  })

  test("cleanup runs on dispose even when effect never re-ran", () => {
    const log: string[] = []
    const e = effect(() => {
      onCleanup(() => log.push("disposed"))
    })
    expect(log).toEqual([])
    e.dispose()
    expect(log).toEqual(["disposed"])
  })
})

describe("effect — error handling", () => {
  test("error in effect does not prevent other effects from running", () => {
    const caught: unknown[] = []
    setErrorHandler((err) => caught.push(err))

    const s = signal(0)
    let goodEffectRuns = 0

    effect(() => {
      s()
      throw new Error("bad effect")
    })
    effect(() => {
      s()
      goodEffectRuns++
    })

    expect(caught).toHaveLength(1)
    expect(goodEffectRuns).toBe(1)

    s.set(1)
    expect(caught).toHaveLength(2)
    expect(goodEffectRuns).toBe(2)

    setErrorHandler((_err) => {})
  })

  test("error during cleanup is caught by error handler", () => {
    const caught: unknown[] = []
    setErrorHandler((err) => caught.push(err))

    const s = signal(0)
    effect(() => {
      s()
      onCleanup(() => {
        throw new Error("cleanup error")
      })
    })

    s.set(1) // triggers cleanup which throws
    expect(caught).toHaveLength(1)
    expect((caught[0] as Error).message).toBe("cleanup error")

    setErrorHandler((_err) => {})
  })
})
