import { effectScope, setContextOwner } from '@pyreon/reactivity'
import { dispatchToErrorBoundary, nearestErrorBoundary, runWithHooks } from '../component'
import { ErrorBoundary } from '../error-boundary'
import { h } from '../h'
import type { VNodeChild } from '../types'

describe('ErrorBoundary', () => {
  // A boundary provides its handler on the context owner (the component tree),
  // so each test runs under a fresh owner: nothing outlives the test.
  let prevOwner: ReturnType<typeof setContextOwner> = null
  beforeEach(() => {
    prevOwner = setContextOwner(effectScope())
  })
  afterEach(() => {
    setContextOwner(prevOwner)
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

  test('provides its handler on its owner instead of a module-level registration', () => {
    const { hooks } = runWithHooks(() => {
      ErrorBoundary({
        fallback: (err) => `Error: ${err}`,
        children: 'child',
      })
      return null
    }, {})
    // Nothing to unregister on unmount: the handler dies with the owner scope.
    expect(hooks.unmount).toBeNull()
    expect(nearestErrorBoundary()).toBeTypeOf('function')
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

  test('a throw outside the boundary\'s owner subtree does not reach it', () => {
    // The boundary's handler is visible only below its owner. A sibling (an
    // owner that is not a descendant) resolves no boundary, where the old
    // module-level stack returned whichever boundary mounted last.
    runWithHooks(() => ErrorBoundary({ fallback: (e) => `fb:${String(e)}`, children: 'c' }), {})
    expect(dispatchToErrorBoundary('inside')).toBe(true)
    setContextOwner(effectScope())
    expect(dispatchToErrorBoundary('sibling')).toBe(false)
  })
})
