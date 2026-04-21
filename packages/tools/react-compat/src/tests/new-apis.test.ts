import { createContext as pyreonCreateContext, h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import type { RenderContext } from '../jsx-runtime'
import { beginRender, endRender, jsx } from '../jsx-runtime'
import {
  act,
  Children,
  cloneElement,
  Component,
  createContext as createCompatContext,
  createRef,
  flushSync,
  forwardRef,
  isValidElement,
  memo,
  Profiler,
  PureComponent,
  startTransition,
  StrictMode,
  use,
  useActionState,
  useContext,
  useDebugValue,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useReducer,
  useState,
  useSyncExternalStore,
  version,
} from '../index'
import type {
  ChangeEvent,
  Dispatch,
  FC,
  FocusEvent,
  FormEvent,
  ForwardedRef,
  FunctionComponent,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  MutableRefObject,
  PropsWithChildren,
  PropsWithRef,
  ReactElement,
  ReactNode,
  RefCallback,
  RefObject,
  SetStateAction,
  SyntheticEvent,
} from '../index'

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

function createHookRunner() {
  const ctx: RenderContext = {
    hooks: [],
    scheduleRerender: () => {},
    pendingInsertionEffects: [],
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

function withHookCtx<T>(fn: () => T): T {
  const ctx: RenderContext = {
    hooks: [],
    scheduleRerender: () => {},
    pendingInsertionEffects: [],
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
  }
  beginRender(ctx)
  const result = fn()
  endRender()
  return result
}

// ─── useSyncExternalStore ──────────────────────────────────────────────────

describe('useSyncExternalStore', () => {
  function createStore(initial: number) {
    let value = initial
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => value,
      subscribe: (cb: () => void) => {
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
      set(next: number) {
        value = next
        for (const l of listeners) l()
      },
    }
  }

  test('returns initial snapshot', () => {
    const store = createStore(42)
    const result = withHookCtx(() =>
      useSyncExternalStore(store.subscribe, store.getSnapshot),
    )
    expect(result).toBe(42)
  })

  test('re-renders when store changes', async () => {
    const el = container()
    const store = createStore(0)
    const renders: number[] = []

    const Comp = () => {
      const value = useSyncExternalStore(store.subscribe, store.getSnapshot)
      renders.push(value)
      return h('span', null, String(value))
    }

    mount(jsx(Comp, {}), el)
    await new Promise<void>((r) => queueMicrotask(r))

    store.set(10)
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))

    expect(el.textContent).toBe('10')
  })

  test('unsubscribes on unmount', () => {
    const el = container()
    let unsubCalled = false
    const store = {
      getSnapshot: () => 1,
      subscribe: (_cb: () => void) => {
        return () => {
          unsubCalled = true
        }
      },
    }

    const Comp = () => {
      useSyncExternalStore(store.subscribe, store.getSnapshot)
      return h('div', null, 'x')
    }

    const cleanup = mount(jsx(Comp, {}), el)
    expect(unsubCalled).toBe(false)
    cleanup()
    expect(unsubCalled).toBe(true)
  })

  test('no spurious re-render when snapshot is Object.is equal', () => {
    const runner = createHookRunner()
    let rerenders = 0
    runner.ctx.scheduleRerender = () => {
      rerenders++
    }

    let currentVal = 5
    let listener: (() => void) | null = null
    const subscribe = (cb: () => void) => {
      listener = cb
      return () => {
        listener = null
      }
    }
    const getSnapshot = () => currentVal
    const notify = () => { if (listener) listener() }

    runner.run(() => useSyncExternalStore(subscribe, getSnapshot))
    // Notify without changing value
    notify()
    expect(rerenders).toBe(0)

    // Now change value and notify
    currentVal = 10
    notify()
    expect(rerenders).toBe(1)
  })

  test('works with Redux-like store pattern', () => {
    type State = { count: number; name: string }
    type Action = { type: 'increment' } | { type: 'setName'; name: string }

    function createReduxLikeStore(initial: State) {
      let state = initial
      const listeners = new Set<() => void>()
      return {
        getState: () => state,
        subscribe: (cb: () => void) => {
          listeners.add(cb)
          return () => listeners.delete(cb)
        },
        dispatch(action: Action) {
          if (action.type === 'increment') {
            state = { ...state, count: state.count + 1 }
          } else if (action.type === 'setName') {
            state = { ...state, name: action.name }
          }
          for (const l of listeners) l()
        },
      }
    }

    const store = createReduxLikeStore({ count: 0, name: 'test' })
    const result = withHookCtx(() =>
      useSyncExternalStore(store.subscribe, store.getState),
    )
    expect(result).toEqual({ count: 0, name: 'test' })

    store.dispatch({ type: 'increment' })
    const result2 = withHookCtx(() =>
      useSyncExternalStore(store.subscribe, store.getState),
    )
    expect(result2).toEqual({ count: 1, name: 'test' })
  })

  test('multiple components sharing one store', async () => {
    const el = container()
    const store = createStore(0)

    const CompA = () => {
      const v = useSyncExternalStore(store.subscribe, store.getSnapshot)
      return h('span', { class: 'a' }, String(v))
    }
    const CompB = () => {
      const v = useSyncExternalStore(store.subscribe, store.getSnapshot)
      return h('span', { class: 'b' }, String(v))
    }

    mount(h('div', null, jsx(CompA, {}), jsx(CompB, {})), el)
    await new Promise<void>((r) => queueMicrotask(r))

    expect(el.querySelector('.a')?.textContent).toBe('0')
    expect(el.querySelector('.b')?.textContent).toBe('0')

    store.set(99)
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))

    expect(el.querySelector('.a')?.textContent).toBe('99')
    expect(el.querySelector('.b')?.textContent).toBe('99')
  })

  test('reads fresh snapshot on each render', () => {
    const runner = createHookRunner()
    let val = 1
    const subscribe = (cb: () => void) => {
      return () => {}
    }

    const v1 = runner.run(() => useSyncExternalStore(subscribe, () => val))
    expect(v1).toBe(1)

    val = 2
    const v2 = runner.run(() => useSyncExternalStore(subscribe, () => val))
    expect(v2).toBe(2)
  })

  test('accepts optional getServerSnapshot', () => {
    const result = withHookCtx(() =>
      useSyncExternalStore(
        () => () => {},
        () => 'client',
        () => 'server',
      ),
    )
    expect(result).toBe('client')
  })

  test('handles subscribe returning different unsubscribe per call', () => {
    const runner = createHookRunner()
    const unsubs: Array<() => void> = []
    const subscribe = (cb: () => void) => {
      const unsub = () => {}
      unsubs.push(unsub)
      return unsub
    }

    runner.run(() => useSyncExternalStore(subscribe, () => 0))
    expect(unsubs).toHaveLength(1)
  })

  test('getSnapshot returning same object reference does not schedule rerender', () => {
    const runner = createHookRunner()
    let rerenders = 0
    runner.ctx.scheduleRerender = () => {
      rerenders++
    }

    const obj = { x: 1 }
    let listener: (() => void) | null = null
    const subscribe = (cb: () => void) => {
      listener = cb
      return () => {}
    }

    runner.run(() => useSyncExternalStore(subscribe, () => obj))
    ;(listener as (() => void) | null)?.() // same obj reference
    expect(rerenders).toBe(0)
  })
})

// ─── use() ─────────────────────────────────────────────────────────────────

describe('use', () => {
  test('reads context value', () => {
    const Ctx = pyreonCreateContext('hello')
    const result = use(Ctx)
    expect(result).toBe('hello')
  })

  test('returns value from resolved promise synchronously', async () => {
    const p = Promise.resolve(42)
    // First call triggers the .then() registration in the cache
    try {
      use(p)
    } catch {
      // Expected: first call throws the promise (pending state)
    }
    // Let the promise .then() callback run to update the cache
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))

    const result = use(p)
    expect(result).toBe(42)
  })

  test('throws promise for Suspense when pending', () => {
    let resolveFn: (v: string) => void = () => {}
    const p = new Promise<string>((r) => {
      resolveFn = r
    })
    expect(() => use(p)).toThrow(p)
    // Clean up
    resolveFn('done')
  })

  test('throws error from rejected promise', async () => {
    const err = new Error('fail')
    const p = Promise.reject(err)
    // Suppress unhandled rejection
    p.catch(() => {})
    // First call registers the .then/.catch in the cache
    try {
      use(p)
    } catch {
      // Expected: first call throws the promise (pending)
    }
    // Let the rejection callback run
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))

    expect(() => use(p)).toThrow(err)
  })

  test('caches promise result across calls', async () => {
    const p = Promise.resolve('cached')
    // First call registers in cache
    try {
      use(p)
    } catch {
      // Expected: pending
    }
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))

    const r1 = use(p)
    const r2 = use(p)
    expect(r1).toBe(r2)
    expect(r1).toBe('cached')
  })
})

// ─── startTransition ───────────────────────────────────────────────────────

describe('startTransition', () => {
  test('runs callback synchronously', () => {
    let ran = false
    startTransition(() => {
      ran = true
    })
    expect(ran).toBe(true)
  })

  test('returns void', () => {
    const result = startTransition(() => {})
    expect(result).toBeUndefined()
  })
})

// ─── isValidElement ────────────────────────────────────────────────────────

describe('isValidElement', () => {
  test('returns true for VNode from h()', () => {
    const vnode = h('div', {})
    expect(isValidElement(vnode)).toBe(true)
  })

  test('returns false for null', () => {
    expect(isValidElement(null)).toBe(false)
  })

  test('returns false for undefined', () => {
    expect(isValidElement(undefined)).toBe(false)
  })

  test('returns false for string', () => {
    expect(isValidElement('hello')).toBe(false)
  })

  test('returns false for number', () => {
    expect(isValidElement(42)).toBe(false)
  })

  test('returns false for plain object without type', () => {
    expect(isValidElement({ props: {} })).toBe(false)
  })

  test('returns true for object with type and props', () => {
    expect(isValidElement({ type: 'div', props: {} })).toBe(true)
  })
})

// ─── useDebugValue ─────────────────────────────────────────────────────────

describe('useDebugValue', () => {
  test('is a no-op that does not throw', () => {
    expect(() => useDebugValue('test')).not.toThrow()
    expect(() => useDebugValue(42, (v) => `value: ${v}`)).not.toThrow()
  })
})

// ─── useInsertionEffect ────────────────────────────────────────────────────

describe('useInsertionEffect', () => {
  test('fires callback in compat JSX runtime', async () => {
    const el = container()
    let effectRuns = 0

    const Comp = () => {
      useInsertionEffect(() => {
        effectRuns++
      })
      return h('div', null, 'insertion')
    }

    mount(jsx(Comp, {}), el)
    // Insertion effects run synchronously (before layout effects)
    expect(effectRuns).toBeGreaterThanOrEqual(1)
  })

  test('respects deps - does not re-fire when deps unchanged', () => {
    const runner = createHookRunner()
    runner.run(() => {
      useInsertionEffect(() => {}, [1, 2])
    })
    expect(runner.ctx.pendingInsertionEffects).toHaveLength(1)

    runner.run(() => {
      useInsertionEffect(() => {}, [1, 2])
    })
    expect(runner.ctx.pendingInsertionEffects).toHaveLength(0)
  })

  test('re-fires when deps change', () => {
    const runner = createHookRunner()
    runner.run(() => {
      useInsertionEffect(() => {}, [1])
    })
    expect(runner.ctx.pendingInsertionEffects).toHaveLength(1)

    runner.run(() => {
      useInsertionEffect(() => {}, [2])
    })
    expect(runner.ctx.pendingInsertionEffects).toHaveLength(1)
  })

  test('cleanup runs before re-fire', async () => {
    const el = container()
    let cleanups = 0
    let triggerSet: (v: number) => void = () => {}

    const Comp = () => {
      const [count, setCount] = useState(0)
      triggerSet = setCount
      useInsertionEffect(() => {
        return () => {
          cleanups++
        }
      }, [count])
      return h('div', null, String(count))
    }

    mount(jsx(Comp, {}), el)
    expect(cleanups).toBe(0)

    triggerSet(1)
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    expect(cleanups).toBe(1)
  })
})

// ─── useActionState ────────────────────────────────────────────────────────

describe('useActionState', () => {
  test('returns [initialState, dispatch, false] initially', () => {
    const [state, dispatch, isPending] = withHookCtx(() =>
      useActionState((_s: number, _p: number) => _s + _p, 0),
    )
    expect(state).toBe(0)
    expect(typeof dispatch).toBe('function')
    expect(isPending).toBe(false)
  })

  test('updates state when sync action completes', () => {
    const runner = createHookRunner()
    const [, dispatch] = runner.run(() =>
      useActionState((s: number, p: number) => s + p, 0),
    )

    dispatch(5)
    const [state2, , isPending2] = runner.run(() =>
      useActionState((s: number, p: number) => s + p, 0),
    )
    expect(state2).toBe(5)
    expect(isPending2).toBe(false)
  })

  test('sets isPending during async action', async () => {
    const runner = createHookRunner()
    let resolveFn: (v: number) => void = () => {}
    runner.ctx.scheduleRerender = () => {}

    const [, dispatch] = runner.run(() =>
      useActionState(
        (_s: number, _p: number) => new Promise<number>((r) => {
          resolveFn = r
        }),
        0,
      ),
    )

    dispatch(1)
    const [, , isPending] = runner.run(() =>
      useActionState(
        (_s: number, _p: number) => Promise.resolve(0),
        0,
      ),
    )
    expect(isPending).toBe(true)

    resolveFn(42)
    await new Promise<void>((r) => queueMicrotask(r))
    const [state3, , isPending3] = runner.run(() =>
      useActionState(
        (_s: number, _p: number) => Promise.resolve(0),
        0,
      ),
    )
    expect(state3).toBe(42)
    expect(isPending3).toBe(false)
  })
})

// ─── flushSync ─────────────────────────────────────────────────────────────

describe('flushSync', () => {
  test('runs callback and returns result', () => {
    const result = flushSync(() => 42)
    expect(result).toBe(42)
  })

  test('state updates inside are scheduled', () => {
    const runner = createHookRunner()
    let rerenders = 0
    runner.ctx.scheduleRerender = () => {
      rerenders++
    }

    const [, setCount] = runner.run(() => useState(0))
    flushSync(() => {
      setCount(1)
    })
    expect(rerenders).toBe(1)
  })
})

// ─── StrictMode / Profiler ─────────────────────────────────────────────────

describe('StrictMode', () => {
  test('renders children', () => {
    const el = container()
    mount(h(StrictMode, {}, h('span', null, 'strict-child')), el)
    expect(el.textContent).toBe('strict-child')
  })
})

describe('Profiler', () => {
  test('renders children', () => {
    const el = container()
    mount(h(Profiler as any, { id: 'test' }, h('span', null, 'profiler-child')), el)
    expect(el.textContent).toBe('profiler-child')
  })
})

// ─── version ───────────────────────────────────────────────────────────────

describe('version', () => {
  test('exports a string starting with "19"', () => {
    expect(typeof version).toBe('string')
    expect(version.startsWith('19')).toBe(true)
  })
})

// ─── useReducer 3rd arg ───────────────────────────────────────────────────

describe('useReducer 3rd arg (init function)', () => {
  test('init function is called with initialArg', () => {
    const runner = createHookRunner()
    let initArg: number | null = null
    const [state] = runner.run(() =>
      useReducer(
        (s: number, a: number) => s + a,
        10,
        (arg) => {
          initArg = arg
          return arg * 2
        },
      ),
    )
    expect(initArg).toBe(10)
    expect(state).toBe(20)
  })

  test('standard 2-arg still works', () => {
    const runner = createHookRunner()
    const [state] = runner.run(() =>
      useReducer((s: number, a: number) => s + a, 5),
    )
    expect(state).toBe(5)
  })
})

// ─── forwardRef displayName ────────────────────────────────────────────────

describe('forwardRef displayName', () => {
  test('sets displayName from render function name', () => {
    function MyInput(_props: Record<string, unknown>, _ref: { current: unknown } | null) {
      return h('input', {})
    }
    const Forwarded = forwardRef(MyInput)
    expect((Forwarded as any).displayName).toBe('MyInput')
  })

  test('writable displayName property', () => {
    const Forwarded = forwardRef((_props: Record<string, unknown>, _ref) => h('div', null))
    ;(Forwarded as any).displayName = 'Custom'
    expect((Forwarded as any).displayName).toBe('Custom')
  })
})

// ─── memo displayName ──────────────────────────────────────────────────────

describe('memo displayName', () => {
  test('sets displayName from component name', () => {
    function NamedComponent(_props: Record<string, unknown>) {
      return h('div', null)
    }
    const Memoized = memo(NamedComponent)
    expect((Memoized as any).displayName).toBe('NamedComponent')
  })
})

// ─── onChange -> onInput mapping ───────────────────────────────────────────

describe('onChange -> onInput mapping', () => {
  test('input element onChange maps to onInput', () => {
    const handler = () => {}
    const vnode = jsx('input', { onChange: handler })
    expect(vnode.props.onInput).toBe(handler)
    expect(vnode.props.onChange).toBeUndefined()
  })

  test('textarea element onChange maps to onInput', () => {
    const handler = () => {}
    const vnode = jsx('textarea', { onChange: handler })
    expect(vnode.props.onInput).toBe(handler)
    expect(vnode.props.onChange).toBeUndefined()
  })

  test('non-form element onChange stays as onChange', () => {
    const handler = () => {}
    const vnode = jsx('div', { onChange: handler })
    expect(vnode.props.onChange).toBe(handler)
  })
})

// ─── autoFocus mapping ─────────────────────────────────────────────────────

describe('autoFocus mapping', () => {
  test('autoFocus maps to autofocus', () => {
    const vnode = jsx('input', { autoFocus: true })
    expect(vnode.props.autofocus).toBe(true)
    expect(vnode.props.autoFocus).toBeUndefined()
  })
})

// ─── defaultValue / defaultChecked ─────────────────────────────────────────

describe('defaultValue / defaultChecked', () => {
  test('defaultValue maps to value when no value prop', () => {
    const vnode = jsx('input', { defaultValue: 'hello' })
    expect(vnode.props.value).toBe('hello')
    expect(vnode.props.defaultValue).toBeUndefined()
  })

  test('defaultChecked maps to checked when no checked prop', () => {
    const vnode = jsx('input', { defaultChecked: true })
    expect(vnode.props.checked).toBe(true)
    expect(vnode.props.defaultChecked).toBeUndefined()
  })

  test('defaultValue does NOT override explicit value prop', () => {
    const vnode = jsx('input', { value: 'explicit', defaultValue: 'fallback' })
    expect(vnode.props.value).toBe('explicit')
  })
})

// ─── suppressHydrationWarning / suppressContentEditableWarning ─────────────

describe('suppressHydrationWarning / suppressContentEditableWarning', () => {
  test('props are stripped', () => {
    const vnode = jsx('div', {
      suppressHydrationWarning: true,
      suppressContentEditableWarning: true,
    })
    expect(vnode.props.suppressHydrationWarning).toBeUndefined()
    expect(vnode.props.suppressContentEditableWarning).toBeUndefined()
  })
})

// ─── createRef ─────────────────────────────────────────────────────────────

describe('createRef', () => {
  test('returns { current: null }', () => {
    const ref = createRef()
    expect(ref).toEqual({ current: null })
    expect(ref.current).toBeNull()
  })
})

// ─── act ───────────────────────────────────────────────────────────────────

describe('act', () => {
  test('flushes sync callback', async () => {
    let ran = false
    await act(() => {
      ran = true
    })
    expect(ran).toBe(true)
  })

  test('flushes async callback', async () => {
    let ran = false
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 5))
      ran = true
    })
    expect(ran).toBe(true)
  })
})

// ─── Component / PureComponent ─────────────────────────────────────────────

describe('Component', () => {
  test('constructor sets props', () => {
    const comp = new Component({ name: 'test' })
    expect(comp.props).toEqual({ name: 'test' })
  })

  test('state is initialized to empty object', () => {
    const comp = new Component({})
    expect(comp.state).toEqual({})
  })

  test('setState warns', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const comp = new Component({})
    comp.setState({ x: 1 })
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Class component setState is not supported'),
    )
    spy.mockRestore()
  })

  test('forceUpdate warns', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const comp = new Component({})
    comp.forceUpdate()
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Class component forceUpdate is not supported'),
    )
    spy.mockRestore()
  })
})

describe('PureComponent', () => {
  test('extends Component', () => {
    const comp = new PureComponent({ name: 'pure' })
    expect(comp instanceof Component).toBe(true)
    expect(comp.props).toEqual({ name: 'pure' })
  })

  test('instanceof checks work', () => {
    const comp = new PureComponent({})
    expect(comp instanceof PureComponent).toBe(true)
    expect(comp instanceof Component).toBe(true)
  })
})

// ─── Type exports ──────────────────────────────────────────────────────────

describe('type exports', () => {
  test('FC, ReactNode, etc. are importable types', () => {
    // This test verifies at compile time that these types exist and are usable.
    // At runtime we just verify the test file compiled successfully.
    const _fc: FC<{ name: string }> = (_props) => null
    const _fcComponent: FunctionComponent = () => null
    const _node: ReactNode = null
    const _element: ReactElement = h('div', {})
    const _dispatch: Dispatch<string> = (_a) => {}
    const _action: SetStateAction<number> = 5
    const _ref: RefObject<HTMLDivElement> = { current: null }
    const _mutableRef: MutableRefObject<number> = { current: 0 }
    const _refCb: RefCallback<HTMLDivElement> = (_el) => {}
    const _fwdRef: ForwardedRef<HTMLDivElement> = null
    const _children: PropsWithChildren = {}
    const _withRef: PropsWithRef<{ x: number }> = { x: 1 }
    const _htmlAttrs: HTMLAttributes = {}
    const _syntheticEvent: SyntheticEvent | null = null
    const _changeEvent: ChangeEvent | null = null
    const _formEvent: FormEvent | null = null
    const _mouseEvent: MouseEvent | null = null
    const _keyboardEvent: KeyboardEvent | null = null
    const _focusEvent: FocusEvent | null = null

    // If this compiles, the types are exported correctly
    expect(true).toBe(true)
  })
})

// ─── Real-world integration patterns ───────────────────────────────────────

describe('real-world integration patterns', () => {
  test('Redux-like store with useSyncExternalStore + dispatch', async () => {
    const el = container()

    type State = { count: number }
    type Action = { type: 'inc' } | { type: 'dec' }

    let state: State = { count: 0 }
    const listeners = new Set<() => void>()
    const store = {
      getState: () => state,
      subscribe: (cb: () => void) => {
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
      dispatch(action: Action) {
        if (action.type === 'inc') state = { count: state.count + 1 }
        else state = { count: state.count - 1 }
        for (const l of listeners) l()
      },
    }

    const Counter = () => {
      const s = useSyncExternalStore(store.subscribe, store.getState)
      return h('span', null, String(s.count))
    }

    mount(jsx(Counter, {}), el)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.textContent).toBe('0')

    store.dispatch({ type: 'inc' })
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.textContent).toBe('1')
  })

  test('controlled input form with onChange', () => {
    const vnode = jsx('input', {
      type: 'text',
      value: 'hello',
      onChange: () => {},
    })
    // onChange should be mapped to onInput for input elements
    expect(vnode.props.onInput).toBeDefined()
    expect(vnode.props.onChange).toBeUndefined()
    expect(vnode.props.value).toBe('hello')
  })

  test('context provider chain', () => {
    const ThemeCtx = pyreonCreateContext('light')
    const result = use(ThemeCtx)
    expect(result).toBe('light')
  })

  test('memo component tree does not re-render on same props', () => {
    let parentRenders = 0
    let childRenders = 0

    const Child = memo((_props: { label: string }) => {
      childRenders++
      return h('span', null, _props.label)
    })

    const Parent = () => {
      parentRenders++
      return Child({ label: 'fixed' })
    }

    Parent()
    expect(parentRenders).toBe(1)
    expect(childRenders).toBe(1)

    // Second call with same props
    Parent()
    expect(parentRenders).toBe(2)
    expect(childRenders).toBe(1) // memo skips re-render
  })

  test('useState + useEffect pattern', async () => {
    const el = container()
    const effectLog: string[] = []

    const Comp = () => {
      const [count, setCount] = useState(0)
      useEffect(() => {
        effectLog.push(`effect:${count}`)
        return () => {
          effectLog.push(`cleanup:${count}`)
        }
      }, [count])
      return h('div', null, String(count))
    }

    mount(jsx(Comp, {}), el)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(effectLog).toContain('effect:0')
  })

  test('select element onChange maps to onInput', () => {
    const handler = () => {}
    const vnode = jsx('select', { onChange: handler })
    expect(vnode.props.onInput).toBe(handler)
    expect(vnode.props.onChange).toBeUndefined()
  })
})

// ─── Children.forEach index fix ───────────────────────────────────────────

describe('Children.forEach index', () => {
  test('passes correct sequential index skipping nulls', () => {
    const indices: number[] = []
    const values: unknown[] = []
    Children.forEach([null, 'a', null, 'b', undefined, 'c'], (child, idx) => {
      indices.push(idx)
      values.push(child)
    })
    expect(indices).toEqual([0, 1, 2])
    expect(values).toEqual(['a', 'b', 'c'])
  })

  test('passes correct index skipping booleans', () => {
    const indices: number[] = []
    Children.forEach([true, 'x', false, 'y'], (_, idx) => indices.push(idx))
    expect(indices).toEqual([0, 1])
  })
})

// ─── useSyncExternalStore re-subscribe on identity change ─────────────────

describe('useSyncExternalStore re-subscribe', () => {
  test('re-subscribes when subscribe identity changes', () => {
    const runner = createHookRunner()
    let listener: (() => void) | null = null
    let unsubCount = 0
    const sub1 = (cb: () => void) => { listener = cb; return () => { unsubCount++; listener = null } }
    const sub2 = (cb: () => void) => { listener = cb; return () => { unsubCount++; listener = null } }
    let val = 1

    runner.run(() => useSyncExternalStore(sub1, () => val))
    expect(unsubCount).toBe(0)

    // Change to sub2 — should unsub from sub1
    runner.run(() => useSyncExternalStore(sub2, () => val))
    expect(unsubCount).toBe(1)
  })
})

// ─── useSyncExternalStore unsubscribe on unmount ──────────────────────────

describe('useSyncExternalStore unmount cleanup', () => {
  test('unsubscribes on component unmount', () => {
    const el = container()
    let unsubbed = false
    const subscribe = (_cb: () => void) => () => { unsubbed = true }

    const Comp = () => {
      useSyncExternalStore(subscribe, () => 1)
      return h('div', null, 'x')
    }

    const cleanup = mount(jsx(Comp, {}), el)
    expect(unsubbed).toBe(false)
    cleanup()
    expect(unsubbed).toBe(true)
  })
})

// ─── useActionState async transitions ─────────────────────────────────────

describe('useActionState async transitions', () => {
  test('isPending transitions false → true → false during async action', async () => {
    const runner = createHookRunner()
    let resolveFn: (v: number) => void = () => {}
    runner.ctx.scheduleRerender = () => {}

    const [, dispatch] = runner.run(() =>
      useActionState(
        (_s: number, _p: number) => new Promise<number>((r) => { resolveFn = r }),
        0,
      ),
    )

    // Initially not pending
    const [, , isPending0] = runner.run(() =>
      useActionState((_s: number, _p: number) => Promise.resolve(0), 0),
    )
    expect(isPending0).toBe(false)

    // After dispatch, should be pending
    dispatch(1)
    const [, , isPending1] = runner.run(() =>
      useActionState((_s: number, _p: number) => Promise.resolve(0), 0),
    )
    expect(isPending1).toBe(true)

    // After resolve, should no longer be pending
    resolveFn(42)
    await new Promise<void>((r) => queueMicrotask(r))
    const [state, , isPending2] = runner.run(() =>
      useActionState((_s: number, _p: number) => Promise.resolve(0), 0),
    )
    expect(state).toBe(42)
    expect(isPending2).toBe(false)
  })
})

// ─── Component.render default ─────────────────────────────────────────────

describe('Component.render', () => {
  test('default render returns null', () => {
    const comp = new Component({})
    expect(comp.render()).toBeNull()
  })
})

// ─── PureComponent ────────────────────────────────────────────────────────

describe('PureComponent additional', () => {
  test('PureComponent extends Component', () => {
    const c = new PureComponent({ x: 1 })
    expect(c instanceof Component).toBe(true)
    expect(c instanceof PureComponent).toBe(true)
  })

  test('PureComponent state is empty object', () => {
    const c = new PureComponent({})
    expect(c.state).toEqual({})
  })
})

// ─── Hook count tracking ──────────────────────────────────────────────────

describe('hook count tracking', () => {
  test('_hookCount is tracked between renders', () => {
    const runner = createHookRunner()
    runner.run(() => { useState(0); useState(0) })
    expect(runner.ctx._hookCount).toBe(2)
  })

  test('_hookCount updates on re-render', () => {
    const runner = createHookRunner()
    runner.run(() => { useState(0); useState(0); useState(0) })
    expect(runner.ctx._hookCount).toBe(3)
  })
})

// ─── memo per-instance cache ──────────────────────────────────────────────

describe('memo per-instance cache', () => {
  test('separate instances have separate caches', () => {
    let callCount = 0
    const Inner = (props: { x: number }) => { callCount++; return h('span', null, String(props.x)) }
    const Memoized = memo(Inner)

    const runner1 = createHookRunner()
    const runner2 = createHookRunner()
    runner1.run(() => Memoized({ x: 1 }))
    runner2.run(() => Memoized({ x: 2 }))
    expect(callCount).toBe(2) // Both should render independently

    // Re-render with same props — instance 1 cached
    runner1.run(() => Memoized({ x: 1 }))
    expect(callCount).toBe(2) // Instance 1 cached, not re-rendered
  })
})

// ─── cloneElement with ref ────────────────────────────────────────────────

describe('cloneElement with ref', () => {
  test('merges ref prop', () => {
    const ref = { current: null }
    const el = h('div', {})
    const cloned = cloneElement(el, { ref })
    expect(cloned.props.ref).toBe(ref)
  })
})

// ─── flushSync returns result ─────────────────────────────────────────────

describe('flushSync return value', () => {
  test('returns callback result', () => {
    expect(flushSync(() => 42)).toBe(42)
  })

  test('returns string result', () => {
    expect(flushSync(() => 'hello')).toBe('hello')
  })

  test('returns undefined for void callback', () => {
    expect(flushSync(() => {})).toBeUndefined()
  })
})

// ─── act with async callback ──────────────────────────────────────────────

describe('act async', () => {
  test('handles async callback', async () => {
    let resolved = false
    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
      resolved = true
    })
    expect(resolved).toBe(true)
  })
})

// ─── StrictMode / Profiler with no children ───────────────────────────────

describe('StrictMode / Profiler edge cases', () => {
  test('StrictMode with no children returns null', () => {
    const result = StrictMode({})
    expect(result).toBeNull()
  })

  test('Profiler with no children returns null', () => {
    const result = Profiler({ id: 'test' })
    expect(result).toBeNull()
  })

  test('Profiler with onRender callback', () => {
    const el = container()
    let called = false
    mount(h(Profiler as any, { id: 'p', onRender: () => { called = true } }, h('span', null, 'child')), el)
    expect(el.textContent).toBe('child')
  })
})

// ─── Children.map key assignment ──────────────────────────────────────────

describe('Children.map key assignment', () => {
  test('assigns keys to mapped VNode children that lack keys', () => {
    const children = [h('span', null, 'a'), h('span', null, 'b')]
    const mapped = Children.map(children, (child) => child)
    expect((mapped[0] as any).key).toBe('.0')
    expect((mapped[1] as any).key).toBe('.1')
  })

  test('does not overwrite existing keys', () => {
    const child = h('span', { key: 'existing' }, 'a')
    const mapped = Children.map([child], (c) => c)
    expect((mapped[0] as any).key).toBe('existing')
  })

  test('skips key assignment for non-VNode mapped results', () => {
    const children = [h('span', null, 'a')]
    const mapped = Children.map(children, (_child, idx) => `text-${idx}`)
    expect(mapped[0]).toBe('text-0')
  })
})

// ─── Children.map with nulls ──────────────────────────────────────────────

describe('Children.map with nulls', () => {
  test('skips null/undefined/boolean children', () => {
    const indices: number[] = []
    const mapped = Children.map([null, 'a', undefined, false, true, 'b'], (_child, idx) => {
      indices.push(idx)
      return idx
    })
    expect(mapped).toEqual([0, 1])
    expect(indices).toEqual([0, 1])
  })
})

// ─── Children.only edge cases ─────────────────────────────────────────────

describe('Children.only edge', () => {
  test('works with single non-array child', () => {
    const child = h('div', null, 'only')
    expect(Children.only(child)).toBe(child)
  })
})

// ─── flattenChildren edge cases ───────────────────────────────────────────

describe('Children.toArray deep nesting', () => {
  test('flattens deeply nested arrays', () => {
    const children = [h('a', null), [h('b', null), [h('c', null)]]] as VNodeChild[]
    const arr = Children.toArray(children)
    expect(arr).toHaveLength(3)
  })
})

// ─── jsx runtime edge cases ──────────────────────────────────────────────

describe('jsx runtime additional', () => {
  test('jsx with null key does not set key prop', () => {
    const vnode = jsx('div', {}, null)
    expect(vnode.props.key).toBeUndefined()
  })

  test('input onChange does not override existing onInput', () => {
    const inputHandler = () => 'input'
    const changeHandler = () => 'change'
    const vnode = jsx('input', { onInput: inputHandler, onChange: changeHandler })
    // onInput already set, onChange should be deleted but onInput preserved
    expect(vnode.props.onInput).toBe(inputHandler)
    expect(vnode.props.onChange).toBeUndefined()
  })

  test('textarea defaultValue maps to value', () => {
    const vnode = jsx('textarea', { defaultValue: 'default text' })
    expect(vnode.props.value).toBe('default text')
    expect(vnode.props.defaultValue).toBeUndefined()
  })

  test('textarea defaultValue does NOT override explicit value', () => {
    const vnode = jsx('textarea', { value: 'explicit', defaultValue: 'default' })
    expect(vnode.props.value).toBe('explicit')
  })

  test('input defaultChecked does NOT override explicit checked', () => {
    const vnode = jsx('input', { checked: false, defaultChecked: true })
    expect(vnode.props.checked).toBe(false)
  })

  test('jsx component wrapping is cached', () => {
    const MyComp = () => h('div', null, 'test')
    const vnode1 = jsx(MyComp, {})
    const vnode2 = jsx(MyComp, {})
    // Same component function should produce same wrapped type
    expect(vnode1.type).toBe(vnode2.type)
  })

  test('jsx with array children for DOM element', () => {
    const vnode = jsx('div', { children: ['a', 'b', 'c'] })
    expect(vnode.children).toHaveLength(3)
  })
})

// ─── scheduleEffects skips when unmounted ─────────────────────────────────

describe('effect scheduling respects unmount', () => {
  test('effects do not run after unmount', async () => {
    const el = container()
    let effectRuns = 0
    let triggerSet: (v: number) => void = () => {}

    const Comp = () => {
      const [count, setCount] = useState(0)
      triggerSet = setCount
      useEffect(() => {
        effectRuns++
      }, [count])
      return h('div', null, String(count))
    }

    const cleanup = mount(jsx(Comp, {}), el)
    await new Promise<void>((r) => queueMicrotask(r))
    const initialRuns = effectRuns

    // Trigger state change then immediately unmount
    triggerSet(1)
    cleanup()
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    // Effect should not have run again after unmount
    expect(effectRuns).toBe(initialRuns)
  })
})

// ─── wrapCompatComponent cleanup on unmount ───────────────────────────────

describe('wrapCompatComponent cleanup', () => {
  test('cleans up effect entries on unmount', async () => {
    const el = container()
    let cleanupRan = false

    const Comp = () => {
      useEffect(() => {
        return () => { cleanupRan = true }
      }, [])
      return h('div', null, 'cleanup')
    }

    const unmount = mount(jsx(Comp, {}), el)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(cleanupRan).toBe(false)

    unmount()
    expect(cleanupRan).toBe(true)
  })

  test('cleans up useSyncExternalStore subscription on unmount', () => {
    const el = container()
    let unsubCount = 0
    // Use a stable subscribe function identity so re-renders don't trigger unsub
    const stableSub = (_cb: () => void) => () => { unsubCount++ }

    const Comp = () => {
      useSyncExternalStore(stableSub, () => 1)
      return h('div', null, 'sub')
    }

    const unmount = mount(jsx(Comp, {}), el)
    const preUnmountCount = unsubCount
    unmount()
    expect(unsubCount).toBe(preUnmountCount + 1)
  })
})

// ─── scheduleRerender deduplication ───────────────────────────────────────

describe('scheduleRerender deduplication', () => {
  test('multiple state updates in same tick produce single re-render', async () => {
    const el = container()
    let renderCount = 0
    let triggerSet: (v: number | ((p: number) => number)) => void = () => {}

    const Comp = () => {
      const [count, setCount] = useState(0)
      triggerSet = setCount
      renderCount++
      return h('span', null, String(count))
    }

    mount(jsx(Comp, {}), el)
    await new Promise<void>((r) => queueMicrotask(r))
    const initialRenders = renderCount

    // Multiple rapid updates should batch
    triggerSet(1)
    triggerSet(2)
    triggerSet(3)
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    // Should have at most 1 additional render (batched)
    expect(renderCount - initialRenders).toBeLessThanOrEqual(1)
  })
})

// ─── layout effect cleanup on unmount ─────────────────────────────────────

describe('layout effect cleanup on unmount', () => {
  test('layout effect cleanup runs on unmount', () => {
    const el = container()
    let cleanupRan = false

    const Comp = () => {
      useLayoutEffect(() => {
        return () => { cleanupRan = true }
      }, [])
      return h('div', null, 'layout')
    }

    const unmount = mount(jsx(Comp, {}), el)
    expect(cleanupRan).toBe(false)
    unmount()
    expect(cleanupRan).toBe(true)
  })
})

// ─── useState setter identity stability ─────────────────────────────────────

describe('useState setter identity stability', () => {
  test('setter has stable identity across renders', () => {
    const runner = createHookRunner()
    const [, setter1] = runner.run(() => useState(0))
    setter1(5)
    const [, setter2] = runner.run(() => useState(0))
    expect(setter1).toBe(setter2)
  })

  test('setter reads latest value when called multiple times', () => {
    const runner = createHookRunner()
    const [, setter] = runner.run(() => useState(0))
    setter(1)
    setter((prev) => prev + 1) // should read 1, not 0
    const [value] = runner.run(() => useState(0))
    expect(value).toBe(2)
  })

  test('setter identity stable even without state changes', () => {
    const runner = createHookRunner()
    const [, setter1] = runner.run(() => useState('hello'))
    const [, setter2] = runner.run(() => useState('hello'))
    const [, setter3] = runner.run(() => useState('hello'))
    expect(setter1).toBe(setter2)
    expect(setter2).toBe(setter3)
  })
})

// ─── useReducer dispatch identity stability ─────────────────────────────────

describe('useReducer dispatch identity stability', () => {
  test('dispatch has stable identity across renders', () => {
    const runner = createHookRunner()
    const reducer = (s: number, a: number) => s + a
    const [, dispatch1] = runner.run(() => useReducer(reducer, 0))
    dispatch1(5)
    const [, dispatch2] = runner.run(() => useReducer(reducer, 0))
    expect(dispatch1).toBe(dispatch2)
  })

  test('dispatch reads latest value when called multiple times', () => {
    const runner = createHookRunner()
    const reducer = (s: number, a: number) => s + a
    const [, dispatch] = runner.run(() => useReducer(reducer, 0))
    dispatch(10)
    dispatch(5)
    const [value] = runner.run(() => useReducer(reducer, 0))
    expect(value).toBe(15)
  })
})

// ─── Compat context ─────────────────────────────────────────────────────────

describe('compat context', () => {
  test('default value works without provider', () => {
    const Ctx = createCompatContext('default-val')
    const value = withHookCtx(() => useContext(Ctx))
    expect(value).toBe('default-val')
  })

  test('useContext works with Pyreon native context fallback', () => {
    const Ctx = pyreonCreateContext(99)
    const value = useContext(Ctx)
    expect(value).toBe(99)
  })

  test('provider passes value to consumer via DOM mount', () => {
    const el = container()
    const Ctx = createCompatContext('hello')
    let readValue = ''

    const Consumer = () => {
      readValue = useContext(Ctx)
      return h('span', null, readValue)
    }

    mount(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jsx(Ctx.Provider as any, { value: 'world', children: jsx(Consumer, {}) }),
      el,
    )
    expect(readValue).toBe('world')
  })

  test('use() reads compat context', () => {
    const Ctx = createCompatContext('from-use')
    const value = withHookCtx(() => use(Ctx))
    expect(value).toBe('from-use')
  })
})
