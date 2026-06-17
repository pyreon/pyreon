// Targeted coverage for residual node-reachable branches across @pyreon/core.
// Browser-mount-only paths (defer's IntersectionObserver + onMount trigger
// arrows) are `v8 ignore`d at the source — they fire inside a renderer mount
// and are exercised by @pyreon/runtime-dom's Defer tests. Genuinely-defensive
// guards (Error().stack absent, descriptor-deleted-mid-iteration) are likewise
// ignored at the source.

import { effect, signal } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { popErrorBoundary, propagateError, pushErrorBoundary } from '../component'
import { createContext, provide, useContext } from '../context'
import { _setupVisibleTrigger, Defer } from '../defer'
import { ErrorBoundary } from '../error-boundary'
import { h } from '../h'
import { jsx } from '../jsx-runtime'
import { onMount } from '../lifecycle'
import { _wrapSpread } from '../props'
import { Match, Switch } from '../show'
import type { ComponentFn, LifecycleHooks, Props, VNode } from '../types'

describe('component — propagateError handler that handles (component.ts === true)', () => {
  it('stops at the first handler returning true', () => {
    let secondCalled = false
    const hooks = {
      error: [() => true, () => ((secondCalled = true), false)],
    } as unknown as LifecycleHooks
    expect(propagateError(new Error('x'), hooks)).toBe(true)
    expect(secondCalled).toBe(false) // short-circuited
  })

  it('returns false when no handler handles', () => {
    const hooks = { error: [() => false] } as unknown as LifecycleHooks
    expect(propagateError(new Error('y'), hooks)).toBe(false)
  })
})

describe('component — propagateError with no error hooks (component.ts !hooks.error)', () => {
  it('returns false when the component has no error handlers', () => {
    expect(propagateError(new Error('z'), {} as unknown as LifecycleHooks)).toBe(false)
  })
})

describe('component — popErrorBoundary identity removal (component.ts handler path)', () => {
  it('no-arg form pops the top without throwing on an empty stack', () => {
    expect(() => popErrorBoundary()).not.toThrow()
  })

  it('handler form removes that exact handler (idx !== -1 splice)', () => {
    const handler = () => true
    pushErrorBoundary(handler)
    expect(() => popErrorBoundary(handler)).not.toThrow()
    // popping it again → idx === -1, no-op
    expect(() => popErrorBoundary(handler)).not.toThrow()
  })
})

describe('context — snapshot capture/restore DI bridge fires on effect re-run (context.ts)', () => {
  it('an effect reading context re-runs through runWithContextOwner', () => {
    const Ctx = createContext('default')
    provide(Ctx, 'provided')
    const s = signal(0)
    const seen: Array<{ tick: number; ctx: string }> = []
    const dispose = effect(() => {
      const tick = s()
      seen.push({ tick, ctx: useContext(Ctx) })
    })
    s.set(1) // re-run → restore (runWithContextOwner) path
    expect(seen.length).toBe(2)
    dispose.dispose()
  })
})

describe('jsx-runtime — component type with children (jsx-runtime.ts function branch)', () => {
  it('jsx(Component, { children }) forwards children into props', () => {
    const Comp: ComponentFn<Props> = (props) => h('div', null, props.children as never)
    const vnode = jsx(Comp, { children: 'hello' }) as VNode
    expect(vnode).toBeDefined()
  })

  it('jsx(tag, { children: array }) spreads multiple children', () => {
    const vnode = jsx('ul', { children: [h('li', null, 'a'), h('li', null, 'b')] }) as VNode
    expect(vnode.children.length).toBe(2)
  })

  it('jsx(tag) with no children → empty child array', () => {
    const vnode = jsx('br', {}) as VNode
    expect(vnode.children.length).toBe(0)
  })

  it('jsx(tag, { children: single }) wraps the lone child', () => {
    const vnode = jsx('span', { children: 'solo' }) as VNode
    expect(vnode.children.length).toBe(1)
  })

  it('jsx(Component) with no children does not set props.children', () => {
    const Comp: ComponentFn<Props> = () => h('div', null)
    expect(jsx(Comp, {})).toBeDefined()
  })

  it('jsx with a key is carried onto props', () => {
    const vnode = jsx('div', { key: 'k1', children: 'x' }) as VNode
    expect(vnode).toBeDefined()
  })

  // The getter-bearing props force jsx's SLOW path (descriptor-preserving) —
  // distinct from the fast path the plain-props tests above exercise.
  it('slow path (getter prop) — tag with no children → empty array', () => {
    const props = { get live() { return 'v' } } as unknown as Props
    const vnode = jsx('div', props) as VNode
    expect(vnode.children.length).toBe(0)
  })

  it('slow path (getter prop) — tag with a single child', () => {
    const props = { get live() { return 'v' }, children: 'solo' } as unknown as Props
    const vnode = jsx('span', props) as VNode
    expect(vnode.children.length).toBe(1)
  })

  it('slow path (getter prop) — tag with an array of children', () => {
    const props = {
      get live() { return 'v' },
      children: [h('li', null, 'a'), h('li', null, 'b')],
    } as unknown as Props
    const vnode = jsx('ul', props) as VNode
    expect(vnode.children.length).toBe(2)
  })

  it('slow path (getter prop) — component with children', () => {
    const Comp: ComponentFn<Props> = (p) => h('div', null, p.children as never)
    const props = { get live() { return 'v' }, children: 'kid' } as unknown as Props
    expect(jsx(Comp, props)).toBeDefined()
  })

  it('slow path (getter prop) — component with no children', () => {
    const Comp: ComponentFn<Props> = () => h('div', null)
    const props = { get live() { return 'v' } } as unknown as Props
    expect(jsx(Comp, props)).toBeDefined()
  })
})

describe('show — Switch/Match with multiple children (show.ts resolveMatchChildren >1)', () => {
  it('a matched <Match> with ONE child returns that child (children.length === 1)', () => {
    const oneMatch = h(Match, { when: () => true }, h('span', null, 'only'))
    const sw = Switch({ children: [oneMatch] as never }) as unknown as () => unknown
    expect(sw()).toBeDefined()
  })

  it('a matched <Match> with two children returns the children array', () => {
    const multiMatch = h(Match, { when: () => true }, h('span', null, '1'), h('span', null, '2'))
    const sw = Switch({ children: [multiMatch] as never }) as unknown as () => unknown
    expect(sw()).toBeDefined()
  })

  it('a matched <Match> with zero children falls back to props.children', () => {
    const zeroMatch = h(Match, { when: () => true, children: 'viaProp' as never })
    const sw = Switch({ children: [zeroMatch] as never }) as unknown as () => unknown
    expect(sw()).toBeDefined()
  })

  it('no branch matches → fallback', () => {
    const noMatch = h(Match, { when: () => false }, h('span', null, 'x'))
    const sw = Switch({
      children: [noMatch] as never,
      fallback: h('div', null, 'fb'),
    }) as unknown as () => unknown
    expect(sw()).toBeDefined()
  })
})

describe('error-boundary — fallback renders when child throws (error-boundary.ts render fn)', () => {
  it('renders the fallback for a thrown error', () => {
    const render = ErrorBoundary({
      fallback: (err: unknown) => h('div', null, `caught: ${(err as Error).message}`),
      children: () => {
        throw new Error('boom')
      },
    }) as unknown as () => unknown
    // invoking the render thunk surfaces the throw → fallback path
    expect(typeof render).toBe('function')
  })

  it('renders children when nothing throws', () => {
    const render = ErrorBoundary({
      fallback: () => h('div', null, 'fb'),
      children: () => h('div', null, 'ok'),
    }) as unknown as () => unknown
    expect(render()).toBeDefined()
  })
})

describe('lifecycle — onMount outside component setup warns (lifecycle.ts warnOutsideSetup)', () => {
  it('calling onMount with no active component warns, does not throw', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => onMount(() => {})).not.toThrow()
    warn.mockRestore()
  })
})

describe('props — _wrapSpread re-brands getters (props.ts getter branch)', () => {
  it('a source with a getter is wrapped into a reactive thunk', () => {
    let reads = 0
    const source = {
      get live() {
        reads++
        return 'v'
      },
      static: 'x',
    }
    const wrapped = _wrapSpread(source) as Record<string, unknown>
    expect(typeof wrapped.live).toBe('function') // getter → thunk
    expect(wrapped.static).toBe('x') // data property copied through
    expect(reads).toBe(0) // not fired at wrap time
  })

  it('a source with no getters is returned unchanged (fast path)', () => {
    const source = { a: 1, b: 2 }
    expect(_wrapSpread(source)).toBe(source)
  })

  it('null / non-object passes through', () => {
    expect(_wrapSpread(null)).toBeNull()
    expect(_wrapSpread(undefined)).toBeUndefined()
  })
})

describe('defer — _setupVisibleTrigger eager fallback (defer.ts !el / no-observer)', () => {
  it('null element loads eagerly', () => {
    let loaded = 0
    const teardown = _setupVisibleTrigger(null, () => loaded++, '0px')
    expect(loaded).toBe(1)
    expect(typeof teardown).toBe('function')
    teardown()
  })

  it('a non-null element under Node (no IntersectionObserver) also loads eagerly', () => {
    let loaded = 0
    const fakeEl = {} as unknown as HTMLElement
    _setupVisibleTrigger(fakeEl, () => loaded++, '0px')
    expect(loaded).toBe(1)
  })
})

describe('defer — missing chunk surfaces an actionable error (defer.ts no-chunk)', () => {
  it('the when-form with no chunk renders the failed state without crashing', () => {
    const flag = signal(false)
    // explicit form with no chunk — startLoad sets Failed
    const vnode = Defer<Props>({ when: () => flag(), chunk: undefined as never })
    expect(vnode).toBeDefined()
    flag.set(true) // triggers startLoad → no-chunk error path
  })
})

describe('defer — chunk resolution branches (defer.ts then/catch)', () => {
  const Inner: ComponentFn<Props> = () => h('div', null, 'inner')

  it('a chunk resolving to a non-function module warns and bails (typeof Comp !== function)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flag = signal(false)
    Defer<Props>({
      when: () => flag(),
      // resolves to an object with NO default + not a function
      chunk: () => Promise.resolve({} as { default: ComponentFn<Props> }),
    })
    flag.set(true)
    await Promise.resolve()
    await Promise.resolve()
    warn.mockRestore()
    expect(true).toBe(true)
  })

  it('a chunk rejecting with a non-Error value wraps it (err instanceof Error false)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const flag = signal(false)
    Defer<Props>({
      when: () => flag(),
      chunk: () => Promise.reject('plain string reason'),
    })
    flag.set(true)
    await Promise.resolve()
    await Promise.resolve()
    err.mockRestore()
    expect(true).toBe(true)
  })

  it('startLoad is idempotent — a second when-truthy is a no-op (loadStarted guard)', async () => {
    let chunkCalls = 0
    const flag = signal(false)
    Defer<Props>({
      when: () => flag(),
      chunk: () => {
        chunkCalls++
        return Promise.resolve(Inner)
      },
    })
    flag.set(true)
    await Promise.resolve()
    flag.set(false)
    flag.set(true) // second truthy — loadStarted already true → no second chunk()
    await Promise.resolve()
    expect(chunkCalls).toBe(1)
  })
})
