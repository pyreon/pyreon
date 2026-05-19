import type { ComponentFn } from '@pyreon/core'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import { describe, expect, it, vi } from 'vitest'
import type { RenderContext } from '../jsx-runtime'
import { beginRender, endRender, getCurrentCtx, jsx } from '../jsx-runtime'
import {
  afterUpdate,
  beforeUpdate,
  createEventDispatcher,
  derived,
  flushSync,
  get,
  getAllContexts,
  getContext,
  hasContext,
  mount,
  onDestroy,
  onMount,
  readable,
  readonly,
  setContext,
  tick,
  unmount,
  writable,
} from '../index'

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Runs `fn` inside a fresh RenderContext to exercise hook-index code paths. */
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

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('@pyreon/svelte-compat — svelte/store', () => {
  // ─── writable ──────────────────────────────────────────────────────────

  it('writable calls subscriber synchronously with the initial value', () => {
    const store = writable(1)
    const seen: number[] = []
    store.subscribe((v) => seen.push(v))
    expect(seen).toEqual([1])
  })

  it('writable set notifies subscribers', () => {
    const store = writable(0)
    const seen: number[] = []
    store.subscribe((v) => seen.push(v))
    store.set(5)
    expect(seen).toEqual([0, 5])
  })

  it('writable update applies the updater to the current value', () => {
    const store = writable(10)
    const seen: number[] = []
    store.subscribe((v) => seen.push(v))
    store.update((n) => n + 3)
    expect(seen).toEqual([10, 13])
  })

  it('writable supports multiple independent subscribers', () => {
    const store = writable('a')
    const a: string[] = []
    const b: string[] = []
    store.subscribe((v) => a.push(v))
    store.subscribe((v) => b.push(v))
    store.set('b')
    expect(a).toEqual(['a', 'b'])
    expect(b).toEqual(['a', 'b'])
  })

  it('writable unsubscribe stops further notifications', () => {
    const store = writable(0)
    const seen: number[] = []
    const unsub = store.subscribe((v) => seen.push(v))
    store.set(1)
    unsub()
    store.set(2)
    expect(seen).toEqual([0, 1])
  })

  it('writable invalidate fires before run on change', () => {
    const store = writable(0)
    const order: string[] = []
    store.subscribe(
      () => order.push('run'),
      () => order.push('invalidate'),
    )
    store.set(1)
    // Real Svelte semantics: the initial subscribe calls `run` only (no
    // `invalidate`); each subsequent change is the two-phase
    // `invalidate` → `run`. So: run(0), then invalidate(1), run(1).
    expect(order).toEqual(['run', 'invalidate', 'run'])
  })

  it('writable runs start on first subscriber and stop on last', () => {
    const start = vi.fn(() => stop)
    const stop = vi.fn()
    const store = writable<number>(0, start)
    expect(start).not.toHaveBeenCalled()
    const u1 = store.subscribe(() => {})
    expect(start).toHaveBeenCalledTimes(1)
    const u2 = store.subscribe(() => {})
    expect(start).toHaveBeenCalledTimes(1) // not called again
    u1()
    expect(stop).not.toHaveBeenCalled() // still one subscriber
    u2()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('writable start can push values via its set argument', () => {
    const store = writable<number>(0, (set) => {
      set(42)
      return () => {}
    })
    expect(get(store)).toBe(42)
  })

  // ─── readable ──────────────────────────────────────────────────────────

  it('readable exposes only subscribe', () => {
    const store = readable(7)
    expect(typeof store.subscribe).toBe('function')
    expect((store as unknown as Record<string, unknown>).set).toBeUndefined()
    expect(get(store)).toBe(7)
  })

  it('readable start notifier can drive values', () => {
    const store = readable<number>(0, (set) => {
      set(99)
    })
    expect(get(store)).toBe(99)
  })

  // ─── readonly ──────────────────────────────────────────────────────────

  it('readonly returns a subscribe-only view of a writable', () => {
    const w = writable(1)
    const ro = readonly(w)
    expect((ro as unknown as Record<string, unknown>).set).toBeUndefined()
    const seen: number[] = []
    ro.subscribe((v) => seen.push(v))
    w.set(2)
    expect(seen).toEqual([1, 2])
  })

  // ─── get ───────────────────────────────────────────────────────────────

  it('get reads the current value without keeping a subscription', () => {
    const store = writable(123)
    expect(get(store)).toBe(123)
    store.set(456)
    expect(get(store)).toBe(456)
  })

  // ─── derived ───────────────────────────────────────────────────────────

  it('derived (single store, sync) maps the source value', () => {
    const n = writable(2)
    const doubled = derived(n, (v: number) => v * 2)
    const seen: number[] = []
    doubled.subscribe((v) => seen.push(v))
    expect(seen).toEqual([4])
    n.set(5)
    expect(seen).toEqual([4, 10])
  })

  it('derived (array of stores, sync) combines values', () => {
    const a = writable(1)
    const b = writable(2)
    const sum = derived([a, b], ([x, y]: [number, number]) => x + y)
    const seen: number[] = []
    sum.subscribe((v) => seen.push(v))
    expect(seen).toEqual([3])
    a.set(10)
    expect(seen).toEqual([3, 12])
    b.set(20)
    expect(seen).toEqual([3, 12, 30])
  })

  it('derived (async set form) shows the initial value then the async value', async () => {
    const n = writable(1)
    const async = derived(
      n,
      (v: number, set: (x: number) => void) => {
        // Deferred set models a real async source (fetch/timer): the
        // initial value is shown until the async result lands.
        const id = setTimeout(() => set(v + 100), 0)
        return () => clearTimeout(id)
      },
      0,
    )
    const seen: number[] = []
    async.subscribe((v) => seen.push(v))
    expect(seen).toEqual([0]) // initial value, async not yet resolved
    await new Promise((r) => setTimeout(r, 10))
    expect(seen).toEqual([0, 101])
    n.set(2)
    await new Promise((r) => setTimeout(r, 10))
    expect(seen).toEqual([0, 101, 102])
  })

  it('derived (async form) runs the returned cleanup before the next run', () => {
    const n = writable(1)
    const cleanup = vi.fn()
    const d = derived(
      n,
      (v: number, set: (x: number) => void) => {
        set(v)
        return cleanup
      },
      0,
    )
    const unsub = d.subscribe(() => {})
    expect(cleanup).not.toHaveBeenCalled()
    n.set(2) // re-runs sync → previous cleanup fires
    expect(cleanup).toHaveBeenCalledTimes(1)
    unsub() // last subscriber → start's stop runs final cleanup
    expect(cleanup).toHaveBeenCalledTimes(2)
  })
})

describe('@pyreon/svelte-compat — svelte lifecycle', () => {
  it('onMount runs after the first render and its cleanup on unmount', async () => {
    const mounted = vi.fn()
    const cleaned = vi.fn()
    const Comp: ComponentFn = () => {
      onMount(() => {
        mounted()
        return cleaned
      })
      return jsx('div', { children: 'hi' })
    }
    const el = container()
    const dispose = pyreonMount(jsx(Comp, {}), el)
    await new Promise((r) => setTimeout(r, 30))
    expect(mounted).toHaveBeenCalledTimes(1)
    dispose()
    expect(cleaned).toHaveBeenCalledTimes(1)
  })

  it('onMount is hook-index-stable across re-renders (no double registration)', () => {
    const runner = createHookRunner()
    const fn = vi.fn()
    // First render: registers (pendingEffects gets the entry, hook slot set).
    runner.run(() => onMount(fn))
    expect(runner.ctx.pendingEffects).toHaveLength(1)
    expect(runner.ctx.hooks).toHaveLength(1)
    // Re-render: beginRender clears pendingEffects; the hook-index guard
    // must NOT re-push (onMount runs exactly once, Svelte semantics).
    runner.run(() => onMount(fn))
    expect(runner.ctx.pendingEffects).toHaveLength(0)
    expect(runner.ctx.hooks).toHaveLength(1)
  })

  it('onMount outside a component falls back to the Pyreon lifecycle', () => {
    // No current ctx → exercises the pyreonOnMount branch (no throw).
    expect(() => onMount(() => {})).not.toThrow()
  })

  it('onDestroy runs when the component unmounts', async () => {
    const destroyed = vi.fn()
    const Comp: ComponentFn = () => {
      onDestroy(destroyed)
      return jsx('div', { children: 'x' })
    }
    const el = container()
    const dispose = pyreonMount(jsx(Comp, {}), el)
    await new Promise((r) => setTimeout(r, 10))
    dispose()
    expect(destroyed).toHaveBeenCalledTimes(1)
  })

  it('onDestroy is hook-index-stable across re-renders', () => {
    const runner = createHookRunner()
    const fn = vi.fn()
    runner.run(() => onDestroy(fn))
    runner.run(() => onDestroy(fn))
    expect(runner.ctx.unmountCallbacks).toHaveLength(1)
  })

  it('onDestroy outside a component does not throw', () => {
    expect(() => onDestroy(() => {})).not.toThrow()
  })

  it('beforeUpdate runs once before the first render commits', () => {
    const runner = createHookRunner()
    const fn = vi.fn()
    runner.run(() => beforeUpdate(fn))
    runner.run(() => beforeUpdate(fn))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('beforeUpdate outside a component runs immediately', () => {
    const fn = vi.fn()
    beforeUpdate(fn)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('afterUpdate runs after the first render', async () => {
    const fn = vi.fn()
    const Comp: ComponentFn = () => {
      afterUpdate(fn)
      return jsx('div', { children: 'a' })
    }
    const el = container()
    pyreonMount(jsx(Comp, {}), el)
    await new Promise((r) => setTimeout(r, 30))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('tick resolves after the current microtask', async () => {
    let flag = false
    queueMicrotask(() => {
      flag = true
    })
    await tick()
    expect(flag).toBe(true)
  })
})

describe('@pyreon/svelte-compat — svelte context', () => {
  it('setContext/getContext propagate through the component tree', () => {
    const KEY = Symbol('theme')
    const Consumer: ComponentFn = () => {
      const theme = getContext<string>(KEY)
      return jsx('span', { 'data-theme': theme, children: theme })
    }
    const Provider: ComponentFn = () => {
      setContext(KEY, 'dark')
      return jsx(Consumer, {})
    }
    const el = container()
    pyreonMount(jsx(Provider, { children: undefined }), el)
    const span = el.querySelector('span')
    expect(span?.getAttribute('data-theme')).toBe('dark')
  })

  it('hasContext reports whether a value was provided', () => {
    const KEY = 'k'
    let inside = false
    let outside = true
    const Consumer: ComponentFn = () => {
      inside = hasContext(KEY)
      return jsx('i', {})
    }
    const Provider: ComponentFn = () => {
      setContext(KEY, 1)
      return jsx(Consumer, {})
    }
    const Bare: ComponentFn = () => {
      outside = hasContext('never-set')
      return jsx('i', {})
    }
    const el = container()
    pyreonMount(jsx(Provider, {}), el)
    pyreonMount(jsx(Bare, {}), container())
    expect(inside).toBe(true)
    expect(outside).toBe(false)
  })

  it('getAllContexts returns a Map (best-effort)', () => {
    expect(getAllContexts()).toBeInstanceOf(Map)
  })

  it('setContext returns the provided value', () => {
    let returned: unknown
    const Comp: ComponentFn = () => {
      returned = setContext('x', 99)
      return jsx('i', {})
    }
    pyreonMount(jsx(Comp, {}), container())
    expect(returned).toBe(99)
  })
})

describe('@pyreon/svelte-compat — createEventDispatcher', () => {
  it('dispatches a CustomEvent to the on<Type> prop', async () => {
    const handler = vi.fn()
    const Child: ComponentFn = () => {
      const dispatch = createEventDispatcher<{ ping: number }>()
      onMount(() => {
        dispatch('ping', 7)
      })
      return jsx('span', { children: 'child' })
    }
    const Parent: ComponentFn = () => jsx(Child, { onPing: handler })
    const el = container()
    pyreonMount(jsx(Parent, {}), el)
    await new Promise((r) => setTimeout(r, 30))
    expect(handler).toHaveBeenCalledTimes(1)
    const evt = handler.mock.calls[0]![0] as CustomEvent
    expect(evt.type).toBe('ping')
    expect(evt.detail).toBe(7)
  })

  it('returns true when the event is not cancelled', () => {
    let result: boolean | undefined
    const Child: ComponentFn = () => {
      const dispatch = createEventDispatcher<{ go: void }>()
      result = dispatch('go')
      return jsx('i', {})
    }
    pyreonMount(jsx(Child, {}), container())
    expect(result).toBe(true)
  })
})

describe('@pyreon/svelte-compat — mount/unmount/flushSync', () => {
  it('mount renders a component into the target and unmount removes it', () => {
    const App = () => jsx('div', { id: 'svelte-app', children: 'mounted' })
    const target = container()
    const mounted = mount(App, { target })
    expect(target.querySelector('#svelte-app')?.textContent).toBe('mounted')
    unmount(mounted as Record<symbol, unknown>)
    expect(target.querySelector('#svelte-app')).toBeNull()
  })

  it('mount passes props through to the component', () => {
    const App = (props: { label: string }) => jsx('div', { id: 'lbl', children: props.label })
    const target = container()
    mount(App, { target, props: { label: 'hello' } })
    expect(target.querySelector('#lbl')?.textContent).toBe('hello')
  })

  it('unmount is a no-op on an object never mounted', () => {
    expect(() => unmount({} as Record<symbol, unknown>)).not.toThrow()
  })

  it('flushSync invokes fn and returns its result', () => {
    expect(flushSync(() => 42)).toBe(42)
  })

  it('flushSync with no fn returns undefined', () => {
    expect(flushSync()).toBeUndefined()
  })
})

describe('@pyreon/svelte-compat — jsx-runtime coverage', () => {
  it('native components pass through without wrapping', async () => {
    const { Show } = await import('../index')
    const vnode = jsx(Show as ComponentFn, {
      when: () => true,
      children: jsx('span', { children: 'hi' }),
    })
    expect(vnode.type).toBe(Show)
  })

  it('jsx forwards a key prop', () => {
    const vnode = jsx('div', { children: 'test' }, 'my-key')
    expect(vnode.props.key).toBe('my-key')
  })

  it('jsx handles no children and array children', () => {
    expect(jsx('div', { class: 'empty' })).toBeDefined()
    const list = jsx('ul', {
      children: [jsx('li', { children: 'a' }), jsx('li', { children: 'b' })],
    })
    expect(list).toBeDefined()
  })

  it('wrapCompatComponent caches the wrapper per component', () => {
    const Comp: ComponentFn = () => jsx('div', { children: 'c' })
    const v1 = jsx(Comp, {})
    const v2 = jsx(Comp, {})
    expect(v1.type).toBe(v2.type)
  })

  it('component re-renders on store change and patches the DOM', async () => {
    const count = writable(0)
    const Comp: ComponentFn = () => {
      let v = 0
      count.subscribe((n) => {
        v = n
      })
      return jsx('span', { id: 'cnt', children: String(v) })
    }
    const el = container()
    const dispose = pyreonMount(jsx(Comp, {}), el)
    expect(el.querySelector('#cnt')?.textContent).toBe('0')
    count.set(3)
    await new Promise((r) => setTimeout(r, 30))
    expect(el.querySelector('#cnt')?.textContent).toBe('3')
    dispose()
  })

  it('scheduleRerender after unmount does not re-render', async () => {
    const count = writable(0)
    let renders = 0
    const Comp: ComponentFn = () => {
      renders++
      count.subscribe(() => {})
      return jsx('span', { children: 'x' })
    }
    const el = container()
    const dispose = pyreonMount(jsx(Comp, {}), el)
    await new Promise((r) => setTimeout(r, 10))
    const before = renders
    dispose()
    count.set(1)
    await new Promise((r) => setTimeout(r, 30))
    expect(renders).toBe(before)
  })

  it('layout effects pushed during render run with cleanup', () => {
    const log: string[] = []
    let pushed = false
    const Comp: ComponentFn = () => {
      const ctx = getCurrentCtx()!
      if (!pushed) {
        pushed = true
        ctx.pendingLayoutEffects.push({
          fn: () => {
            log.push('run')
            return () => log.push('cleanup')
          },
          deps: undefined,
          cleanup: undefined,
        })
      }
      return jsx('div', { children: 'lf' })
    }
    pyreonMount(jsx(Comp, {}), container())
    expect(log).toContain('run')
  })
})
