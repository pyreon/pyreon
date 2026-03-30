import { h } from '@pyreon/core'
import {
  batch,
  children,
  createComputed,
  createContext,
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSelector,
  createSignal,
  ErrorBoundary,
  For,
  getOwner,
  lazy,
  Match,
  mergeProps,
  on,
  onCleanup,
  onMount,
  runWithOwner,
  Show,
  Suspense,
  Switch,
  splitProps,
  untrack,
  useContext,
} from '../index'
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

  // ─── JSX runtime ───────────────────────────────────────────────────────

  it('jsx-runtime exports are available', async () => {
    const jsxRuntime = await import('../jsx-runtime')
    expect(typeof jsxRuntime.jsx).toBe('function')
    expect(typeof jsxRuntime.jsxs).toBe('function')
    expect(typeof jsxRuntime.Fragment).toBe('symbol')
  })
})
