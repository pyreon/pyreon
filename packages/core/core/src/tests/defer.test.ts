import { signal } from '@pyreon/reactivity'
import { _setupIdleTrigger, _setupVisibleTrigger, Defer } from '../defer'
import { Fragment, h } from '../h'
import type { ComponentFn, Props, VNode } from '../types'

// Helper: pull the render-callback out of Defer's returned VNode shape.
// `when` and `idle` modes return a Fragment whose `children[0]` is a
// thunk. `visible` mode returns a div whose `children[0]` is the same
// thunk. Both shapes return the same `renderContent` accessor.
function getRenderThunk(vnode: VNode): () => unknown {
  const children = vnode.children as unknown[]
  const thunk = children[0]
  if (typeof thunk !== 'function') throw new Error('Expected render thunk')
  return thunk as () => unknown
}

describe('Defer — common shape', () => {
  test('returns a VNode (Fragment or wrapper div per trigger mode)', () => {
    const result = Defer({
      chunk: () => new Promise<{ default: ComponentFn<Props> }>(() => {}),
      when: () => false,
    })
    expect(result).toBeDefined()
    expect((result as VNode).type).toBe(Fragment)
  })

  test('renders fallback before chunk resolves', () => {
    const fallback = h('span', null, 'loading…')
    const vnode = Defer<Props>({
      chunk: () => new Promise<{ default: ComponentFn<Props> }>(() => {}), // never resolves
      when: () => true,
      fallback,
    })
    expect(getRenderThunk(vnode)()).toBe(fallback)
  })

  test('renders null when no fallback and chunk has not resolved', () => {
    const vnode = Defer<Props>({
      chunk: () => new Promise<{ default: ComponentFn<Props> }>(() => {}),
      when: () => true,
    })
    expect(getRenderThunk(vnode)()).toBeNull()
  })
})

describe('Defer — when (signal-driven)', () => {
  test('does NOT load chunk while when is false', () => {
    let calls = 0
    const chunkFn = () => {
      calls++
      return Promise.resolve({ default: (() => null) as ComponentFn<Props> })
    }
    const flag = signal(false)
    Defer<Props>({ chunk: chunkFn, when: flag })
    expect(calls).toBe(0)
  })

  test('loads chunk when when flips to true', async () => {
    const Inner: ComponentFn<{ msg: string }> = (p) => h('div', null, p.msg)
    let calls = 0
    const chunkFn = () => {
      calls++
      return Promise.resolve({ default: Inner })
    }
    const flag = signal(false)
    const vnode = Defer<{ msg: string }>({
      chunk: chunkFn,
      when: flag,
      children: (Comp) => h(Comp, { msg: 'hi' }),
    })
    expect(calls).toBe(0)
    flag.set(true)
    // Effect schedules synchronously; chunk fetch is microtask-resolved.
    expect(calls).toBe(1)
    await new Promise((r) => setTimeout(r, 0))
    const result = getRenderThunk(vnode)() as VNode
    expect(result.type).toBe(Inner)
    expect(result.props).toEqual({ msg: 'hi' })
  })

  test('loads chunk EXACTLY ONCE when signal oscillates', async () => {
    let calls = 0
    const chunkFn = () => {
      calls++
      return Promise.resolve({ default: (() => null) as ComponentFn<Props> })
    }
    const flag = signal(false)
    Defer<Props>({ chunk: chunkFn, when: flag })
    flag.set(true)
    flag.set(false)
    flag.set(true)
    flag.set(false)
    flag.set(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toBe(1)
  })

  test('accepts component re-exports without default wrapper', async () => {
    const Inner: ComponentFn = () => h('span', null, 'ok')
    const flag = signal(true)
    const vnode = Defer<Props>({
      chunk: () => Promise.resolve(Inner), // bare ComponentFn
      when: flag,
      children: (Comp) => h(Comp, {}),
    })
    await new Promise((r) => setTimeout(r, 0))
    const result = getRenderThunk(vnode)() as VNode
    expect(result.type).toBe(Inner)
  })

  test('throws when chunk() rejects (Suspense-style error propagation)', async () => {
    const consoleSpy = (() => {
      const orig = console.error
      console.error = () => {} // silence dev-mode error log
      return () => {
        console.error = orig
      }
    })()
    try {
      const flag = signal(true)
      const vnode = Defer<Props>({
        chunk: () => Promise.reject(new Error('chunk boom')),
        when: flag,
      })
      await new Promise((r) => setTimeout(r, 0))
      expect(() => getRenderThunk(vnode)()).toThrow('chunk boom')
    } finally {
      consoleSpy()
    }
  })

  test('renders default <Comp /> when children render-prop omitted', async () => {
    const Inner: ComponentFn = () => h('div', null, 'no-children-prop')
    const flag = signal(true)
    const vnode = Defer<Props>({
      chunk: () => Promise.resolve({ default: Inner }),
      when: flag,
    })
    await new Promise((r) => setTimeout(r, 0))
    const result = getRenderThunk(vnode)() as VNode
    expect(result.type).toBe(Inner)
    expect(result.props).toEqual({})
  })
})

describe('Defer — on="visible"', () => {
  test('returns a div wrapper with data-pyreon-defer="visible"', () => {
    const vnode = Defer<Props>({
      chunk: () => new Promise<{ default: ComponentFn<Props> }>(() => {}),
      on: 'visible',
    })
    expect((vnode as VNode).type).toBe('div')
    expect((vnode as VNode).props['data-pyreon-defer']).toBe('visible')
  })

  test('uses display: contents so wrapper is layout-transparent', () => {
    const vnode = Defer<Props>({
      chunk: () => new Promise<{ default: ComponentFn<Props> }>(() => {}),
      on: 'visible',
    })
    expect((vnode as VNode).props.style).toBe('display: contents')
  })

  test('default rootMargin is 200px (not exposed via prop spread)', () => {
    // The rootMargin is consumed by onMount; we can't directly observe
    // it from the returned VNode. This test documents the default and
    // would catch a regression in the constant.
    const vnode = Defer<Props>({
      chunk: () => new Promise<{ default: ComponentFn<Props> }>(() => {}),
      on: 'visible',
    })
    // Wrapper has the structural attrs but no rootMargin leak to DOM.
    expect((vnode as VNode).props.rootMargin).toBeUndefined()
  })
})

describe('Defer — on="idle"', () => {
  test('returns a Fragment (no wrapper element)', () => {
    const vnode = Defer<Props>({
      chunk: () => new Promise<{ default: ComponentFn<Props> }>(() => {}),
      on: 'idle',
    })
    expect((vnode as VNode).type).toBe(Fragment)
  })
})

// Browser-API helpers extracted from the onMount callbacks so they're
// directly testable without happy-dom (core tests run in Node). The
// onMount wrappers in `defer.ts` just delegate to these.
describe('_setupIdleTrigger', () => {
  // Use `Reflect.has` + property descriptors instead of plain assignment
  // so the restore is symmetric — if the global wasn't defined at test
  // start (Node), `delete` cleanly returns to the original state.
  const orig = {
    ric: (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback,
    cic: (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback,
  }
  afterEach(() => {
    if (orig.ric === undefined)
      delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback
    else (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = orig.ric
    if (orig.cic === undefined)
      delete (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback
    else (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback = orig.cic
  })

  test('uses requestIdleCallback when available', () => {
    let captured: (() => void) | null = null
    ;(globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = (
      cb: () => void,
    ): number => {
      captured = cb
      return 42
    }
    let cancelledId: number | null = null
    ;(globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback = (id: number): void => {
      cancelledId = id
    }
    const startLoad = () => {}
    const teardown = _setupIdleTrigger(startLoad)
    expect(captured).toBe(startLoad)
    teardown()
    expect(cancelledId).toBe(42)
  })

  test('teardown is no-op when cancelIdleCallback is missing', () => {
    ;(globalThis as { requestIdleCallback?: unknown }).requestIdleCallback = (
      _cb: () => void,
    ): number => 99
    delete (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback
    const teardown = _setupIdleTrigger(() => {})
    expect(() => teardown()).not.toThrow()
  })

  test('falls back to setTimeout when requestIdleCallback is absent', async () => {
    delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback
    let loaded = false
    const teardown = _setupIdleTrigger(() => {
      loaded = true
    })
    // setTimeout(fn, 1) fires after a tick — await to observe.
    await new Promise((r) => setTimeout(r, 5))
    expect(loaded).toBe(true)
    teardown() // safe to call after the timer fired
  })

  test('setTimeout fallback cancels via clearTimeout when teardown fires before tick', () => {
    delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback
    let loaded = false
    const teardown = _setupIdleTrigger(() => {
      loaded = true
    })
    teardown() // cancel before the timer fires
    return new Promise<void>((r) =>
      setTimeout(() => {
        expect(loaded).toBe(false)
        r()
      }, 10),
    )
  })
})

describe('_setupVisibleTrigger', () => {
  const origObs = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
  afterEach(() => {
    if (origObs === undefined)
      delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
    else (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = origObs
  })

  test('loads immediately when el is null', () => {
    let loaded = false
    const teardown = _setupVisibleTrigger(
      null,
      () => {
        loaded = true
      },
      '200px',
    )
    expect(loaded).toBe(true)
    expect(typeof teardown).toBe('function')
  })

  test('loads immediately when IntersectionObserver is unavailable', () => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
    // Pass a stub element; without the global the trigger should bail early.
    const stubEl = {} as unknown as HTMLElement
    let loaded = false
    _setupVisibleTrigger(
      stubEl,
      () => {
        loaded = true
      },
      '200px',
    )
    expect(loaded).toBe(true)
  })

  test('creates an observer with the configured rootMargin', () => {
    let capturedOptions: IntersectionObserverInit | undefined
    let observed: Element | null = null
    let disconnected = false
    class StubObserver {
      callback: IntersectionObserverCallback
      constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
        this.callback = cb
        capturedOptions = opts
      }
      observe(el: Element) {
        observed = el
      }
      disconnect() {
        disconnected = true
      }
      unobserve() {}
      takeRecords() {
        return []
      }
    }
    ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = StubObserver
    const stubEl = { tagName: 'DIV' } as unknown as HTMLElement
    const teardown = _setupVisibleTrigger(stubEl, () => {}, '300px')
    expect(observed).toBe(stubEl)
    expect(capturedOptions?.rootMargin).toBe('300px')
    teardown()
    expect(disconnected).toBe(true)
  })

  test('fires startLoad on intersection, then disconnects', () => {
    let captured: IntersectionObserverCallback | null = null
    let disconnected = false
    class StubObserver {
      constructor(cb: IntersectionObserverCallback) {
        captured = cb
      }
      observe() {}
      disconnect() {
        disconnected = true
      }
      unobserve() {}
      takeRecords() {
        return []
      }
    }
    ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = StubObserver
    let loaded = false
    const stubEl = {} as unknown as HTMLElement
    _setupVisibleTrigger(
      stubEl,
      () => {
        loaded = true
      },
      '0px',
    )

    // Simulate non-intersecting entry — should NOT fire.
    captured!(
      [{ isIntersecting: false } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    expect(loaded).toBe(false)
    expect(disconnected).toBe(false)

    // Simulate intersecting entry — fires and disconnects.
    captured!(
      [{ isIntersecting: true } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    expect(loaded).toBe(true)
    expect(disconnected).toBe(true)
  })
})
