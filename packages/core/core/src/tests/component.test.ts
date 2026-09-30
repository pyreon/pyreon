import { onCleanup } from '@pyreon/reactivity'
import {
  defineComponent,
  dispatchToErrorBoundary,
  popErrorBoundary,
  propagateError,
  pushErrorBoundary,
  runWithHooks,
} from '../component'
import { h } from '../h'
import { onErrorCaptured, onMount, onUnmount, onUpdate } from '../lifecycle'
import type { ComponentFn, LifecycleHooks, VNode } from '../types'

describe('defineComponent', () => {
  test('returns the exact same function (identity)', () => {
    const fn: ComponentFn = () => h('div', null)
    expect(defineComponent(fn)).toBe(fn)
  })

  test('preserves typed props', () => {
    const Comp = defineComponent<{ count: number }>((props) => {
      return h('span', null, String(props.count))
    })
    const node = Comp({ count: 10 })
    expect((node as VNode).type).toBe('span')
  })
})

describe('runWithHooks', () => {
  test('captures all lifecycle hook types', () => {
    const mountFn = () => undefined
    const unmountFn = () => {}
    const updateFn = () => {}
    const errorFn = () => true

    const Comp: ComponentFn = () => {
      onMount(mountFn)
      onUnmount(unmountFn)
      onUpdate(updateFn)
      onErrorCaptured(errorFn)
      return h('div', null)
    }

    const { vnode, hooks } = runWithHooks(Comp, {})
    expect(vnode).not.toBeNull()
    expect(hooks.mount).toContain(mountFn)
    expect(hooks.unmount).toContain(unmountFn)
    expect(hooks.update).toContain(updateFn)
    expect(hooks.error).toContain(errorFn)
  })

  test('returns null vnode for component returning null', () => {
    const { vnode } = runWithHooks(() => null, {})
    expect(vnode).toBeNull()
  })

  test('returns string vnode for component returning string', () => {
    const { vnode } = runWithHooks(() => 'hello', {})
    expect(vnode).toBe('hello')
  })

  test('clears hooks context after execution', () => {
    const Comp: ComponentFn = () => h('div', null)
    runWithHooks(Comp, {})
    // After runWithHooks, lifecycle hooks should be no-ops
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onMount(() => {})
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  test('clears hooks context even when component throws', () => {
    const Comp: ComponentFn = () => {
      throw new Error('boom')
    }
    expect(() => runWithHooks(Comp, {})).toThrow('boom')
    // Should still be cleared
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onMount(() => {})
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  test('passes props to component function', () => {
    let received: unknown = null
    runWithHooks(
      ((props: { msg: string }) => {
        received = props
        return null
      }) as ComponentFn,
      { msg: 'hello' },
    )
    expect(received).toEqual({ msg: 'hello' })
  })

  test('captures multiple hooks of same type', () => {
    const Comp: ComponentFn = () => {
      onMount(() => undefined)
      onMount(() => undefined)
      onUnmount(() => {})
      onUnmount(() => {})
      return null
    }
    const { hooks } = runWithHooks(Comp, {})
    expect(hooks.mount).toHaveLength(2)
    expect(hooks.unmount).toHaveLength(2)
  })

  test('populates hooks.unmount from onCleanup() alone when no onUnmount() was registered', () => {
    // The `hooks.unmount === null` TRUE branch: a component that ONLY uses
    // onCleanup() (no explicit onUnmount() call) must still end up with a
    // populated hooks.unmount, assigned directly from the collected array
    // (not merged into an existing one, since there isn't one).
    const ran: string[] = []
    const Comp: ComponentFn = () => {
      onCleanup(() => ran.push('cleanup-only'))
      return null
    }
    const { hooks } = runWithHooks(Comp, {})
    expect(hooks.unmount).toHaveLength(1)
    hooks.unmount![0]!()
    expect(ran).toEqual(['cleanup-only'])
  })

  test('appends onCleanup()-collected cleanups to an EXISTING hooks.unmount array', () => {
    // A component that calls onUnmount() directly AND uses a reactive
    // primitive backed by onCleanup() (e.g. a store/signal created during
    // setup) needs both to survive on hooks.unmount. runWithHooks's finally
    // block branches on whether hooks.unmount is already non-null (an
    // explicit onUnmount ran first) — if it is, the onCleanup()-collected
    // cleanups must be APPENDED, not used to replace the array (which would
    // silently drop the explicit onUnmount() cleanup).
    const order: string[] = []
    const explicitUnmount = () => order.push('explicit')
    const viaOnCleanup = () => order.push('via-onCleanup')

    const Comp: ComponentFn = () => {
      // Registers hooks.unmount = [explicitUnmount] FIRST, so it is
      // non-null by the time the cleanup frame closes.
      onUnmount(explicitUnmount)
      // onCleanup() is collected into the setup's cleanup window and
      // merged into hooks.unmount in runWithHooks's `finally`.
      onCleanup(viaOnCleanup)
      return null
    }

    const { hooks } = runWithHooks(Comp, {})
    expect(hooks.unmount).toHaveLength(2)
    expect(hooks.unmount).toContain(explicitUnmount)
    expect(hooks.unmount).toContain(viaOnCleanup)

    // Both must actually run on "unmount" (i.e. when the caller invokes the
    // collected cleanups) — proves the merge kept both callables live,
    // not just present-by-reference in a way that never gets called.
    for (const cleanup of hooks.unmount!) cleanup()
    expect(order.sort()).toEqual(['explicit', 'via-onCleanup'].sort())
  })

  test('null hooks when component registers none (lazy allocation)', () => {
    const { hooks } = runWithHooks(() => h('div', null), {})
    expect(hooks.mount).toBeNull()
    expect(hooks.unmount).toBeNull()
    expect(hooks.update).toBeNull()
    expect(hooks.error).toBeNull()
  })
})

describe('propagateError', () => {
  test('returns true when handler returns true', () => {
    const hooks: LifecycleHooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [() => true],
    }
    expect(propagateError(new Error('test'), hooks)).toBe(true)
  })

  test('returns false when no handlers', () => {
    const hooks: LifecycleHooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [],
    }
    expect(propagateError(new Error('test'), hooks)).toBe(false)
  })

  test('returns false when handler returns undefined', () => {
    const hooks: LifecycleHooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [() => undefined],
    }
    expect(propagateError(new Error('test'), hooks)).toBe(false)
  })

  test('stops at first handler returning true', () => {
    let secondCalled = false
    const hooks: LifecycleHooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [
        () => true,
        () => {
          secondCalled = true
          return true
        },
      ],
    }
    expect(propagateError('err', hooks)).toBe(true)
    expect(secondCalled).toBe(false)
  })

  test('continues to next handler when first returns undefined', () => {
    const calls: number[] = []
    const hooks: LifecycleHooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [
        () => {
          calls.push(1)
          return undefined
        },
        () => {
          calls.push(2)
          return true
        },
      ],
    }
    expect(propagateError('err', hooks)).toBe(true)
    expect(calls).toEqual([1, 2])
  })

  test('passes the error to each handler', () => {
    const errors: unknown[] = []
    const hooks: LifecycleHooks = {
      mount: [],
      unmount: [],
      update: [],
      error: [
        (err) => {
          errors.push(err)
          return undefined
        },
        (err) => {
          errors.push(err)
          return true
        },
      ],
    }
    const testErr = new Error('propagated')
    propagateError(testErr, hooks)
    expect(errors).toEqual([testErr, testErr])
  })
})

describe('pushErrorBoundary / popErrorBoundary / dispatchToErrorBoundary', () => {
  afterEach(() => {
    // Clean up any leftover boundaries — pop until empty
    // dispatchToErrorBoundary returns false when stack is empty
    while (dispatchToErrorBoundary('cleanup-probe')) {
      popErrorBoundary()
    }
  })

  test('dispatches to the most recently pushed boundary', () => {
    let caught: unknown = null
    pushErrorBoundary((err) => {
      caught = err
      return true
    })
    expect(dispatchToErrorBoundary('test-error')).toBe(true)
    expect(caught).toBe('test-error')
    popErrorBoundary()
  })

  test('returns false when no boundary is registered', () => {
    expect(dispatchToErrorBoundary('no-boundary')).toBe(false)
  })

  test('nested boundaries — innermost catches first', () => {
    const caught: string[] = []
    pushErrorBoundary((err) => {
      caught.push(`outer: ${err}`)
      return true
    })
    pushErrorBoundary((err) => {
      caught.push(`inner: ${err}`)
      return true
    })
    dispatchToErrorBoundary('test')
    expect(caught).toEqual(['inner: test'])
    popErrorBoundary()

    // After popping inner, outer should catch
    dispatchToErrorBoundary('test2')
    expect(caught).toEqual(['inner: test', 'outer: test2'])
    popErrorBoundary()
  })

  test('boundary handler returning false does not propagate to outer', () => {
    // dispatchToErrorBoundary only calls the innermost handler
    let outerCalled = false
    pushErrorBoundary(() => {
      outerCalled = true
      return true
    })
    pushErrorBoundary(() => false)
    const result = dispatchToErrorBoundary('test')
    expect(result).toBe(false)
    expect(outerCalled).toBe(false) // outer not called — only innermost is checked
    popErrorBoundary()
    popErrorBoundary()
  })

  test('push and pop maintain stack correctly', () => {
    const results: boolean[] = []
    pushErrorBoundary(() => true)
    pushErrorBoundary(() => true)
    pushErrorBoundary(() => true)
    popErrorBoundary()
    popErrorBoundary()
    results.push(dispatchToErrorBoundary('x'))
    popErrorBoundary()
    results.push(dispatchToErrorBoundary('y'))
    expect(results).toEqual([true, false])
  })
})
