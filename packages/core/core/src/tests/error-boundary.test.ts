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

  test('dispatched error triggers fallback rendering', () => {
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
    expect(getter()).toBe('Caught: Error: boom')
  })

  test('fallback receives reset function that clears error', () => {
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
    const getter = result as unknown as () => VNodeChild

    // First error handled
    expect(dispatchToErrorBoundary('first')).toBe(true)
    expect(getter()).toBe('Error: first')

    // Second error not handled (already in error state)
    expect(dispatchToErrorBoundary('second')).toBe(false)
    // Still showing first error
    expect(getter()).toBe('Error: first')
  })

  test('after reset, new error can be caught again', () => {
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
    expect(getter()).toBe('Error: first-error')

    capturedReset?.()
    expect(getter()).toBe('child')

    // Can catch new error after reset
    expect(dispatchToErrorBoundary('second-error')).toBe(true)
    expect(getter()).toBe('Error: second-error')
  })

  test('onUnmount pops its own boundary (identity cleanup)', () => {
    // The boundary registers `onUnmount(() => popErrorBoundary(handler))` so a
    // renderer-driven unmount removes THIS boundary's handler by identity (the
    // #725-class sibling-order fix). `runWithHooks` returns the collected hooks,
    // so we can fire the unmount cleanup node-side without a renderer.
    const { hooks } = runWithHooks(
      () => ErrorBoundary({ fallback: (e) => `fb:${String(e)}`, children: 'c' }),
      {},
    )
    // Mounted → the handler is on the stack and catches.
    expect(dispatchToErrorBoundary('boom')).toBe(true)
    // Exactly one unmount cleanup was registered.
    expect(hooks.unmount).toHaveLength(1)
    // Fire it → popErrorBoundary(handler) removes this boundary.
    for (const fn of hooks.unmount!) fn()
    // Popped → nothing left to catch.
    expect(dispatchToErrorBoundary('after')).toBe(false)
  })
})
