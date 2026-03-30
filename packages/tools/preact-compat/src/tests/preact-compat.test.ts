import type { VNodeChild } from '@pyreon/core'
import { h as pyreonH } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import {
  memo,
  useCallback,
  useEffect,
  useErrorBoundary,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from '../hooks'
import {
  Component,
  cloneElement,
  createContext,
  createElement,
  createRef,
  Fragment,
  h,
  hydrate,
  isValidElement,
  options,
  render,
  toChildArray,
  useContext,
} from '../index'
import type { RenderContext } from '../jsx-runtime'
import { beginRender, endRender, jsx } from '../jsx-runtime'
import { batch, computed, signal, effect as signalEffect } from '../signals'

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

/** Helper: creates a RenderContext for testing hooks outside of full render cycle */
function withHookCtx<T>(fn: () => T): T {
  const ctx: RenderContext = {
    hooks: [],
    scheduleRerender: () => {},
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
  }
  beginRender(ctx)
  const result = fn()
  endRender()
  return result
}

/** Re-render helper: calls fn with the same ctx to simulate re-render */
function createHookRunner() {
  const ctx: RenderContext = {
    hooks: [],
    scheduleRerender: () => {},
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
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

describe('@pyreon/preact-compat', () => {
  // ─── Core API ────────────────────────────────────────────────────────────

  test('h() creates VNodes', () => {
    const vnode = h('div', { class: 'test' }, 'hello')
    expect(vnode.type).toBe('div')
    expect(vnode.props.class).toBe('test')
    expect(vnode.children).toContain('hello')
  })

  test('createElement is alias for h', () => {
    expect(createElement).toBe(h)
  })

  test('Fragment is a symbol', () => {
    expect(typeof Fragment).toBe('symbol')
  })

  test('render() mounts to DOM', () => {
    const el = container()
    render(h('span', null, 'mounted'), el)
    expect(el.innerHTML).toContain('mounted')
  })

  test('hydrate() calls hydrateRoot', () => {
    const el = container()
    el.innerHTML = '<span>hydrated</span>'
    hydrate(h('span', null, 'hydrated'), el)
    expect(el.innerHTML).toContain('hydrated')
  })

  test('isValidElement detects VNodes', () => {
    const vnode = h('div', null)
    expect(isValidElement(vnode)).toBe(true)
    expect(isValidElement(null)).toBe(false)
    expect(isValidElement('string')).toBe(false)
    expect(isValidElement(42)).toBe(false)
    expect(isValidElement({ type: 'div', props: {}, children: [] })).toBe(true)
  })

  test('isValidElement returns false for objects missing required keys', () => {
    expect(isValidElement({ type: 'div' })).toBe(false)
    expect(isValidElement({ type: 'div', props: {} })).toBe(false)
    expect(isValidElement({})).toBe(false)
    expect(isValidElement(undefined)).toBe(false)
  })

  test('toChildArray flattens children', () => {
    const result = toChildArray(['a', ['b', ['c']], null, undefined, false, 'd'] as VNodeChild[])
    expect(result).toEqual(['a', 'b', 'c', 'd'])
  })

  test('toChildArray handles single non-array child', () => {
    const result = toChildArray('hello')
    expect(result).toEqual(['hello'])
  })

  test('toChildArray handles null/undefined/boolean at top level', () => {
    expect(toChildArray(null as unknown as VNodeChild)).toEqual([])
    expect(toChildArray(undefined as unknown as VNodeChild)).toEqual([])
    expect(toChildArray(false as unknown as VNodeChild)).toEqual([])
    expect(toChildArray(true as unknown as VNodeChild)).toEqual([])
  })

  test('toChildArray handles number children', () => {
    const result = toChildArray([1, 2, 3] as VNodeChild[])
    expect(result).toEqual([1, 2, 3])
  })

  test('cloneElement merges props', () => {
    const original = h('div', { class: 'a', id: 'x' }, 'child')
    const cloned = cloneElement(original, { class: 'b' })
    expect(cloned.type).toBe('div')
    expect(cloned.props.class).toBe('b')
    expect(cloned.props.id).toBe('x')
    expect(cloned.children).toContain('child')
  })

  test('cloneElement replaces children when provided', () => {
    const original = h('div', null, 'old')
    const cloned = cloneElement(original, undefined, 'new')
    expect(cloned.children).toContain('new')
    expect(cloned.children).not.toContain('old')
  })

  test('cloneElement preserves key from original when not overridden', () => {
    const original = h('div', { key: 'original-key' }, 'child')
    const cloned = cloneElement(original, { class: 'b' })
    expect(cloned.key).toBe('original-key')
  })

  test('cloneElement overrides key when provided in props', () => {
    const original = h('div', { key: 'original-key' }, 'child')
    const cloned = cloneElement(original, { key: 'new-key' })
    expect(cloned.key).toBe('new-key')
  })

  test('cloneElement with no props passes empty override', () => {
    const original = h('div', { id: 'test' }, 'child')
    const cloned = cloneElement(original)
    expect(cloned.props.id).toBe('test')
    expect(cloned.children).toContain('child')
  })

  test('createRef returns { current: null }', () => {
    const ref = createRef()
    expect(ref.current).toBe(null)
  })

  test('createContext/useContext work', () => {
    const Ctx = createContext('default')
    expect(useContext(Ctx)).toBe('default')
  })

  test('options is an empty object', () => {
    expect(typeof options).toBe('object')
    expect(Object.keys(options).length).toBe(0)
  })

  test('Component class setState updates state with object', () => {
    class Counter extends Component<Record<string, never>, { count: number }> {
      constructor(props: Record<string, never>) {
        super(props)
        this.state = { count: 0 }
      }
      override render() {
        return h('span', null, String(this.state.count))
      }
    }
    const c = new Counter({})
    expect(c.state.count).toBe(0)
    c.setState({ count: 5 })
    expect(c.state.count).toBe(5)
  })

  test('Component class setState with updater function', () => {
    class Counter extends Component<Record<string, never>, { count: number }> {
      constructor(props: Record<string, never>) {
        super(props)
        this.state = { count: 0 }
      }
      override render() {
        return h('span', null, String(this.state.count))
      }
    }
    const c = new Counter({})
    c.setState({ count: 5 })
    c.setState((prev) => ({ count: prev.count + 1 }))
    expect(c.state.count).toBe(6)
  })

  test('Component class render() returns null by default', () => {
    const c = new Component({})
    expect(c.render()).toBe(null)
  })

  test('Component class forceUpdate triggers signal re-fire', () => {
    class MyComp extends Component<Record<string, never>, { value: number }> {
      constructor(props: Record<string, never>) {
        super(props)
        this.state = { value: 42 }
      }
    }
    const c = new MyComp({})
    c.forceUpdate()
    expect(c.state.value).toBe(42)
  })
})

// ─── useState ─────────────────────────────────────────────────────────────────

describe('useState', () => {
  test('returns [value, setter] — value is the initial value', () => {
    const [count] = withHookCtx(() => useState(0))
    expect(count).toBe(0)
  })

  test('setter updates value on re-render', () => {
    const runner = createHookRunner()
    const [, setCount] = runner.run(() => useState(0))
    setCount(5)
    const [count2] = runner.run(() => useState(0))
    expect(count2).toBe(5)
  })

  test('setter with function updater', () => {
    const runner = createHookRunner()
    const [, setCount] = runner.run(() => useState(10))
    setCount((prev) => prev + 1)
    const [count2] = runner.run(() => useState(10))
    expect(count2).toBe(11)
  })

  test('initializer function is called once', () => {
    let calls = 0
    const runner = createHookRunner()
    runner.run(() =>
      useState(() => {
        calls++
        return 42
      }),
    )
    expect(calls).toBe(1)
    runner.run(() =>
      useState(() => {
        calls++
        return 42
      }),
    )
    expect(calls).toBe(1)
  })

  test('setter does nothing when value is the same (Object.is)', () => {
    const runner = createHookRunner()
    let rerenders = 0
    runner.ctx.scheduleRerender = () => {
      rerenders++
    }
    const [, setCount] = runner.run(() => useState(0))
    setCount(0)
    expect(rerenders).toBe(0)
    setCount(1)
    expect(rerenders).toBe(1)
  })

  test('re-render in a component via compat JSX runtime', async () => {
    const el = container()
    let renderCount = 0
    let triggerSet: (v: number | ((p: number) => number)) => void = () => {}

    const Counter = () => {
      const [count, setCount] = useState(0)
      renderCount++
      triggerSet = setCount
      return pyreonH('span', null, String(count))
    }

    const vnode = jsx(Counter, {})
    mount(vnode, el)
    expect(el.textContent).toBe('0')
    const initialRenders = renderCount

    triggerSet(1)
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.textContent).toBe('1')
    expect(renderCount).toBe(initialRenders + 1)
  })
})

// ─── useReducer ───────────────────────────────────────────────────────────────

describe('useReducer', () => {
  test('dispatch applies reducer', () => {
    const runner = createHookRunner()
    type Action = { type: 'inc' } | { type: 'dec' }
    const reducer = (state: number, action: Action) =>
      action.type === 'inc' ? state + 1 : state - 1

    const [state0, dispatch] = runner.run(() => useReducer(reducer, 0))
    expect(state0).toBe(0)

    dispatch({ type: 'inc' })
    const [state1] = runner.run(() => useReducer(reducer, 0))
    expect(state1).toBe(1)

    dispatch({ type: 'dec' })
    const [state2] = runner.run(() => useReducer(reducer, 0))
    expect(state2).toBe(0)
  })

  test('initializer function is called once', () => {
    let calls = 0
    const runner = createHookRunner()
    const [state] = runner.run(() =>
      useReducer(
        (s: number) => s,
        () => {
          calls++
          return 99
        },
      ),
    )
    expect(state).toBe(99)
    expect(calls).toBe(1)
    runner.run(() =>
      useReducer(
        (s: number) => s,
        () => {
          calls++
          return 99
        },
      ),
    )
    expect(calls).toBe(1)
  })

  test('dispatch does nothing when reducer returns same state', () => {
    const runner = createHookRunner()
    let rerenders = 0
    runner.ctx.scheduleRerender = () => {
      rerenders++
    }
    const [, dispatch] = runner.run(() => useReducer((_s: number, _a: string) => 5, 5))
    dispatch('anything')
    expect(rerenders).toBe(0)
  })
})

// ─── useEffect ────────────────────────────────────────────────────────────────

describe('useEffect', () => {
  test('effect runs after render via compat JSX runtime', async () => {
    const el = container()
    let effectRuns = 0

    const Comp = () => {
      useEffect(() => {
        effectRuns++
      })
      return pyreonH('div', null, 'test')
    }

    mount(jsx(Comp, {}), el)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(effectRuns).toBeGreaterThanOrEqual(1)
  })

  test('effect with empty deps runs once', async () => {
    const el = container()
    let effectRuns = 0
    let triggerSet: (v: number) => void = () => {}

    const Comp = () => {
      const [count, setCount] = useState(0)
      triggerSet = setCount
      useEffect(() => {
        effectRuns++
      }, [])
      return pyreonH('div', null, String(count))
    }

    mount(jsx(Comp, {}), el)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(effectRuns).toBe(1)

    triggerSet(1)
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    expect(effectRuns).toBe(1)
  })

  test('effect with deps re-runs when deps change', async () => {
    const el = container()
    let effectRuns = 0
    let triggerSet: (v: number | ((p: number) => number)) => void = () => {}

    const Comp = () => {
      const [count, setCount] = useState(0)
      triggerSet = setCount
      useEffect(() => {
        effectRuns++
      }, [count])
      return pyreonH('div', null, String(count))
    }

    mount(jsx(Comp, {}), el)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(effectRuns).toBe(1)

    triggerSet((p) => p + 1)
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    expect(effectRuns).toBe(2)
  })

  test('effect cleanup runs before re-execution', async () => {
    const el = container()
    let cleanups = 0
    let triggerSet: (v: number | ((p: number) => number)) => void = () => {}

    const Comp = () => {
      const [count, setCount] = useState(0)
      triggerSet = setCount
      useEffect(() => {
        return () => {
          cleanups++
        }
      }, [count])
      return pyreonH('div', null, String(count))
    }

    mount(jsx(Comp, {}), el)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(cleanups).toBe(0)

    triggerSet((p) => p + 1)
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    expect(cleanups).toBe(1)
  })

  test('pendingEffects populated during render', () => {
    const runner = createHookRunner()
    runner.run(() => {
      useEffect(() => {})
    })
    expect(runner.ctx.pendingEffects).toHaveLength(1)
  })

  test('effect with same deps does not re-queue', () => {
    const runner = createHookRunner()
    runner.run(() => {
      useEffect(() => {}, [1, 2])
    })
    expect(runner.ctx.pendingEffects).toHaveLength(1)

    runner.run(() => {
      useEffect(() => {}, [1, 2])
    })
    expect(runner.ctx.pendingEffects).toHaveLength(0)
  })
})

// ─── useLayoutEffect ─────────────────────────────────────────────────────────

describe('useLayoutEffect', () => {
  test('layout effect runs synchronously during render in compat runtime', () => {
    const el = container()
    let effectRuns = 0

    const Comp = () => {
      useLayoutEffect(() => {
        effectRuns++
      })
      return pyreonH('div', null, 'layout')
    }

    mount(jsx(Comp, {}), el)
    expect(effectRuns).toBeGreaterThanOrEqual(1)
  })

  test('pendingLayoutEffects populated during render', () => {
    const runner = createHookRunner()
    runner.run(() => {
      useLayoutEffect(() => {})
    })
    expect(runner.ctx.pendingLayoutEffects).toHaveLength(1)
  })

  test('layout effect with same deps does not re-queue', () => {
    const runner = createHookRunner()
    runner.run(() => {
      useLayoutEffect(() => {}, [1])
    })
    expect(runner.ctx.pendingLayoutEffects).toHaveLength(1)

    runner.run(() => {
      useLayoutEffect(() => {}, [1])
    })
    expect(runner.ctx.pendingLayoutEffects).toHaveLength(0)
  })
})

// ─── useMemo ──────────────────────────────────────────────────────────────────

describe('useMemo', () => {
  test('returns computed value', () => {
    const value = withHookCtx(() => useMemo(() => 3 * 2, []))
    expect(value).toBe(6)
  })

  test('recomputes when deps change', () => {
    const runner = createHookRunner()
    const v1 = runner.run(() => useMemo(() => 10, [1]))
    expect(v1).toBe(10)

    const v2 = runner.run(() => useMemo(() => 20, [1]))
    expect(v2).toBe(10)

    const v3 = runner.run(() => useMemo(() => 30, [2]))
    expect(v3).toBe(30)
  })
})

// ─── useCallback ──────────────────────────────────────────────────────────────

describe('useCallback', () => {
  test('returns the same function when deps unchanged', () => {
    const runner = createHookRunner()
    const fn1 = () => 42
    const fn2 = () => 99
    const result1 = runner.run(() => useCallback(fn1, [1]))
    const result2 = runner.run(() => useCallback(fn2, [1]))
    expect(result1).toBe(result2)
    expect(result1()).toBe(42)
  })

  test('returns new function when deps change', () => {
    const runner = createHookRunner()
    const fn1 = () => 42
    const fn2 = () => 99
    const result1 = runner.run(() => useCallback(fn1, [1]))
    const result2 = runner.run(() => useCallback(fn2, [2]))
    expect(result2).toBe(fn2)
    expect(result2()).toBe(99)
    expect(result1).not.toBe(result2)
  })
})

// ─── useRef ───────────────────────────────────────────────────────────────────

describe('useRef', () => {
  test('returns { current } with null default', () => {
    const ref = withHookCtx(() => useRef<HTMLDivElement>())
    expect(ref.current).toBeNull()
  })

  test('returns { current } with initial value', () => {
    const ref = withHookCtx(() => useRef(42))
    expect(ref.current).toBe(42)
  })

  test('current is mutable', () => {
    const ref = withHookCtx(() => useRef(0))
    ref.current = 10
    expect(ref.current).toBe(10)
  })

  test('same ref object persists across re-renders', () => {
    const runner = createHookRunner()
    const ref1 = runner.run(() => useRef(0))
    ref1.current = 99
    const ref2 = runner.run(() => useRef(0))
    expect(ref1).toBe(ref2)
    expect(ref2.current).toBe(99)
  })
})

// ─── memo ─────────────────────────────────────────────────────────────────────

describe('memo', () => {
  test('skips re-render when props are shallowly equal', () => {
    let renderCount = 0
    const MyComp = (props: { name: string }) => {
      renderCount++
      return pyreonH('span', null, props.name)
    }
    const Memoized = memo(MyComp)
    Memoized({ name: 'a' })
    expect(renderCount).toBe(1)
    Memoized({ name: 'a' })
    expect(renderCount).toBe(1)
    Memoized({ name: 'b' })
    expect(renderCount).toBe(2)
  })

  test('custom areEqual function', () => {
    let renderCount = 0
    const MyComp = (props: { x: number; y: number }) => {
      renderCount++
      return pyreonH('span', null, String(props.x))
    }
    const Memoized = memo(MyComp, (prev, next) => prev.x === next.x)
    Memoized({ x: 1, y: 1 })
    expect(renderCount).toBe(1)
    Memoized({ x: 1, y: 999 })
    expect(renderCount).toBe(1)
    Memoized({ x: 2, y: 999 })
    expect(renderCount).toBe(2)
  })

  test('different number of keys triggers re-render', () => {
    let renderCount = 0
    const MyComp = (_props: Record<string, unknown>) => {
      renderCount++
      return pyreonH('span', null, 'x')
    }
    const Memoized = memo(MyComp)
    Memoized({ a: 1 })
    expect(renderCount).toBe(1)
    Memoized({ a: 1, b: 2 })
    expect(renderCount).toBe(2)
  })
})

// ─── useId ────────────────────────────────────────────────────────────────────

describe('useId', () => {
  test('returns a unique string within a component', () => {
    const el = container()
    const ids: string[] = []

    const Comp = () => {
      ids.push(useId())
      ids.push(useId())
      return pyreonH('div', null, 'id-test')
    }

    mount(jsx(Comp, {}), el)
    expect(ids.length).toBeGreaterThanOrEqual(2)
    expect(ids[0]).not.toBe(ids[1])
    expect(typeof ids[0]).toBe('string')
    expect(ids[0]?.startsWith(':r')).toBe(true)
  })

  test('IDs are stable across re-renders', async () => {
    const el = container()
    const idHistory: string[] = []
    let triggerSet: (v: number) => void = () => {}

    const Comp = () => {
      const [count, setCount] = useState(0)
      triggerSet = setCount
      const id = useId()
      idHistory.push(id)
      return pyreonH('div', null, `${id}-${count}`)
    }

    mount(jsx(Comp, {}), el)
    const initialCount = idHistory.length
    const firstId = idHistory[0]

    triggerSet(1)
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    expect(idHistory.length).toBeGreaterThan(initialCount)
    for (const id of idHistory) {
      expect(id).toBe(firstId)
    }
  })
})

// ─── useErrorBoundary ────────────────────────────────────────────────────────

describe('useErrorBoundary', () => {
  test('is exported as a function', () => {
    expect(typeof useErrorBoundary).toBe('function')
  })
})

// ─── Signals ─────────────────────────────────────────────────────────────────

describe('signals', () => {
  test('signal() has .value accessor', () => {
    const count = signal(0)
    expect(count.value).toBe(0)
    count.value = 5
    expect(count.value).toBe(5)
  })

  test('computed() has .value accessor', () => {
    const count = signal(3)
    const doubled = computed(() => count.value * 2)
    expect(doubled.value).toBe(6)
    count.value = 10
    expect(doubled.value).toBe(20)
  })

  test('computed() peek returns value', () => {
    const count = signal(3)
    const doubled = computed(() => count.value * 2)
    expect(doubled.peek()).toBe(6)
    count.value = 10
    expect(doubled.peek()).toBe(20)
  })

  test('effect() tracks signal reads', () => {
    const count = signal(0)
    let observed = -1
    const dispose = signalEffect(() => {
      observed = count.value
    })
    expect(observed).toBe(0)
    count.value = 7
    expect(observed).toBe(7)
    dispose()
    count.value = 99
    expect(observed).toBe(7)
  })

  test('effect() with cleanup function', () => {
    const count = signal(0)
    let cleanups = 0
    const dispose = signalEffect(() => {
      void count.value
      return () => {
        cleanups++
      }
    })
    expect(cleanups).toBe(0)
    count.value = 1
    expect(cleanups).toBe(1)
    dispose()
    expect(cleanups).toBe(2)
  })

  test('effect() with non-function return (no cleanup)', () => {
    const count = signal(0)
    let runs = 0
    const dispose = signalEffect(() => {
      void count.value
      runs++
    })
    expect(runs).toBe(1)
    count.value = 1
    expect(runs).toBe(2)
    dispose()
  })

  test('batch() coalesces updates', () => {
    const a = signal(1)
    const b = signal(2)
    let runs = 0
    signalEffect(() => {
      void a.value
      void b.value
      runs++
    })
    expect(runs).toBe(1)
    batch(() => {
      a.value = 10
      b.value = 20
    })
    expect(runs).toBe(2)
  })

  test('signal peek() reads without tracking', () => {
    const count = signal(0)
    let observed = -1
    const dispose = signalEffect(() => {
      observed = count.peek()
    })
    expect(observed).toBe(0)
    count.value = 5
    expect(observed).toBe(0)
    dispose()
  })
})

// ─── jsx-runtime ──────────────────────────────────────────────────────────────

describe('jsx-runtime', () => {
  test('jsx with string type creates element VNode', () => {
    const vnode = jsx('div', { children: 'hello' })
    expect(vnode.type).toBe('div')
    expect(vnode.children).toContain('hello')
  })

  test('jsx with key prop', () => {
    const vnode = jsx('div', { children: 'x' }, 'my-key')
    expect(vnode.props.key).toBe('my-key')
  })

  test('jsx with component wraps for re-render', () => {
    const MyComp = () => pyreonH('span', null, 'hi')
    const vnode = jsx(MyComp, {})
    expect(vnode.type).not.toBe(MyComp)
    expect(typeof vnode.type).toBe('function')
  })

  test('jsx with Fragment', () => {
    const vnode = jsx(Fragment, {
      children: [pyreonH('span', null, 'a'), pyreonH('span', null, 'b')],
    })
    expect(vnode.type).toBe(Fragment)
  })

  test('jsx with single child (not array)', () => {
    const vnode = jsx('div', { children: 'text' })
    expect(vnode.children).toHaveLength(1)
  })

  test('jsx with no children', () => {
    const vnode = jsx('div', {})
    expect(vnode.children).toHaveLength(0)
  })

  test('jsx component with children in props', () => {
    const MyComp = (props: { children?: string }) => pyreonH('div', null, props.children ?? '')
    const vnode = jsx(MyComp, { children: 'child-text' })
    expect(typeof vnode.type).toBe('function')
  })
})

// ─── Hooks outside component ─────────────────────────────────────────────────

describe('hooks outside component', () => {
  test('useState throws when called outside render', () => {
    expect(() => useState(0)).toThrow('Hook called outside')
  })

  test('useEffect throws when called outside render', () => {
    expect(() => useEffect(() => {})).toThrow('Hook called outside')
  })

  test('useRef throws when called outside render', () => {
    expect(() => useRef(0)).toThrow('Hook called outside')
  })

  test('useMemo throws when called outside render', () => {
    expect(() => useMemo(() => 0, [])).toThrow('Hook called outside')
  })

  test('useId throws when called outside render', () => {
    expect(() => useId()).toThrow('Hook called outside')
  })

  test('useReducer throws when called outside render', () => {
    expect(() => useReducer((s: number) => s, 0)).toThrow('Hook called outside')
  })
})

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  test('useState with string initial', () => {
    const [val] = withHookCtx(() => useState('hello'))
    expect(val).toBe('hello')
  })

  test('useReducer with non-function initial', () => {
    const [state] = withHookCtx(() => useReducer((s: string, a: string) => s + a, 'start'))
    expect(state).toBe('start')
  })

  test('depsChanged handles different length arrays', () => {
    const runner = createHookRunner()
    runner.run(() => {
      useEffect(() => {}, [1, 2])
    })
    expect(runner.ctx.pendingEffects).toHaveLength(1)

    runner.run(() => {
      useEffect(() => {}, [1, 2, 3])
    })
    expect(runner.ctx.pendingEffects).toHaveLength(1)
  })

  test('depsChanged with undefined deps always re-runs', () => {
    const runner = createHookRunner()
    runner.run(() => {
      useEffect(() => {})
    })
    expect(runner.ctx.pendingEffects).toHaveLength(1)

    runner.run(() => {
      useEffect(() => {})
    })
    expect(runner.ctx.pendingEffects).toHaveLength(1)
  })
})
