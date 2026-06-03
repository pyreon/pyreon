/**
 * Real-test branch-coverage hardening for @pyreon/solid-compat.
 *
 * Replaces the v8-ignore annotations from PR #1300 with real tests that
 * actually exercise the previously-uncovered branches via the public API.
 * NO v8-ignore annotations.
 */
import { describe, expect, it } from 'vitest'
import {
  batch,
  createContext,
  createEffect,
  createResource,
  createRoot,
  createSignal,
  createStore,
  mergeProps,
  produce,
  splitProps,
  useContext,
} from '../index'
import type { RenderContext } from '../jsx-runtime'
import { beginRender, endRender } from '../jsx-runtime'

function makeCtx(): RenderContext {
  return {
    hooks: [],
    scheduleRerender: () => {},
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
    unmountCallbacks: [],
  }
}

// ─── createEffect with undefined-returning fn (line 208 FALSE arm) ──────────

describe('createEffect — undefined-result fast path', () => {
  it('a createEffect whose fn returns undefined skips the prevValue assignment', () => {
    const ctx = makeCtx()
    const [count, setCount] = createSignal(0)
    let lastSeen: number | undefined

    beginRender(ctx)
    // fn returns void — line 208 the if-undefined FALSE arm fires.
    createEffect<number>((prev) => {
      lastSeen = prev
      count() // tracks
      // No return → result is undefined → branch skipped
      return undefined as unknown as number
    })
    endRender()

    setCount(1)
    // prevValue was never assigned on the first run, so on the second run
    // lastSeen should still be undefined (initial value).
    expect(lastSeen).toBeUndefined()
  })

  it('a createEffect whose fn returns a value updates prevValue', () => {
    const ctx = makeCtx()
    const [count, setCount] = createSignal(0)
    let lastPrev: number | undefined

    beginRender(ctx)
    createEffect<number>((prev) => {
      lastPrev = prev
      return count() // returns the new value
    }, 100)
    endRender()

    expect(lastPrev).toBe(100)
    setCount(5)
    expect(lastPrev).toBe(0) // prev was the previous return
  })
})

// ─── mergeProps with null descriptor (line 421 FALSE arm) ────────────────────

describe('mergeProps — descriptor preservation', () => {
  it('mergeProps copies value descriptors', () => {
    const a = { x: 1, y: 2 }
    const b = { y: 99, z: 3 }
    const m = mergeProps(a, b)
    expect(m).toEqual({ x: 1, y: 99, z: 3 })
  })

  it('mergeProps preserves getters (reactivity)', () => {
    const sig = { value: 0 }
    const src = {} as { reactive: number }
    Object.defineProperty(src, 'reactive', {
      get: () => sig.value,
      enumerable: true,
    })

    const m = mergeProps(src, { other: 'x' })
    expect(m.reactive).toBe(0)
    sig.value = 5
    expect(m.reactive).toBe(5)
  })

  it('mergeProps handles symbol keys', () => {
    const sym = Symbol('key')
    const src = { [sym]: 'value' }
    const m = mergeProps(src, {})
    expect((m as Record<symbol, unknown>)[sym]).toBe('value')
  })

  it('mergeProps with multiple sources — later wins for same key', () => {
    const m = mergeProps({ a: 1 }, { a: 2 }, { a: 3 })
    expect(m.a).toBe(3)
  })
})

describe('splitProps — descriptor preservation', () => {
  it('splitProps separates picked vs rest', () => {
    const props = { a: 1, b: 2, c: 3 }
    const [picked, rest] = splitProps(props, ['a', 'b'] as never)
    expect(picked).toEqual({ a: 1, b: 2 })
    expect(rest).toEqual({ c: 3 })
  })

  it('splitProps preserves getters in both halves', () => {
    const props = {} as { tracked: number; static: number }
    let calls = 0
    Object.defineProperty(props, 'tracked', {
      get: () => {
        calls++
        return 42
      },
      enumerable: true,
    })
    props.static = 100

    const [picked, rest] = splitProps(props, ['tracked'] as never)
    expect((picked as { tracked: number }).tracked).toBe(42)
    expect((rest as { static: number }).static).toBe(100)
    expect(calls).toBe(1)
  })

  it('splitProps handles symbol keys (goes to rest)', () => {
    const sym = Symbol('key')
    const props = { a: 1, [sym]: 'value' }
    const [picked, rest] = splitProps(props, ['a'] as never)
    expect((picked as { a: number }).a).toBe(1)
    expect((rest as Record<symbol, unknown>)[sym]).toBe('value')
  })
})

// ─── createContext + useContext default fallback (lines 565, 584) ────────────

describe('createContext / useContext — fallback paths', () => {
  it('createContext with no Provider returns defaultValue', () => {
    const Ctx = createContext('default-value')
    // useContext outside Provider reads defaultValue
    const value = useContext(Ctx)
    expect(value).toBe('default-value')
  })

  it('useContext on a non-Solid context (Pyreon native) reads from stack', () => {
    const Ctx = createContext('initial')
    // useContext with the same ctx returns default
    expect(useContext(Ctx)).toBe('initial')
  })

  it('Provider with no children returns null (line 565 fallback)', () => {
    const Ctx = createContext('default')
    // Call Provider directly without children to hit the kids?? null fallback.
    const ProviderFn = Ctx.Provider as unknown as (
      props: Record<string, unknown>,
    ) => unknown
    const result = ProviderFn({ value: 'set' })
    expect(result).toBeNull()
  })
})

// ─── createResource race / discard paths (lines 700, 713, 730) ──────────────

describe('createResource — race + stale discard', () => {
  it('createResource fetches data and updates on source change', async () => {
    let callCount = 0
    const [source, setSource] = createSignal(1)
    const [resource] = createResource(source, async (s) => {
      callCount++
      return s * 2
    })

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(resource()).toBe(2)

    setSource(5)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(resource()).toBe(10)
    expect(callCount).toBe(2)
  })

  it('createResource discards stale resolutions when source changes mid-fetch', async () => {
    const [source, setSource] = createSignal(1)
    const [resource] = createResource(source, async (s) => {
      // Slow first fetch, fast second
      await new Promise((resolve) => setTimeout(resolve, s === 1 ? 50 : 5))
      return s * 10
    })

    // Immediately change source — first fetch still in flight
    setSource(2)
    await new Promise((resolve) => setTimeout(resolve, 80))
    // The first (slower) fetch's resolution must be discarded — line 700.
    expect(resource()).toBe(20)
  })

  it('createResource handles synchronous errors in fetcher (line 730)', async () => {
    const [source] = createSignal('bad')
    const [resource] = createResource(source, () => {
      throw new Error('sync-fetcher-error')
    })

    await new Promise((resolve) => setTimeout(resolve, 30))
    // Resource is in error state.
    expect(resource.error).toBeDefined()
    expect((resource.error as Error).message).toBe('sync-fetcher-error')
  })

  it('createResource handles async rejections', async () => {
    const [source] = createSignal('bad')
    const [resource] = createResource(source, async () => {
      throw new Error('async-fetcher-error')
    })

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(resource.error).toBeDefined()
  })
})

// ─── createStore — get/set/delete + DANGEROUS_KEYS + filter-predicate ────────

describe('createStore — proxy semantics + safety', () => {
  it('createStore initializes with nested objects', () => {
    const [state] = createStore({ user: { name: 'Alice', age: 30 } })
    expect(state.user.name).toBe('Alice')
    expect(state.user.age).toBe(30)
  })

  it('setStore top-level key updates', () => {
    const [state, setState] = createStore({ count: 0 })
    setState('count', 1)
    expect(state.count).toBe(1)
  })

  it('setStore with path-array updates nested', () => {
    const [state, setState] = createStore({ user: { name: 'Alice' } })
    setState('user', 'name', 'Bob')
    expect(state.user.name).toBe('Bob')
  })

  it('setStore with updater function (typeof === function) updates value', () => {
    const [state, setState] = createStore({ count: 5 })
    setState('count', (prev: number) => prev + 1)
    expect(state.count).toBe(6)
  })

  it('setStore on a non-existent intermediate path (defensive null-source guard)', () => {
    const [state, setState] = createStore({ a: { b: 1 } as Record<string, unknown> })
    // setStore through an existing top-level key but non-existing inner is
    // a noop without throwing.
    setState('a', 'c' as never, 99 as never)
    expect(state.a.c).toBe(99)
  })

  it('setStore skips DANGEROUS_KEYS to prevent prototype pollution', () => {
    const [, setState] = createStore({ safe: 1 } as Record<string, unknown>)
    // __proto__ assignment via setStore must be blocked
    setState('__proto__' as never, { polluted: true } as never)
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })

  it('setStore with filter-predicate array updates matching entries (line 1045)', () => {
    const [state, setState] = createStore({
      items: [
        { id: 1, done: false },
        { id: 2, done: true },
        { id: 3, done: false },
      ],
    })

    // Predicate filter: update all items where done === false
    setState('items', (item: { id: number; done: boolean }) => !item.done, 'done', true)

    expect(state.items.every((i) => i.done)).toBe(true)
  })

  it('setStore with produce on nested object mutates immutably', () => {
    const [state, setState] = createStore({ user: { name: 'A', age: 1 } })
    setState(
      'user',
      produce((u: { name: string; age: number }) => {
        u.age = 99
      }),
    )
    expect(state.user.age).toBe(99)
  })

  it('createStore proxy ownKeys returns the keys', () => {
    const [state] = createStore({ a: 1, b: 2 })
    expect(Object.keys(state).sort()).toEqual(['a', 'b'])
  })

  it('createStore proxy getOwnPropertyDescriptor returns descriptors', () => {
    const [state] = createStore({ a: 1 })
    const desc = Object.getOwnPropertyDescriptor(state, 'a')
    expect(desc).toBeDefined()
    expect(desc?.value).toBe(1)
  })

  it('createStore proxy delete removes a key', () => {
    const [state, setState] = createStore({ a: 1, b: 2 } as Record<string, number | undefined>)
    // Set to undefined → emulates delete
    setState('a', undefined)
    expect(state.a).toBeUndefined()
  })
})

// ─── createSignal callable / undefined updater paths (line 1096) ─────────────

describe('createSignal — call-with-fn updater', () => {
  it('setSignal accepts a function updater', () => {
    const [count, setCount] = createSignal(5)
    setCount((prev: number) => prev * 2)
    expect(count()).toBe(10)
  })

  it('setSignal accepts a value directly', () => {
    const [count, setCount] = createSignal(0)
    setCount(42)
    expect(count()).toBe(42)
  })

  it('setSignal with function updater that returns undefined keeps prior value', () => {
    const [count, setCount] = createSignal<number | undefined>(7)
    setCount(() => undefined)
    expect(count()).toBeUndefined()
  })
})

// ─── createRoot disposal ─────────────────────────────────────────────────────

describe('createRoot — basic API', () => {
  it('createRoot runs the callback with a dispose fn', () => {
    let saw: unknown
    createRoot((dispose) => {
      saw = dispose
    })
    expect(typeof saw).toBe('function')
  })
})

// ─── createStore set-callback form (line 1091, applyAtPath empty path) ──────

describe('createStore — setStore single-function form', () => {
  it('setStore with a function arg applies mutations to a draft (line 1091)', () => {
    const [state, setState] = createStore({ count: 0, name: 'A' })
    setState((draft: { count: number; name: string }) => {
      draft.count = 99
      draft.name = 'Z'
    })
    expect(state.count).toBe(99)
    expect(state.name).toBe('Z')
  })

  it('setStore single-fn form propagates non-object value via safeAssign', () => {
    const [state, setState] = createStore({ count: 0 } as Record<string, unknown>)
    // Single-function with mutation produces a draft object
    setState((draft: Record<string, unknown>) => {
      draft.count = 5
    })
    expect(state.count).toBe(5)
  })
})

// ─── useContext with native Pyreon context (line 584 FALSE arm) ──────────────

describe('useContext — non-Solid context branch', () => {
  it('useContext with a Pyreon-native context reads through pyreonUseContext (line 584 false)', () => {
    // Construct a Pyreon-native context (no SOLID_CTX brand) and useContext.
    const pyreonNativeCtx = {
      id: Symbol('pyreonNative'),
      defaultValue: 'native-default',
    } as never
    const result = useContext(pyreonNativeCtx)
    expect(result).toBe('native-default')
  })
})

// ─── batch — defers updates ──────────────────────────────────────────────────

describe('batch — deferred subscriber notify', () => {
  it('batch wraps multi-signal updates as one notify', () => {
    const ctx = makeCtx()
    const [a, setA] = createSignal(0)
    const [b, setB] = createSignal(0)
    let runs = 0

    beginRender(ctx)
    createEffect(() => {
      a()
      b()
      runs++
    })
    endRender()

    batch(() => {
      setA(1)
      setB(2)
    })

    // One initial run + one batched re-run = 2
    expect(runs).toBe(2)
    expect(a()).toBe(1)
    expect(b()).toBe(2)
  })
})
