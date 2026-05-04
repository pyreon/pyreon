import { dispatchToErrorBoundary, popErrorBoundary, runWithHooks } from '../component'
import { ErrorBoundary } from '../error-boundary'
import { h } from '../h'
import type { VNodeChild } from '../types'

describe('ErrorBoundary', () => {
  // Clean up error boundary stack after each test
  afterEach(() => {
    // Pop all boundaries that tests may have left
    while (dispatchToErrorBoundary('cleanup')) {
      popErrorBoundary()
    }
  })

  test('is a function', () => {
    expect(typeof ErrorBoundary).toBe('function')
  })

  test('returns a reactive getter', () => {
    let result: VNodeChild = null
    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (err) => `Error: ${err}`,
        children: 'child',
      })
      return null
    }, {})
    expect(typeof result).toBe('function')
  })

  test('renders children when no error', () => {
    let result: VNodeChild = null
    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (err) => `Error: ${err}`,
        children: 'child content',
      })
      return null
    }, {})
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe('child content')
  })

  test('renders function children by calling them', () => {
    let result: VNodeChild = null
    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (err) => `Error: ${err}`,
        children: () => 'dynamic child',
      })
      return null
    }, {})
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe('dynamic child')
  })

  test('renders VNode children', () => {
    let result: VNodeChild = null
    const child = h('div', null, 'content')
    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (err) => `Error: ${err}`,
        children: child,
      })
      return null
    }, {})
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe(child)
  })

  test('registers unmount cleanup hook', () => {
    const { hooks } = runWithHooks(() => {
      ErrorBoundary({
        fallback: (err) => `Error: ${err}`,
        children: 'child',
      })
      return null
    }, {})
    expect(hooks.unmount!.length).toBeGreaterThanOrEqual(1)
  })

  test('warns when fallback is not a function', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    runWithHooks(() => {
      ErrorBoundary({
        fallback: 'not-a-function' as unknown as (err: unknown, reset: () => void) => VNodeChild,
        children: 'child',
      })
      return null
    }, {})
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('<ErrorBoundary>'))
    warnSpy.mockRestore()
  })

  // Helper: flush a queued microtask so the deferred `error.set` lands. The
  // boundary's handler defers the signal write via queueMicrotask — see the
  // queueMicrotask comment in `error-boundary.ts` for the rationale. Tests
  // that read the getter after dispatch need to await the microtask first.
  const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve))

  test('dispatched error triggers fallback rendering', async () => {
    let result: VNodeChild = null
    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (err) => `Caught: ${err}`,
        children: 'normal',
      })
      return null
    }, {})
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe('normal')

    dispatchToErrorBoundary(new Error('boom'))
    await flushMicrotasks()
    expect(getter()).toBe('Caught: Error: boom')
  })

  test('fallback receives reset function that clears error', async () => {
    let result: VNodeChild = null
    let capturedReset: (() => void) | undefined
    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (_err, reset) => {
          capturedReset = reset
          return 'error-ui'
        },
        children: 'child',
      })
      return null
    }, {})
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe('child')

    dispatchToErrorBoundary('test-error')
    await flushMicrotasks()
    expect(getter()).toBe('error-ui')
    expect(capturedReset).toBeDefined()

    capturedReset?.()
    expect(getter()).toBe('child')
  })

  test('second error while already in error state is not handled', () => {
    let result: VNodeChild = null
    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (err) => `Error: ${err}`,
        children: 'child',
      })
      return null
    }, {})

    // First error handled — handler returns true synchronously even though
    // the signal write is deferred. The synchronous `handling` flag is what
    // gates the second-dispatch shortcut.
    expect(dispatchToErrorBoundary('first')).toBe(true)

    // Second error not handled (already handling) — flag is set
    // synchronously from the first dispatch, so this is short-circuited
    // BEFORE the first dispatch's microtask flushes.
    expect(dispatchToErrorBoundary('second')).toBe(false)
  })

  test('after reset, new error can be caught again', async () => {
    let result: VNodeChild = null
    let capturedReset: (() => void) | undefined
    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (err, reset) => {
          capturedReset = reset
          return `Error: ${err}`
        },
        children: 'child',
      })
      return null
    }, {})
    const getter = result as unknown as () => VNodeChild

    dispatchToErrorBoundary('first-error')
    await flushMicrotasks()
    expect(getter()).toBe('Error: first-error')

    capturedReset?.()
    expect(getter()).toBe('child')

    // Can catch new error after reset
    expect(dispatchToErrorBoundary('second-error')).toBe(true)
    await flushMicrotasks()
    expect(getter()).toBe('Error: second-error')
  })

  // Regression: the handler must defer `error.set(err)` to a microtask, not
  // call it inline. The inline path was silently dropped by the batch flush's
  // same-effect dedup when the boundary's mountReactive run was the only
  // subscriber currently being iterated — Set.add for an already-visited
  // entry is a no-op, so the notification was lost and the fallback never
  // mounted. After the fix, the boundary's getter still returns 'child'
  // synchronously after dispatch (the signal hasn't been written yet), and
  // returns the error UI on the next microtask tick. This test exercises
  // the deferral contract directly without spinning up mountReactive +
  // happy-dom, mirroring the real-Chromium e2e in `e2e/primitives.spec.ts`.
  test('handler defers error.set to a microtask (avoids batch flush dedup drop)', async () => {
    let result: VNodeChild = null
    runWithHooks(() => {
      result = ErrorBoundary({
        fallback: (err) => `Error: ${err}`,
        children: 'child',
      })
      return null
    }, {})
    const getter = result as unknown as () => VNodeChild

    expect(getter()).toBe('child')

    // Synchronously dispatching does NOT immediately update the boundary's
    // signal — the write is queued via queueMicrotask. The getter returns
    // the un-errored state until the microtask flushes.
    expect(dispatchToErrorBoundary('boom')).toBe(true)
    expect(getter()).toBe('child')

    // After a microtask flush, the deferred signal write has landed and the
    // boundary returns the fallback.
    await flushMicrotasks()
    expect(getter()).toBe('Error: boom')
  })
})
