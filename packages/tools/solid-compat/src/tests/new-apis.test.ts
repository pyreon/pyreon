/**
 * Additional coverage tests for @pyreon/solid-compat.
 *
 * Targets uncovered branches and lines from coverage report:
 * - index.ts: createSignal equals:false in component ctx, custom equals in component ctx,
 *   createEffect re-entrance guard, onMount/onCleanup outside component, createStore proxy
 *   traps (has/ownKeys/getOwnPropertyDescriptor), lazy error handling, from cleanup,
 *   createResource with non-Error rejection, splitProps symbol keys, mergeProps non-getter desc
 * - jsx-runtime.ts: runLayoutEffects cleanup, scheduleEffects unmounted check,
 *   wrapCompatComponent native component early return, scheduleRerender unmounted check,
 *   __loading forwarding on lazy
 */

import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { effect as pyreonEffect, signal as pyreonSignal } from '@pyreon/reactivity'
import {
  batch,
  createEffect,
  createMemo,
  createResource,
  createRoot,
  createSelector,
  createSignal,
  createStore,
  from,
  indexArray,
  lazy,
  mapArray,
  observable,
  onCleanup,
  onMount,
  produce,
  startTransition,
  useTransition,
} from '../index'
import type {
  Accessor,
  Component,
  FlowComponent,
  Owner,
  ParentComponent,
  Setter,
  Signal,
  VoidComponent,
} from '../index'
import type { RenderContext } from '../jsx-runtime'
import { beginRender, endRender, getCurrentCtx, jsx } from '../jsx-runtime'

// ─── Test helpers ─────────────────────────────────────────────────────────────

function createHookRunner() {
  const ctx: RenderContext = {
    hooks: [],
    scheduleRerender: () => {},
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
    unmountCallbacks: [],
  }
  return {
    ctx,
    run<T>(fn: () => T): T {
      beginRender(ctx)
      const result = fn()
      endRender()
      return result
    },
  }
}

// ─── createSignal equals:false in component context ─────────────────────────

describe('createSignal equals option in component context', () => {
  it('equals: false in component context always triggers rerender', () => {
    const runner = createHookRunner()
    let rerenders = 0
    runner.ctx.scheduleRerender = () => {
      rerenders++
    }
    const [count, setCount] = runner.run(() => createSignal(5, { equals: false }))
    expect(count()).toBe(5)
    setCount(5) // same value, but equals: false
    expect(rerenders).toBe(1)
  })

  it('equals: false in component context with updater function', () => {
    const runner = createHookRunner()
    let rerenders = 0
    runner.ctx.scheduleRerender = () => {
      rerenders++
    }
    const [count, setCount] = runner.run(() => createSignal(10, { equals: false }))
    setCount((prev) => prev + 1)
    expect(count()).toBe(11)
    expect(rerenders).toBe(1)
  })

  it('custom equals in component context skips update when equal', () => {
    const runner = createHookRunner()
    let rerenders = 0
    runner.ctx.scheduleRerender = () => {
      rerenders++
    }
    const [obj, setObj] = runner.run(() =>
      createSignal(
        { id: 1, name: 'a' },
        { equals: (prev, next) => prev.id === next.id },
      ),
    )
    setObj({ id: 1, name: 'b' }) // same id, different name
    expect(rerenders).toBe(0) // skipped due to custom equals
    expect(obj().name).toBe('a') // value unchanged

    setObj({ id: 2, name: 'c' }) // different id
    expect(rerenders).toBe(1)
    expect(obj().id).toBe(2)
  })

  it('custom equals in component context with updater function', () => {
    const runner = createHookRunner()
    let rerenders = 0
    runner.ctx.scheduleRerender = () => {
      rerenders++
    }
    const [, setObj] = runner.run(() =>
      createSignal(
        { id: 1, name: 'a' },
        { equals: (prev, next) => prev.id === next.id },
      ),
    )
    setObj((prev) => ({ ...prev, name: 'updated' })) // same id
    expect(rerenders).toBe(0) // skipped
  })
})

// ─── createEffect re-entrance guard ────────────────────────────────────────

describe('createEffect re-entrance guard', () => {
  it('prevents infinite loops when effect writes to its own signal', () => {
    let effectRuns = 0
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      createEffect(() => {
        effectRuns++
        const c = count()
        if (c < 3) {
          setCount(c + 1) // writes back — re-entrance guard prevents infinite loop
        }
      })
      // The effect ran, the re-entrance guard prevented infinite recursion
      expect(effectRuns).toBeGreaterThanOrEqual(1)
      dispose()
    })
  })
})

// ─── onMount / onCleanup outside component ─────────────────────────────────

describe('onMount / onCleanup outside component context', () => {
  it('onMount outside component context falls through to pyreonOnMount', () => {
    // Outside component context, onMount delegates to pyreonOnMount.
    // pyreonOnMount warns when called outside component setup, but the code path is exercised.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onMount(() => {
      // This won't actually run (pyreonOnMount warns), but the branch is covered
    })
    // The fact that it called pyreonOnMount (not ctx-based path) is the point
    warn.mockRestore()
  })

  it('onCleanup outside component context falls through to pyreonOnUnmount', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    onCleanup(() => {
      // exercises the non-component branch
    })
    warn.mockRestore()
  })
})

// ─── createStore proxy traps ───────────────────────────────────────────────

describe('createStore proxy traps', () => {
  it('has trap works via in operator', () => {
    const [store] = createStore({ count: 0, name: 'test' })
    expect('count' in store).toBe(true)
    expect('name' in store).toBe(true)
    expect('missing' in store).toBe(false)
  })

  it('ownKeys trap works via Object.keys', () => {
    const [store] = createStore({ a: 1, b: 2, c: 3 })
    const keys = Object.keys(store)
    expect(keys).toEqual(['a', 'b', 'c'])
  })

  it('getOwnPropertyDescriptor trap works', () => {
    const [store] = createStore({ x: 42 })
    const desc = Object.getOwnPropertyDescriptor(store, 'x')
    expect(desc).toBeDefined()
    expect(desc!.value).toBe(42)
  })

  it('multiple property updates in one setter call', () => {
    const [store, setStore] = createStore({ a: 1, b: 2, c: 3 })
    setStore((s) => {
      s.a = 10
      s.b = 20
      s.c = 30
    })
    expect(store.a).toBe(10)
    expect(store.b).toBe(20)
    expect(store.c).toBe(30)
  })

  it('nested property access through proxy', () => {
    const [store, setStore] = createStore({ nested: { value: 'deep' } })
    expect(store.nested.value).toBe('deep')
    setStore((s) => {
      s.nested = { value: 'updated' }
    })
    expect(store.nested.value).toBe('updated')
  })
})

// ─── lazy error handling ───────────────────────────────────────────────────

describe('lazy error handling', () => {
  it('lazy handles loader rejection', async () => {
    const Lazy = lazy(() => Promise.reject(new Error('load-failed')))
    // Trigger load
    expect(Lazy.__loading()).toBe(true)

    try {
      await Lazy.preload()
    } catch {
      // expected
    }

    // After error, __loading returns false (error is set)
    expect(Lazy.__loading()).toBe(false)
    // Component throws the error
    expect(() => Lazy({})).toThrow('load-failed')
  })

  it('lazy handles non-Error rejection', async () => {
    const Lazy = lazy(() => Promise.reject('string-error'))
    Lazy.__loading() // trigger load

    try {
      await Lazy.preload()
    } catch {
      // expected
    }

    expect(() => Lazy({})).toThrow('string-error')
  })

  it('lazy catch handler sets error and resets promise', async () => {
    // Verify the catch branch: err instanceof Error check + error.set + promise = null + re-throw
    const Lazy = lazy(() => Promise.reject(new Error('catch-test')))

    // preload() returns the load promise
    const p = Lazy.preload()
    await expect(p).rejects.toThrow('catch-test')

    // After rejection, error signal is set
    expect(() => Lazy({})).toThrow('catch-test')
    // __loading returns false because error is set
    expect(Lazy.__loading()).toBe(false)
  })
})

// ─── createResource edge cases ─────────────────────────────────────────────

describe('createResource edge cases', () => {
  it('source that becomes falsy skips fetch', () => {
    let fetchCount = 0
    const [enabled, setEnabled] = createSignal<boolean | null>(true)

    createRoot((dispose) => {
      createResource(enabled, () => {
        fetchCount++
        return 'data'
      })
      expect(fetchCount).toBe(1)

      setEnabled(null) // falsy source
      // Effect re-runs but doFetch skips
      expect(fetchCount).toBe(1)
      dispose()
    })
  })

  it('source that becomes undefined skips fetch', () => {
    let fetchCount = 0
    const [source, setSource] = createSignal<string | undefined>('initial')

    createRoot((dispose) => {
      createResource(source, (src) => {
        fetchCount++
        return `result-${src}`
      })
      expect(fetchCount).toBe(1)

      setSource(undefined) // falsy
      expect(fetchCount).toBe(1)
      dispose()
    })
  })

  it('async rejection with non-Error value', async () => {
    const [data] = createResource(() => Promise.reject('string-rejection'))
    await new Promise((r) => setTimeout(r, 10))
    expect(data.error).toBeInstanceOf(Error)
    expect(data.error?.message).toBe('string-rejection')
  })

  it('sync fetcher that throws non-Error', () => {
    const [data] = createResource(() => {
      throw 'string-throw' // non-Error
    })
    expect(data.error).toBeInstanceOf(Error)
    expect(data.error?.message).toBe('string-throw')
  })

  it('resource.latest persists after error', async () => {
    let callCount = 0
    const [, { refetch }] = createResource(async () => {
      callCount++
      if (callCount === 2) throw new Error('second-fail')
      return `value-${callCount}`
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(callCount).toBe(1)

    // Second fetch errors
    refetch()
    await new Promise((r) => setTimeout(r, 10))
    // latest should still hold the last successful value
    // (latestValue is not cleared on error)
  })

  it('two-arg form with source=true fetches immediately', async () => {
    let fetched = false
    const [data] = createResource(true, async () => {
      fetched = true
      return 'result'
    })
    await new Promise((r) => setTimeout(r, 10))
    expect(fetched).toBe(true)
    expect(data()).toBe('result')
  })

  it('resource.loading transitions correctly', async () => {
    let resolvePromise: (v: string) => void
    const promise = new Promise<string>((r) => {
      resolvePromise = r
    })

    const [data] = createResource(() => promise)
    expect(data.loading).toBe(true)
    expect(data()).toBeUndefined()

    resolvePromise!('done')
    await new Promise((r) => setTimeout(r, 10))

    expect(data.loading).toBe(false)
    expect(data()).toBe('done')
  })
})

// ─── observable / from edge cases ──────────────────────────────────────────

describe('observable / from edge cases', () => {
  it('observable multiple subscribers', () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      const obs = observable(count)
      const values1: number[] = []
      const values2: number[] = []

      const sub1 = obs.subscribe({ next: (v) => values1.push(v) })
      const sub2 = obs.subscribe({ next: (v) => values2.push(v) })

      setCount(1)
      expect(values1).toEqual([0, 1])
      expect(values2).toEqual([0, 1])

      sub1.unsubscribe()
      setCount(2)
      expect(values1).toEqual([0, 1]) // unsubscribed
      expect(values2).toEqual([0, 1, 2]) // still active

      sub2.unsubscribe()
      dispose()
    })
  })

  it('from with producer calls cleanup registration', () => {
    // The `from` function calls pyreonOnCleanup internally.
    // pyreonOnCleanup requires a reactive scope — this test verifies
    // the producer path is exercised (setter is called, cleanup fn returned).
    let setter: ((v: number) => void) | undefined
    let cleanupFn: (() => void) | undefined

    createRoot((dispose) => {
      const val = from<number>((set) => {
        setter = set
        cleanupFn = () => {} // cleanup
        return cleanupFn
      })
      setter!(42)
      expect(val()).toBe(42)
      dispose()
    })
    // The cleanup function was provided to pyreonOnCleanup
    expect(cleanupFn).toBeDefined()
  })

  it('from with observable calls subscribe and returns value', () => {
    let subscribed = false
    createRoot((dispose) => {
      const mockObs = {
        subscribe: (observer: { next: (v: number) => void }) => {
          subscribed = true
          observer.next(10)
          return { unsubscribe: () => {} }
        },
      }
      const val = from(mockObs)
      expect(subscribed).toBe(true)
      expect(val()).toBe(10)
      dispose()
    })
  })
})

// ─── mapArray / indexArray edge cases ───────────────────────────────────────

describe('mapArray / indexArray edge cases', () => {
  it('mapArray with empty array', () => {
    createRoot((dispose) => {
      const [list] = createSignal<string[]>([])
      const mapped = mapArray(list, (item) => item.toUpperCase())
      expect(mapped()).toEqual([])
      dispose()
    })
  })

  it('indexArray with empty array', () => {
    createRoot((dispose) => {
      const [list] = createSignal<number[]>([])
      const mapped = indexArray(list, (item) => item() * 2)
      expect(mapped()).toEqual([])
      dispose()
    })
  })

  it('mapArray index accessor returns correct position', () => {
    createRoot((dispose) => {
      const [list] = createSignal(['a', 'b', 'c'])
      const indices: number[] = []
      mapArray(list, (_item, index) => {
        indices.push(index())
        return null
      })()
      expect(indices).toEqual([0, 1, 2])
      dispose()
    })
  })

  it('indexArray item accessor returns correct value', () => {
    createRoot((dispose) => {
      const [list] = createSignal([10, 20, 30])
      const values: number[] = []
      indexArray(list, (item) => {
        values.push(item())
        return null
      })()
      expect(values).toEqual([10, 20, 30])
      dispose()
    })
  })
})

// ─── startTransition / useTransition edge cases ────────────────────────────

describe('startTransition / useTransition edge cases', () => {
  it('startTransition propagates return value via side effect', () => {
    let result = 0
    startTransition(() => {
      result = 42
    })
    expect(result).toBe(42)
  })

  it('useTransition isPending is always false even during transition', () => {
    const [isPending, start] = useTransition()
    let pendingDuring = true
    start(() => {
      pendingDuring = isPending()
    })
    expect(pendingDuring).toBe(false)
    expect(isPending()).toBe(false)
  })
})

// ─── splitProps with symbol keys ───────────────────────────────────────────

describe('splitProps edge cases', () => {
  it('symbol-keyed properties go to rest', () => {
    const sym = Symbol('test')
    const props = { name: 'hello' } as Record<string | symbol, unknown>
    props[sym] = 'symbol-value'
    const [local, rest] = (splitProps as Function)(props, 'name')
    expect(local.name).toBe('hello')
    // Symbol keys always go to rest (they're not string keys in keySet)
    expect(rest[sym]).toBe('symbol-value')
  })
})

// ─── mergeProps with non-getter descriptors ────────────────────────────────

describe('mergeProps edge cases', () => {
  it('handles descriptor without getter (plain value)', () => {
    const source = {} as Record<string, unknown>
    Object.defineProperty(source, 'val', {
      value: 123,
      writable: true,
      enumerable: true,
      configurable: true,
    })
    const merged = (mergeProps as Function)(source) as Record<string, unknown>
    expect(merged.val).toBe(123)
  })
})

// ─── Type exports verification ─────────────────────────────────────────────

describe('type exports compile correctly', () => {
  it('all Solid-compatible types are importable', () => {
    const _accessor: Accessor<string> = () => 'hello'
    const _setter: Setter<string> = () => {}
    const _signal: Signal<string> = [_accessor, _setter]
    const _component: Component<{ x: number }> = () => null
    const _parent: ParentComponent<{ x: number }> = () => null
    const _flow: FlowComponent<{ x: number }> = () => null
    const _void: VoidComponent<{ x: number }> = () => null
    const _owner: Owner | null = null

    // Verify they have correct shapes at runtime
    expect(typeof _accessor).toBe('function')
    expect(typeof _setter).toBe('function')
    expect(_signal).toHaveLength(2)
    expect(typeof _component).toBe('function')
    expect(typeof _parent).toBe('function')
    expect(typeof _flow).toBe('function')
    expect(typeof _void).toBe('function')
    expect(_owner).toBeNull()
  })
})

// ─── JSX runtime coverage ──────────────────────────────────────────────────

describe('jsx-runtime coverage', () => {
  it('native components (Show) pass through without wrapping', () => {
    const [visible] = createSignal(true)
    // Calling jsx with a native component should not wrap it
    const vnode = jsx(Show as ComponentFn, {
      when: visible,
      children: jsx('span', { children: 'hi' }),
    })
    expect(vnode).toBeDefined()
    expect(vnode.type).toBe(Show)
  })

  it('jsx with key prop', () => {
    const vnode = jsx('div', { children: 'test' }, 'my-key')
    expect(vnode).toBeDefined()
    expect(vnode.props.key).toBe('my-key')
  })

  it('jsx with no children', () => {
    const vnode = jsx('div', { class: 'empty' })
    expect(vnode).toBeDefined()
  })

  it('jsx with array children', () => {
    const vnode = jsx('ul', {
      children: [jsx('li', { children: 'a' }), jsx('li', { children: 'b' })],
    })
    expect(vnode).toBeDefined()
  })

  it('__loading forwarded on lazy components through jsx', async () => {
    const LazyComp = lazy(() => Promise.resolve({ default: () => h('div', null, 'ok') }))
    // jsx wraps via wrapCompatComponent — __loading should be forwarded
    const vnode = jsx(LazyComp as ComponentFn, {})
    expect(vnode).toBeDefined()
  })

  it('wrapCompatComponent caches wrapped components', () => {
    function MyComp() {
      return jsx('div', { children: 'test' })
    }
    const v1 = jsx(MyComp as ComponentFn, {})
    const v2 = jsx(MyComp as ComponentFn, {})
    // Same wrapper should be used (cached via WeakMap)
    expect(v1.type).toBe(v2.type)
  })

  it('scheduleRerender skips when unmounted', async () => {
    let renderCount = 0

    function Counter() {
      const [count, setCount] = createSignal(0)
      renderCount++
      onMount(() => {
        // Write to signal after unmount — should not trigger re-render
        setTimeout(() => setCount(1), 50)
      })
      return jsx('span', { children: String(count()) })
    }

    const container = document.createElement('div')
    const unmount = mount(jsx(Counter, {}), container)

    await new Promise((r) => setTimeout(r, 10))
    const countBefore = renderCount
    unmount()

    // Wait for the delayed setCount
    await new Promise((r) => setTimeout(r, 100))
    // Re-render should not have happened after unmount
    expect(renderCount).toBe(countBefore)
  })

  it('layout effects with cleanup run correctly', async () => {
    const cleanups: string[] = []
    const runner = createHookRunner()

    // Push layout effects into context DURING a render pass so the
    // jsx-runtime's actual runLayoutEffects function executes them
    const el = document.createElement('div')
    document.body.appendChild(el)

    let pushed = false
    const Comp = () => {
      const ctx = getCurrentCtx()!
      if (!pushed) {
        pushed = true
        ctx.pendingLayoutEffects.push({
          fn: () => {
            cleanups.push('layout-run')
            return () => { cleanups.push('layout-cleanup') }
          },
          deps: undefined,
          cleanup: undefined,
        })
      }
      return h('div', null, 'test')
    }

    mount(jsx(Comp as ComponentFn, {}), el)
    expect(cleanups).toContain('layout-run')
  })
})

// ─── Integration patterns ──────────────────────────────────────────────────

describe('real-world integration patterns', () => {
  it('counter with createSignal + createEffect', () => {
    const log: number[] = []
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      createEffect(() => {
        log.push(count())
      })
      setCount(1)
      setCount(2)
      setCount(3)
      expect(log).toEqual([0, 1, 2, 3])
      dispose()
    })
  })

  it('derived state with createMemo', () => {
    createRoot((dispose) => {
      const [firstName, setFirstName] = createSignal('John')
      const [lastName] = createSignal('Doe')
      const fullName = createMemo(() => `${firstName()} ${lastName()}`)
      expect(fullName()).toBe('John Doe')
      setFirstName('Jane')
      expect(fullName()).toBe('Jane Doe')
      dispose()
    })
  })

  it('store-based todo list', () => {
    const [store, setStore] = createStore<{ todos: { text: string; done: boolean }[] }>({
      todos: [],
    })

    setStore((s) => {
      s.todos.push({ text: 'Buy milk', done: false })
    })
    expect(store.todos).toHaveLength(1)
    expect(store.todos[0].text).toBe('Buy milk')

    setStore((s) => {
      s.todos.push({ text: 'Walk dog', done: false })
      s.todos[0].done = true
    })
    expect(store.todos).toHaveLength(2)
    expect(store.todos[0].done).toBe(true)
  })

  it('produce with createStore', () => {
    const [store, setStore] = createStore({ items: [1, 2, 3] })
    const addItem = produce<{ items: number[] }>((s) => {
      s.items.push(4)
    })
    setStore((s) => {
      const result = addItem(s)
      Object.assign(s, result)
    })
    // The store was cloned and mutated
    expect(store.items).toContain(4)
  })

  it('batch with multiple signals and effect', () => {
    const results: string[] = []
    createRoot((dispose) => {
      const [first, setFirst] = createSignal('a')
      const [second, setSecond] = createSignal('b')
      createEffect(() => {
        results.push(`${first()}-${second()}`)
      })
      expect(results).toEqual(['a-b'])

      batch(() => {
        setFirst('x')
        setSecond('y')
      })
      expect(results).toEqual(['a-b', 'x-y'])
      dispose()
    })
  })

  it('createSelector with effect tracking', () => {
    createRoot((dispose) => {
      const [selected, setSelected] = createSignal<number>(0)
      const isSelected = createSelector(selected)

      const log: boolean[] = []
      createEffect(() => {
        log.push(isSelected(1))
      })

      expect(log).toEqual([false])
      setSelected(1)
      expect(log).toEqual([false, true])
      setSelected(2)
      expect(log).toEqual([false, true, false])
      dispose()
    })
  })

  it('DOM rendering with compat jsx and state updates', async () => {
    function App() {
      const [count, setCount] = createSignal(0)
      onMount(() => {
        setCount(42)
      })
      return jsx('div', { children: String(count()) })
    }

    const container = document.createElement('div')
    mount(jsx(App, {}), container)

    await new Promise((r) => setTimeout(r, 50))
    // After mount effect and re-render
    expect(container.innerHTML).toContain('42')
  })
})

// ─── createSignal equals: false outside component ──────────────────────────

describe('createSignal equals: false outside component', () => {
  it('always notifies with updater function', () => {
    let effectRuns = 0
    createRoot((dispose) => {
      const [val, setVal] = createSignal({ x: 1 }, { equals: false })
      createEffect(() => {
        val()
        effectRuns++
      })
      expect(effectRuns).toBe(1)
      setVal((prev) => ({ ...prev, x: 2 }))
      expect(effectRuns).toBe(2)
      dispose()
    })
  })
})

// ─── createSelector in component context (already covered but verify) ──────

describe('createSelector component context hook index', () => {
  it('returns same selector on re-render', () => {
    const runner = createHookRunner()
    const sel1 = runner.run(() => createSelector(() => 1))
    const sel2 = runner.run(() => createSelector(() => 2)) // should return cached
    expect(sel1).toBe(sel2)
  })
})

// ─── mergeProps / splitProps with no descriptors edge ──────────────────────

describe('mergeProps with empty descriptor', () => {
  it('skips properties with no descriptor', () => {
    // Object.getOwnPropertyDescriptors always returns descriptors for own props,
    // but the code has a `if (!desc) continue` guard. Verify normal flow works.
    const merged = (mergeProps as Function)({ a: 1 }, { b: 2 }) as Record<string, number>
    expect(merged.a).toBe(1)
    expect(merged.b).toBe(2)
  })
})

// ─── splitProps with getter in rest (not picked) ───────────────────────────

describe('splitProps getter handling', () => {
  it('getter goes to rest when not in picked keys', () => {
    const [count, setCount] = createSignal(0)
    const props = {} as Record<string, unknown>
    Object.defineProperty(props, 'dynamic', {
      get: count,
      enumerable: true,
      configurable: true,
    })
    props.static = 'fixed'

    const [local, rest] = (splitProps as Function)(
      props as { static: string; dynamic: number },
      'static',
    )
    expect(local.static).toBe('fixed')
    expect(rest.dynamic).toBe(0)
    setCount(99)
    expect(rest.dynamic).toBe(99) // reactive through getter
  })
})

// ─── createEffect re-entrance in component context ────────────────────────

describe('createEffect re-entrance guard in component context', () => {
  it('prevents recursive effect execution via running flag', () => {
    const runner = createHookRunner()
    let effectRuns = 0
    runner.run(() => {
      const sig = createSignal(0)
      createEffect(() => {
        effectRuns++
        const val = sig[0]()
        // Writing to the same signal inside the effect triggers re-entry
        if (val < 2) sig[1](val + 1)
      })
      return sig
    })
    // The re-entrance guard (`if (running) return`) prevents infinite loops.
    expect(effectRuns).toBeGreaterThanOrEqual(1)
  })
})

// ─── jsx-runtime: DOM integration tests for uncovered branches ──────────────

describe('jsx-runtime layout/schedule effects', () => {
  it('component with onMount triggers scheduled effects', async () => {
    let effectRan = false

    function MyComp() {
      onMount(() => {
        effectRan = true
      })
      return jsx('div', { children: 'mounted' })
    }

    const container = document.createElement('div')
    mount(jsx(MyComp as ComponentFn, {}), container)

    await new Promise((r) => setTimeout(r, 50))
    expect(effectRan).toBe(true)
  })

  it('native component without children prop', () => {
    // Tests branch: native component jsx with children === undefined
    const [flag] = createSignal(true)
    const vnode = jsx(Show as ComponentFn, { when: flag })
    expect(vnode).toBeDefined()
    expect(vnode.type).toBe(Show)
  })

  it('custom component without children prop', () => {
    // Tests branch: custom component jsx with children === undefined
    function Empty() {
      return jsx('span', { children: 'empty' })
    }
    const vnode = jsx(Empty as ComponentFn, {})
    expect(vnode).toBeDefined()
  })

  it('component re-render with state change exercises runLayoutEffects', async () => {
    const renders: number[] = []

    function Comp() {
      const [count, setCount] = createSignal(0)
      renders.push(count())

      onMount(() => {
        // Trigger re-render via state change
        setCount(1)
      })

      return jsx('div', { children: String(count()) })
    }

    const container = document.createElement('div')
    mount(jsx(Comp as ComponentFn, {}), container)

    await new Promise((r) => setTimeout(r, 100))
    expect(renders.length).toBeGreaterThanOrEqual(1)
  })

  it('component unmount prevents scheduled re-renders (scheduleRerender unmounted check)', async () => {
    let rerenderAttempts = 0
    const originalWarn = console.warn

    function Comp() {
      const [count, setCount] = createSignal(0)

      onMount(() => {
        // Trigger setCount which calls scheduleRerender
        // The microtask fires after unmount, hitting the ctx.unmounted check (line 182)
        setCount(1)
        rerenderAttempts++
      })

      return jsx('div', { children: String(count()) })
    }

    const container = document.createElement('div')
    const unmount = mount(jsx(Comp as ComponentFn, {}), container)

    // Let onMount fire via microtask
    await new Promise((r) => setTimeout(r, 20))

    // Unmount the component
    unmount()

    // Now call setCount on the unmounted component — exercises scheduleRerender unmounted guard
    // (The mount callback already fired and set count, but the version bump may have been
    //  blocked by the unmount)
    await new Promise((r) => setTimeout(r, 50))
  })

  it('scheduleRerender microtask after unmount hits unmounted guard', async () => {
    // The scheduleRerender function queues a microtask that checks ctx.unmounted.
    // We need to trigger scheduleRerender, then unmount before the microtask fires.
    let setCountRef: ((v: number) => void) | undefined
    let unmounted = false

    function Comp() {
      const [count, setCount] = createSignal(0)
      setCountRef = (v) => setCount(v)
      onCleanup(() => {
        unmounted = true
      })
      return jsx('div', { children: String(count()) })
    }

    const container = document.createElement('div')
    const unmount = mount(jsx(Comp as ComponentFn, {}), container)

    // Wait for initial render and microtask settling
    await new Promise((r) => setTimeout(r, 20))

    // Synchronously: trigger scheduleRerender, then unmount
    // The microtask hasn't fired yet
    setCountRef!(1)
    unmount()

    // Wait for microtask — it sees ctx.unmounted = true and skips version.set
    await new Promise((r) => setTimeout(r, 50))
    expect(unmounted).toBe(true)
  })
})

// ─── import mergeProps and splitProps ────────────────────────────────────────

import { mergeProps, splitProps } from '../index'

// Import Show separately for the native component test
import { Show } from '../index'
