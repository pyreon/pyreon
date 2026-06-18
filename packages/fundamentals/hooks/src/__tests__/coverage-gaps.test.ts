/**
 * Targeted coverage for cleanup-callback bodies and in-process branches
 * that existing tests don't reach. The cleanup bodies registered via
 * `onCleanup` / `onUnmount` only run when a real component unmounts;
 * sibling tests mock those primitives as no-ops, so the bodies never
 * execute. Here we capture the registered callbacks and invoke them
 * directly, asserting the cleanup side-effect actually happened.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let cleanupCallbacks: Array<() => void> = []
let unmountCallbacks: Array<() => void> = []

vi.mock('@pyreon/core', async () => {
  const actual = await vi.importActual<typeof import('@pyreon/core')>('@pyreon/core')
  return {
    ...actual,
    onMount: (fn: () => unknown) => fn(),
    onUnmount: (fn: () => void) => {
      unmountCallbacks.push(fn)
    },
  }
})

vi.mock('@pyreon/reactivity', async () => {
  const real = await vi.importActual<typeof import('@pyreon/reactivity')>('@pyreon/reactivity')
  return {
    ...real,
    onCleanup: (fn: () => void) => {
      cleanupCallbacks.push(fn)
    },
  }
})

beforeEach(() => {
  cleanupCallbacks = []
  unmountCallbacks = []
})

afterEach(() => {
  for (const cb of cleanupCallbacks.splice(0)) cb()
  for (const cb of unmountCallbacks.splice(0)) cb()
  vi.useRealTimers()
})

describe('useClipboard — onCleanup clears a pending reset timer', () => {
  it('clears the copied-reset timeout on cleanup', async () => {
    const writeText = vi.fn(async () => {})
    const original = globalThis.navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
      writable: true,
    })
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    try {
      const { useClipboard } = await import('../useClipboard')
      const cb = useClipboard({ timeout: 5000 })
      // A successful copy arms the reset timer.
      await cb.copy('hi')
      expect(cb.copied()).toBe(true)
      clearSpy.mockClear()
      // onCleanup body must clear the armed timer (the `if (timer)` true path).
      for (const fn of cleanupCallbacks.splice(0)) fn()
      expect(clearSpy).toHaveBeenCalled()
    } finally {
      clearSpy.mockRestore()
      Object.defineProperty(globalThis, 'navigator', {
        value: original,
        configurable: true,
        writable: true,
      })
    }
  })

  it('cleanup is a safe no-op when no copy ever armed a timer (false arm)', async () => {
    const { useClipboard } = await import('../useClipboard')
    useClipboard()
    // No copy() → timer stays undefined → `if (timer)` takes the false arm.
    expect(() => {
      for (const fn of cleanupCallbacks.splice(0)) fn()
    }).not.toThrow()
  })
})

describe('useDialog — onCleanup removes the bound close listener', () => {
  it('removeEventListener fires on cleanup when an element is bound', async () => {
    const { useDialog } = await import('../useDialog')
    const dialog = useDialog()
    const el = document.createElement('dialog')
    const removeSpy = vi.spyOn(el, 'removeEventListener')
    // Bind the element through the ref (registers the close listener).
    dialog.ref(el as HTMLDialogElement)
    // onCleanup body: dialogEl && closeHandler are both set → removeEventListener.
    for (const fn of cleanupCallbacks.splice(0)) fn()
    expect(removeSpy).toHaveBeenCalledWith('close', expect.any(Function))
  })

  it('cleanup is a safe no-op when no element was ever bound (false arm)', async () => {
    const { useDialog } = await import('../useDialog')
    useDialog()
    // No ref(el) call → dialogEl stays null → `if (dialogEl && closeHandler)` false.
    expect(() => {
      for (const fn of cleanupCallbacks.splice(0)) fn()
    }).not.toThrow()
  })
})

describe('useFetch — onCleanup aborts the in-flight controller', () => {
  it('aborts the active AbortController on cleanup', async () => {
    let lastSignal: AbortSignal | undefined
    const realFetch = globalThis.fetch
    globalThis.fetch = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => {
      lastSignal = init?.signal ?? undefined
      // Never resolves — leaves the controller in flight so cleanup can abort it.
      return new Promise<Response>(() => {})
    }) as typeof fetch
    try {
      const { useFetch } = await import('../useFetch')
      useFetch<unknown>('/api/pending')
      expect(lastSignal?.aborted).toBe(false)
      // onCleanup body: controller?.abort()
      for (const fn of cleanupCallbacks.splice(0)) fn()
      expect(lastSignal?.aborted).toBe(true)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('useScrollLock — onUnmount unlocks an active lock', () => {
  it('restores body overflow when unmounting while locked', async () => {
    const { useScrollLock } = await import('../useScrollLock')
    document.body.style.overflow = ''
    const { lock } = useScrollLock()
    lock()
    expect(document.body.style.overflow).toBe('hidden')
    // onUnmount body: isLocked is true → unlock()
    for (const fn of unmountCallbacks.splice(0)) fn()
    expect(document.body.style.overflow).toBe('')
  })

  it('unmount is a safe no-op when lock() was never called (false arm)', async () => {
    const { useScrollLock } = await import('../useScrollLock')
    useScrollLock()
    // No lock() → isLocked stays false → `if (isLocked)` takes the false arm.
    expect(() => {
      for (const fn of unmountCallbacks.splice(0)) fn()
    }).not.toThrow()
  })
})

describe('useDebouncedCallback — cancel() with no pending timer', () => {
  it('cancel() is a no-op when no call is in flight (if (timer != null) false arm)', async () => {
    const { useDebouncedCallback } = await import('../useDebouncedCallback')
    const fn = vi.fn()
    const debounced = useDebouncedCallback(fn, 100)
    // No debounced(...) call yet → timer is null → cancel() takes the false arm.
    expect(() => debounced.cancel()).not.toThrow()
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('useTimeAgo — disposed guard skips a fired tick', () => {
  it('a timer that fires after disposal returns early (if (disposed) return)', async () => {
    vi.useFakeTimers()
    const { useTimeAgo } = await import('../useTimeAgo')
    // A time >1min ago so the first tick reschedules with a 30s interval.
    const fiveMinAgo = Date.now() - 5 * 60 * 1000
    const result = useTimeAgo(fiveMinAgo)
    // Fire the initial setTimeout(tick, 0) → tick reschedules a second timer.
    vi.advanceTimersByTime(0)
    const firstValue = result()
    expect(typeof firstValue).toBe('string')

    // Run cleanup to set `disposed = true`, but neutralize clearTimeout so the
    // already-scheduled tick still fires — exercising the `if (disposed) return`
    // guard that protects against a late timer callback.
    const realClear = globalThis.clearTimeout
    globalThis.clearTimeout = (() => {}) as typeof clearTimeout
    try {
      for (const fn of cleanupCallbacks.splice(0)) fn()
    } finally {
      globalThis.clearTimeout = realClear
    }

    // The next scheduled tick fires while disposed → returns before set().
    const before = result()
    vi.advanceTimersByTime(60_000)
    // Value unchanged because the tick returned at the disposed guard.
    expect(result()).toBe(before)
  })
})
