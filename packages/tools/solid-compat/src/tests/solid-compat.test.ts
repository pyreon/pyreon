import { h } from '@pyreon/core'
import {
  batch,
  children,
  createComputed,
  createContext,
  createEffect,
  createMemo,
  createRenderEffect,
  createResource,
  createRoot,
  createSelector,
  createSignal,
  createStore,
  ErrorBoundary,
  For,
  from,
  getOwner,
  indexArray,
  lazy,
  mapArray,
  Match,
  mergeProps,
  observable,
  on,
  onCleanup,
  onMount,
  produce,
  runWithOwner,
  Show,
  startTransition,
  Suspense,
  Switch,
  splitProps,
  untrack,
  useContext,
  useTransition,
} from '../index'
import type { Accessor, Component, ParentComponent, Setter, Signal } from '../index'
import type { RenderContext } from '../jsx-runtime'
import { beginRender, endRender } from '../jsx-runtime'

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Re-render helper: calls fn with the same ctx to simulate re-render */
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

describe('@pyreon/solid-compat', () => {
  // ─── createSignal ─────────────────────────────────────────────────────

  it('createSignal returns [getter, setter] tuple', () => {
    const [count, setCount] = createSignal(0)
    expect(typeof count).toBe('function')
    expect(typeof setCount).toBe('function')
  })

  it('getter returns current value', () => {
    const [count] = createSignal(42)
    expect(count()).toBe(42)
  })

  it('setter updates value', () => {
    const [count, setCount] = createSignal(0)
    setCount(5)
    expect(count()).toBe(5)
  })

  it('setter with updater function', () => {
    const [count, setCount] = createSignal(10)
    setCount((prev) => prev + 5)
    expect(count()).toBe(15)
  })

  // ─── createSignal in component context ─────────────────────────────────

  it('createSignal in component context stores in hooks', () => {
    const runner = createHookRunner()
    const [count] = runner.run(() => createSignal(42))
    expect(count()).toBe(42)
    // Re-render returns same signal from hooks
    const [count2] = runner.run(() => createSignal(42))
    expect(count2()).toBe(42)
  })

  it('createSignal setter in component context triggers scheduleRerender', () => {
    const runner = createHookRunner()
    let rerenders = 0
    runner.ctx.scheduleRerender = () => {
      rerenders++
    }
    const [, setCount] = runner.run(() => createSignal(0))
    setCount(5)
    expect(rerenders).toBe(1)
  })

  it('createSignal setter persists across re-renders', () => {
    const runner = createHookRunner()
    const [, setCount] = runner.run(() => createSignal(0))
    setCount(99)
    const [count2] = runner.run(() => createSignal(0))
    expect(count2()).toBe(99)
  })

  // ─── createEffect ─────────────────────────────────────────────────────

  it('createEffect tracks signal reads', () => {
    let effectValue = 0
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      createEffect(() => {
        effectValue = count()
      })
      expect(effectValue).toBe(0)
      setCount(7)
      expect(effectValue).toBe(7)
      dispose()
    })
  })

  it('createEffect in component context is hook-indexed', () => {
    const runner = createHookRunner()
    let effectRuns = 0
    runner.run(() => {
      const [count] = createSignal(0)
      createEffect(() => {
        count() // track
        effectRuns++
      })
    })
    expect(effectRuns).toBe(1)
    // Re-render — effect should NOT be created again
    runner.run(() => {
      createSignal(0) // consume hook index
      createEffect(() => {
        effectRuns += 100 // should never run
      })
    })
    expect(effectRuns).toBe(1) // still 1, not re-created
  })

  it('createEffect in component context is disposed on unmount', () => {
    const runner = createHookRunner()
    let effectRuns = 0
    const [, setCount] = runner.run(() => {
      const sig = createSignal(0)
      createEffect(() => {
        sig[0]()
        effectRuns++
      })
      return sig
    })
    expect(effectRuns).toBe(1)
    // Simulate unmount
    for (const cb of runner.ctx.unmountCallbacks) cb()
    setCount(5)
    expect(effectRuns).toBe(1) // effect was disposed
  })

  // ─── createRenderEffect ────────────────────────────────────────────────

  it('createRenderEffect tracks signal reads like createEffect', () => {
    let effectValue = 0
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      createRenderEffect(() => {
        effectValue = count()
      })
      expect(effectValue).toBe(0)
      setCount(3)
      expect(effectValue).toBe(3)
      dispose()
    })
  })

  // ─── createComputed (alias) ────────────────────────────────────────────

  it('createComputed is an alias for createEffect', () => {
    let effectValue = 0
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      createComputed(() => {
        effectValue = count()
      })
      expect(effectValue).toBe(0)
      setCount(5)
      expect(effectValue).toBe(5)
      dispose()
    })
  })

  // ─── createMemo ───────────────────────────────────────────────────────

  it('createMemo derives computed value', () => {
    createRoot((dispose) => {
      const [count] = createSignal(3)
      const doubled = createMemo(() => count() * 2)
      expect(doubled()).toBe(6)
      dispose()
    })
  })

  it('createMemo updates when dependency changes', () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(3)
      const doubled = createMemo(() => count() * 2)
      expect(doubled()).toBe(6)
      setCount(10)
      expect(doubled()).toBe(20)
      dispose()
    })
  })

  it('createMemo in component context is hook-indexed', () => {
    const runner = createHookRunner()
    const doubled = runner.run(() => {
      const [count] = createSignal(5)
      return createMemo(() => count() * 2)
    })
    expect(doubled()).toBe(10)
    // Re-render returns same computed from hooks
    const doubled2 = runner.run(() => {
      createSignal(5) // consume hook index
      return createMemo(() => 999) // fn ignored on re-render
    })
    expect(doubled2()).toBe(10) // still uses original computed
  })

  // ─── createRoot ───────────────────────────────────────────────────────

  it('createRoot provides cleanup', () => {
    let effectRan = false
    let disposed = false
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      createEffect(() => {
        count()
        effectRan = true
      })
      expect(effectRan).toBe(true)
      effectRan = false
      dispose()
      disposed = true
      setCount(1)
      expect(effectRan).toBe(false)
    })
    expect(disposed).toBe(true)
  })

  it('createRoot returns value from fn', () => {
    const result = createRoot((dispose) => {
      dispose()
      return 42
    })
    expect(result).toBe(42)
  })

  // ─── batch ────────────────────────────────────────────────────────────

  it('batch coalesces updates', () => {
    let runs = 0
    createRoot((dispose) => {
      const [a, setA] = createSignal(1)
      const [b, setB] = createSignal(2)
      createEffect(() => {
        a()
        b()
        runs++
      })
      expect(runs).toBe(1)
      batch(() => {
        setA(10)
        setB(20)
      })
      expect(runs).toBe(2)
      dispose()
    })
  })

  // ─── untrack ──────────────────────────────────────────────────────────

  it('untrack prevents tracking', () => {
    let runs = 0
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      const [other, setOther] = createSignal(0)
      createEffect(() => {
        count()
        untrack(() => other())
        runs++
      })
      expect(runs).toBe(1)
      setOther(5)
      expect(runs).toBe(1)
      setCount(1)
      expect(runs).toBe(2)
      dispose()
    })
  })

  // ─── on ───────────────────────────────────────────────────────────────

  it('on() tracks specific single dependency', () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      const values: number[] = []

      const tracker = on(count, (input) => {
        values.push(input as number)
        return input
      })

      createEffect(() => {
        tracker()
      })

      expect(values).toEqual([0])
      setCount(5)
      expect(values).toEqual([0, 5])
      dispose()
    })
  })

  it('on() tracks array of dependencies', () => {
    createRoot((dispose) => {
      const [a, setA] = createSignal(1)
      const [b, _setB] = createSignal(2)
      const results: unknown[] = []

      const tracker = on([a, b] as const, (input, prevInput, prevValue) => {
        results.push({ input, prevInput, prevValue })
        return input
      })

      createEffect(() => {
        tracker()
      })

      expect(results).toHaveLength(1)
      expect((results[0] as Record<string, unknown>).input).toEqual([1, 2])
      expect((results[0] as Record<string, unknown>).prevInput).toBeUndefined()

      setA(10)
      expect(results).toHaveLength(2)
      expect((results[1] as Record<string, unknown>).input).toEqual([10, 2])
      expect((results[1] as Record<string, unknown>).prevInput).toEqual([1, 2])

      dispose()
    })
  })

  it('on() provides prevValue on subsequent calls', () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      const prevValues: unknown[] = []

      const tracker = on(count, (input, _prevInput, prevValue) => {
        prevValues.push(prevValue)
        return (input as number) * 10
      })

      createEffect(() => {
        tracker()
      })

      expect(prevValues).toEqual([undefined]) // first call
      setCount(5)
      expect(prevValues).toEqual([undefined, 0]) // prev value was 0*10 = 0
      dispose()
    })
  })

  // ─── createSelector ───────────────────────────────────────────────────

  it('createSelector returns equality checker', () => {
    createRoot((dispose) => {
      const [selected, setSelected] = createSignal(1)
      const isSelected = createSelector(selected)

      expect(isSelected(1)).toBe(true)
      expect(isSelected(2)).toBe(false)

      setSelected(2)
      expect(isSelected(1)).toBe(false)
      expect(isSelected(2)).toBe(true)
      dispose()
    })
  })

  it('createSelector in component context is hook-indexed', () => {
    const runner = createHookRunner()
    const isSelected = runner.run(() => {
      const [selected] = createSignal(1)
      return createSelector(selected)
    })
    expect(isSelected(1)).toBe(true)
    // Re-render returns same selector
    const isSelected2 = runner.run(() => {
      createSignal(1) // consume hook index
      return createSelector(() => 999) // fn ignored on re-render
    })
    expect(isSelected2).toBe(isSelected) // same instance
  })

  // ─── mergeProps ───────────────────────────────────────────────────────

  it('mergeProps combines objects', () => {
    const defaults = { color: 'red', size: 10 }
    const overrides = { size: 20, weight: 'bold' }
    const merged = mergeProps(defaults, overrides)
    expect((merged as Record<string, unknown>).color).toBe('red')
    expect((merged as Record<string, unknown>).size).toBe(20)
    expect((merged as Record<string, unknown>).weight).toBe('bold')
  })

  it('mergeProps preserves getters for reactivity', () => {
    const [count, setCount] = createSignal(0)
    const props = {}
    Object.defineProperty(props, 'count', {
      get: count,
      enumerable: true,
      configurable: true,
    })
    const merged = mergeProps(props)
    expect((merged as Record<string, unknown>).count).toBe(0)
    setCount(5)
    expect((merged as Record<string, unknown>).count).toBe(5)
  })

  // ─── splitProps ───────────────────────────────────────────────────────

  it('splitProps separates props', () => {
    const props = { name: 'hello', class: 'btn', onClick: () => {} }
    const [local, rest] = splitProps(props, 'name')
    expect((local as Record<string, unknown>).name).toBe('hello')
    expect((local as Record<string, unknown>).class).toBeUndefined()
    expect((rest as Record<string, unknown>).class).toBe('btn')
    expect((rest as Record<string, unknown>).onClick).toBeDefined()
  })

  it('splitProps preserves getters', () => {
    const [count, setCount] = createSignal(0)
    const props = {} as Record<string, unknown>
    Object.defineProperty(props, 'count', {
      get: count,
      enumerable: true,
      configurable: true,
    })
    Object.defineProperty(props, 'label', {
      value: 'test',
      writable: true,
      enumerable: true,
      configurable: true,
    })

    const [local, rest] = splitProps(props as { count: number; label: string }, 'count')
    expect((local as Record<string, unknown>).count).toBe(0)
    setCount(10)
    expect((local as Record<string, unknown>).count).toBe(10)
    expect((rest as Record<string, unknown>).label).toBe('test')
  })

  // ─── children ─────────────────────────────────────────────────────────

  it('children resolves static values', () => {
    const resolved = children(() => 'hello')
    expect(resolved()).toBe('hello')
  })

  it('children resolves function children (reactive getters)', () => {
    const resolved = children(() => (() => 'dynamic') as unknown as ReturnType<typeof h>)
    expect(resolved()).toBe('dynamic')
  })

  // ─── lazy ─────────────────────────────────────────────────────────────

  it('lazy returns a component with preload', () => {
    const Lazy = lazy(() => Promise.resolve({ default: () => h('div', null, 'loaded') }))
    expect(typeof Lazy).toBe('function')
    expect(typeof Lazy.preload).toBe('function')
  })

  it('lazy component uses __loading protocol before loaded (for Suspense)', () => {
    const Lazy = lazy(() => Promise.resolve({ default: () => h('div', null, 'loaded') }))
    // Before resolved, __loading returns true and component returns null
    expect(Lazy.__loading()).toBe(true)
    const result = Lazy({})
    expect(result).toBeNull()
  })

  it('lazy component renders after loading', async () => {
    const MyComp = () => h('div', null, 'loaded')
    const Lazy = lazy(() => Promise.resolve({ default: MyComp }))

    // Trigger load
    Lazy({})
    // Wait for promise to resolve
    await Lazy.preload()

    expect(Lazy.__loading()).toBe(false)
    const result = Lazy({})
    expect(result).not.toBeNull()
  })

  it('lazy preload triggers loading', async () => {
    const MyComp = () => h('div', null, 'loaded')
    const Lazy = lazy(() => Promise.resolve({ default: MyComp }))

    const promise = Lazy.preload()
    expect(promise).toBeInstanceOf(Promise)

    await promise
    const result = Lazy({})
    expect(result).not.toBeNull()
  })

  it('lazy preload only loads once', async () => {
    let loadCount = 0
    const MyComp = () => h('div', null, 'loaded')
    const Lazy = lazy(() => {
      loadCount++
      return Promise.resolve({ default: MyComp })
    })

    const p1 = Lazy.preload()
    const p2 = Lazy.preload()
    expect(p1).toBe(p2) // same promise
    await p1
    expect(loadCount).toBe(1)
  })

  // ─── getOwner / runWithOwner ──────────────────────────────────────────

  it('getOwner returns current scope or null', () => {
    // Outside any scope, may return null
    const _outerOwner = getOwner()

    createRoot((dispose) => {
      const owner = getOwner()
      expect(owner).not.toBeNull()
      dispose()
    })
  })

  it('runWithOwner runs fn within the given scope', () => {
    createRoot((dispose) => {
      const owner = getOwner()
      let ranInScope = false

      runWithOwner(owner, () => {
        ranInScope = true
        return undefined
      })

      expect(ranInScope).toBe(true)
      dispose()
    })
  })

  it('runWithOwner with null owner', () => {
    const result = runWithOwner(null, () => 42)
    expect(result).toBe(42)
  })

  it('runWithOwner restores previous scope even on error', () => {
    createRoot((dispose) => {
      expect(() => {
        runWithOwner(null, () => {
          throw new Error('test error')
        })
      }).toThrow('test error')
      dispose()
    })
  })

  // ─── onMount / onCleanup ──────────────────────────────────────────────

  it('onMount and onCleanup are functions', () => {
    expect(typeof onMount).toBe('function')
    expect(typeof onCleanup).toBe('function')
  })

  it('onMount in component context only runs on first render', () => {
    const runner = createHookRunner()
    runner.run(() => {
      onMount(() => undefined)
    })
    expect(runner.ctx.pendingEffects).toHaveLength(1)
    // Re-render — should NOT add another effect
    runner.run(() => {
      onMount(() => undefined)
    })
    expect(runner.ctx.pendingEffects).toHaveLength(0) // cleared by beginRender
  })

  it('onCleanup in component context registers unmount callback', () => {
    const runner = createHookRunner()
    let cleaned = false
    runner.run(() => {
      onCleanup(() => {
        cleaned = true
      })
    })
    expect(cleaned).toBe(false)
    for (const cb of runner.ctx.unmountCallbacks) cb()
    expect(cleaned).toBe(true)
  })

  // ─── createContext / useContext ────────────────────────────────────────

  it('createContext creates context with default value', () => {
    const Ctx = createContext('default-value')
    expect(useContext(Ctx)).toBe('default-value')
  })

  // ─── Re-exports ───────────────────────────────────────────────────────

  it('Show is exported', () => {
    expect(typeof Show).toBe('function')
  })

  it('Switch is exported', () => {
    expect(typeof Switch).toBe('function')
  })

  it('Match is exported', () => {
    expect(typeof Match).toBe('function')
  })

  it('For is exported', () => {
    expect(typeof For).toBe('function')
  })

  it('Suspense is exported', () => {
    expect(typeof Suspense).toBe('function')
  })

  it('ErrorBoundary is exported', () => {
    expect(typeof ErrorBoundary).toBe('function')
  })

  // ─── on() edge cases ──────────────────────────────────────────────────

  it('on() with single accessor (non-array) tracks correctly', () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(10)
      const results: unknown[] = []

      const tracker = on(count, (input, prevInput, prevValue) => {
        results.push({ input, prevInput, prevValue })
        return (input as number) * 2
      })

      createEffect(() => {
        tracker()
      })

      // First call: initialized
      expect(results).toHaveLength(1)
      expect((results[0] as Record<string, unknown>).input).toBe(10)
      expect((results[0] as Record<string, unknown>).prevInput).toBeUndefined()
      expect((results[0] as Record<string, unknown>).prevValue).toBeUndefined()

      setCount(20)
      expect(results).toHaveLength(2)
      expect((results[1] as Record<string, unknown>).input).toBe(20)
      expect((results[1] as Record<string, unknown>).prevInput).toBe(10)
      expect((results[1] as Record<string, unknown>).prevValue).toBe(20) // 10*2

      dispose()
    })
  })

  // ─── mergeProps — getter preservation ──────────────────────────────────

  it('mergeProps preserves getters for reactivity', () => {
    const source = {} as Record<string, unknown>
    Object.defineProperty(source, 'x', { get: () => 42, enumerable: true, configurable: true })
    const merged = mergeProps(source) as Record<string, unknown>
    expect(merged.x).toBe(42)
  })

  // ─── mergeProps edge cases ─────────────────────────────────────────────

  it('mergeProps with multiple sources overrides in order', () => {
    const a = { x: 1, y: 2 }
    const b = { y: 3, z: 4 }
    const c = { z: 5 }
    const merged = mergeProps(a, b, c) as Record<string, number>
    expect(merged.x).toBe(1)
    expect(merged.y).toBe(3)
    expect(merged.z).toBe(5)
  })

  it('mergeProps with empty source', () => {
    const merged = mergeProps({}, { a: 1 }) as Record<string, number>
    expect(merged.a).toBe(1)
  })

  // ─── splitProps — getter preservation ──────────────────────────────────

  it('splitProps preserves getters in picked set', () => {
    const source = {} as Record<string, unknown>
    Object.defineProperty(source, 'a', { get: () => 99, enumerable: true, configurable: true })
    source.b = 2
    const [local, rest] = splitProps(source as { a: number; b: number }, 'a')
    expect((local as Record<string, unknown>).a).toBe(99)
    expect((rest as Record<string, unknown>).b).toBe(2)
  })

  // ─── splitProps edge cases ─────────────────────────────────────────────

  it('splitProps with getter in rest', () => {
    const [count, setCount] = createSignal(0)
    const props = {} as Record<string, unknown>
    Object.defineProperty(props, 'count', {
      get: count,
      enumerable: true,
      configurable: true,
    })
    Object.defineProperty(props, 'name', {
      value: 'test',
      writable: true,
      enumerable: true,
      configurable: true,
    })

    const [local, rest] = splitProps(props as { count: number; name: string }, 'name')
    expect((local as Record<string, unknown>).name).toBe('test')
    expect((rest as Record<string, unknown>).count).toBe(0)
    setCount(42)
    expect((rest as Record<string, unknown>).count).toBe(42)
  })

  // ─── children edge cases ───────────────────────────────────────────────

  it('children resolves non-function values as-is', () => {
    const resolved = children(() => 42 as unknown as ReturnType<typeof h>)
    expect(resolved()).toBe(42)
  })

  it('children resolves null', () => {
    const resolved = children(() => null)
    expect(resolved()).toBeNull()
  })

  // ─── lazy edge: preload called multiple times ──────────────────────────

  it('lazy component called after preload resolves renders correctly', async () => {
    const MyComp = (props: { msg: string }) => h('span', null, props.msg)
    const Lazy = lazy(() => Promise.resolve({ default: MyComp }))

    await Lazy.preload()
    const result = Lazy({ msg: 'loaded' })
    expect(result).not.toBeNull()
  })

  // ─── createRoot restores scope ─────────────────────────────────────────

  it('createRoot restores previous scope after fn completes', () => {
    const outerOwner = getOwner()
    createRoot((dispose) => {
      const innerOwner = getOwner()
      expect(innerOwner).not.toBeNull()
      dispose()
    })
    // After createRoot, scope should be restored to outer
    const afterOwner = getOwner()
    expect(afterOwner).toBe(outerOwner)
  })

  // ─── runWithOwner restores scope ───────────────────────────────────────

  it('runWithOwner returns value from fn', () => {
    const result = runWithOwner(null, () => 'hello')
    expect(result).toBe('hello')
  })

  // ─── createSignal equals option ────────────────────────────────────────

  it('createSignal default skips update on same value (===)', () => {
    let effectRuns = 0
    createRoot((dispose) => {
      const [count, setCount] = createSignal(5)
      createEffect(() => {
        count()
        effectRuns++
      })
      expect(effectRuns).toBe(1)
      setCount(5) // same value
      expect(effectRuns).toBe(1) // no re-run
      setCount(6)
      expect(effectRuns).toBe(2)
      dispose()
    })
  })

  it('createSignal equals: false always notifies', () => {
    let effectRuns = 0
    createRoot((dispose) => {
      const [count, setCount] = createSignal(5, { equals: false })
      createEffect(() => {
        count()
        effectRuns++
      })
      expect(effectRuns).toBe(1)
      setCount(5) // same value but equals: false
      expect(effectRuns).toBe(2)
      dispose()
    })
  })

  it('createSignal custom equals function', () => {
    let effectRuns = 0
    createRoot((dispose) => {
      const [obj, setObj] = createSignal(
        { id: 1, name: 'a' },
        { equals: (prev, next) => prev.id === next.id },
      )
      createEffect(() => {
        obj()
        effectRuns++
      })
      expect(effectRuns).toBe(1)
      setObj({ id: 1, name: 'b' }) // same id
      expect(effectRuns).toBe(1)
      setObj({ id: 2, name: 'b' }) // different id
      expect(effectRuns).toBe(2)
      dispose()
    })
  })

  // ─── createSignal getter/setter identity stability ────────────────────

  it('createSignal returns stable getter/setter in component context', () => {
    const runner = createHookRunner()
    const [getter1, setter1] = runner.run(() => createSignal(0))
    const [getter2, setter2] = runner.run(() => createSignal(0))
    expect(getter1).toBe(getter2)
    expect(setter1).toBe(setter2)
  })

  // ─── createResource ──────────────────────────────────────────────────

  it('createResource with fetcher only', async () => {
    const [data] = createResource(() => Promise.resolve(42))
    expect(data()).toBeUndefined()
    expect(data.loading).toBe(true)

    await new Promise((r) => setTimeout(r, 10))

    expect(data()).toBe(42)
    expect(data.loading).toBe(false)
    expect(data.error).toBeUndefined()
    expect(data.latest).toBe(42)
  })

  it('createResource with sync fetcher', () => {
    const [data] = createResource(() => 'sync-value')
    expect(data()).toBe('sync-value')
    expect(data.loading).toBe(false)
  })

  it('createResource with source and fetcher', async () => {
    const [userId, setUserId] = createSignal(1)

    createRoot(async (dispose) => {
      const [data] = createResource(userId, async (id) => `user-${id}`)

      await new Promise((r) => setTimeout(r, 10))
      expect(data()).toBe('user-1')

      setUserId(2)
      await new Promise((r) => setTimeout(r, 10))
      expect(data()).toBe('user-2')

      dispose()
    })
  })

  it('createResource mutate updates data', async () => {
    const [data, { mutate }] = createResource(() => Promise.resolve(10))
    await new Promise((r) => setTimeout(r, 10))
    expect(data()).toBe(10)

    mutate(99)
    expect(data()).toBe(99)
    expect(data.latest).toBe(99)
  })

  it('createResource mutate with updater function', async () => {
    const [data, { mutate }] = createResource(() => Promise.resolve(10))
    await new Promise((r) => setTimeout(r, 10))

    mutate((prev) => (prev ?? 0) + 5)
    expect(data()).toBe(15)
  })

  it('createResource handles errors', async () => {
    const [data] = createResource(() => Promise.reject(new Error('fail')))
    await new Promise((r) => setTimeout(r, 10))

    expect(data()).toBeUndefined()
    expect(data.error).toBeInstanceOf(Error)
    expect(data.error?.message).toBe('fail')
    expect(data.loading).toBe(false)
  })

  it('createResource handles sync errors', () => {
    const [data] = createResource(() => {
      throw new Error('sync-fail')
    })

    expect(data()).toBeUndefined()
    expect(data.error?.message).toBe('sync-fail')
    expect(data.loading).toBe(false)
  })

  it('createResource with falsy source skips fetch', () => {
    let fetchCount = 0
    const [enabled] = createSignal(false)

    createRoot((dispose) => {
      createResource(enabled, () => {
        fetchCount++
        return 'fetched'
      })
      expect(fetchCount).toBe(0)
      dispose()
    })
  })

  it('createResource refetch re-fetches', async () => {
    let fetchCount = 0
    const [, { refetch }] = createResource(async () => {
      fetchCount++
      return fetchCount
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(fetchCount).toBe(1)

    refetch()
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchCount).toBe(2)
  })

  // ─── createStore / produce ────────────────────────────────────────────

  it('createStore returns reactive proxy and setter', () => {
    const [store, setStore] = createStore({ count: 0, name: 'test' })
    expect(store.count).toBe(0)
    expect(store.name).toBe('test')

    setStore((s) => {
      s.count = 5
    })
    expect(store.count).toBe(5)
  })

  it('createStore proxy is reactive in effects', () => {
    let effectRuns = 0
    createRoot((dispose) => {
      const [store, setStore] = createStore({ value: 1 })
      createEffect(() => {
        void store.value // read through proxy triggers signal read
        effectRuns++
      })
      expect(effectRuns).toBe(1)
      setStore((s) => {
        s.value = 2
      })
      expect(effectRuns).toBe(2)
      dispose()
    })
  })

  it('createStore proxy prevents direct mutation', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const [store] = createStore({ count: 0 })
    ;(store as Record<string, unknown>).count = 5
    expect(warn).toHaveBeenCalledWith(
      '[Pyreon] Direct mutation on store is not supported. Use the setter function.',
    )
    warn.mockRestore()
  })

  it('produce creates a reusable updater', () => {
    const increment = produce<{ count: number }>((s) => {
      s.count++
    })
    const result = increment({ count: 5 })
    expect(result.count).toBe(6)
  })

  // ─── startTransition / useTransition ──────────────────────────────────

  it('startTransition runs fn synchronously', () => {
    let ran = false
    startTransition(() => {
      ran = true
    })
    expect(ran).toBe(true)
  })

  it('useTransition returns [isPending, start]', () => {
    const [isPending, start] = useTransition()
    expect(isPending()).toBe(false)
    let ran = false
    start(() => {
      ran = true
    })
    expect(ran).toBe(true)
    expect(isPending()).toBe(false)
  })

  // ─── observable ───────────────────────────────────────────────────────

  it('observable converts signal to subscribable', () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      const obs = observable(count)
      const values: number[] = []
      const sub = obs.subscribe({ next: (v) => values.push(v) })

      expect(values).toEqual([0])
      setCount(1)
      expect(values).toEqual([0, 1])

      sub.unsubscribe()
      setCount(2)
      expect(values).toEqual([0, 1]) // no more updates

      dispose()
    })
  })

  // ─── from ─────────────────────────────────────────────────────────────

  it('from with producer function', () => {
    createRoot((dispose) => {
      let setter: ((v: number) => void) | undefined
      const value = from<number>((set) => {
        setter = set
        return () => {} // cleanup
      })
      expect(value()).toBeUndefined()
      setter!(42)
      expect(value()).toBe(42)
      dispose()
    })
  })

  it('from with observable', () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(0)
      const obs = observable(count)
      const derived = from(obs)

      // from subscribes to observable, initial value propagated
      expect(derived()).toBe(0)
      setCount(5)
      expect(derived()).toBe(5)

      dispose()
    })
  })

  // ─── mapArray ─────────────────────────────────────────────────────────

  it('mapArray maps items with reactive index', () => {
    createRoot((dispose) => {
      const [list] = createSignal(['a', 'b', 'c'])
      const mapped = mapArray(list, (item, index) => `${item}-${index()}`)
      expect(mapped()).toEqual(['a-0', 'b-1', 'c-2'])
      dispose()
    })
  })

  it('mapArray updates when source changes', () => {
    createRoot((dispose) => {
      const [list, setList] = createSignal([1, 2, 3])
      const doubled = mapArray(list, (item) => item * 2)
      expect(doubled()).toEqual([2, 4, 6])
      setList([4, 5])
      expect(doubled()).toEqual([8, 10])
      dispose()
    })
  })

  // ─── indexArray ───────────────────────────────────────────────────────

  it('indexArray maps items with static index', () => {
    createRoot((dispose) => {
      const [list] = createSignal(['x', 'y', 'z'])
      const mapped = indexArray(list, (item, index) => `${item()}-${index}`)
      expect(mapped()).toEqual(['x-0', 'y-1', 'z-2'])
      dispose()
    })
  })

  it('indexArray updates when source changes', () => {
    createRoot((dispose) => {
      const [list, setList] = createSignal([10, 20])
      const doubled = indexArray(list, (item) => item() * 2)
      expect(doubled()).toEqual([20, 40])
      setList([30])
      expect(doubled()).toEqual([60])
      dispose()
    })
  })

  // ─── Type exports ─────────────────────────────────────────────────────

  it('type exports are usable', () => {
    // These are compile-time checks — just verify they don't cause runtime errors
    const _accessor: Accessor<number> = () => 42
    const _setter: Setter<number> = () => {}
    const _signal: Signal<number> = [_accessor, _setter]
    const _component: Component<{ name: string }> = () => null
    const _parent: ParentComponent<{ title: string }> = () => null
    expect(_signal).toHaveLength(2)
    expect(typeof _component).toBe('function')
    expect(typeof _parent).toBe('function')
  })

  // ─── JSX runtime ───────────────────────────────────────────────────────

  it('jsx-runtime exports are available', async () => {
    const jsxRuntime = await import('../jsx-runtime')
    expect(typeof jsxRuntime.jsx).toBe('function')
    expect(typeof jsxRuntime.jsxs).toBe('function')
    expect(typeof jsxRuntime.Fragment).toBe('symbol')
  })
})
