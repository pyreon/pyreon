import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import {
  Children,
  cloneElement,
  forwardRef,
  memo,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from '../index'
import type { RenderContext } from '../jsx-runtime'
import { beginRender, endRender, jsx } from '../jsx-runtime'

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

/** Creates a RenderContext for testing hooks outside of full render cycle */
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

function withHookCtx<T>(fn: () => T): T {
  const runner = createHookRunner()
  return runner.run(fn)
}

// ─── useState ────────────────────────────────────────────────────────────────

describe('useState', () => {
  test('returns [value, setter]', () => {
    const [count, setCount] = withHookCtx(() => useState(0))
    expect(count).toBe(0)
    expect(typeof setCount).toBe('function')
  })

  test('setter with value updates signal', () => {
    const runner = createHookRunner()
    const [, setCount] = runner.run(() => useState(0))
    setCount(42)
    const [count2] = runner.run(() => useState(0))
    expect(count2).toBe(42)
  })

  test('setter with function updates based on current', () => {
    const runner = createHookRunner()
    const [, setCount] = runner.run(() => useState(10))
    setCount((prev) => prev * 2)
    const [count2] = runner.run(() => useState(10))
    expect(count2).toBe(20)
  })
})

// ─── useEffect ───────────────────────────────────────────────────────────────

describe('useEffect', () => {
  test('runs immediately without deps', async () => {
    const el = container()
    let effectRuns = 0

    const Comp = () => {
      useEffect(() => {
        effectRuns++
      })
      return h('div', null, 'test')
    }

    mount(jsx(Comp, {}), el)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(effectRuns).toBeGreaterThanOrEqual(1)
  })

  test('runs cleanup on re-run', async () => {
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
      return h('div', null, String(count))
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

  test('empty deps [] = runs once', async () => {
    const el = container()
    let effectRuns = 0
    let triggerSet: (v: number) => void = () => {}

    const Comp = () => {
      const [count, setCount] = useState(0)
      triggerSet = setCount
      useEffect(() => {
        effectRuns++
      }, [])
      return h('div', null, String(count))
    }

    mount(jsx(Comp, {}), el)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(effectRuns).toBe(1)

    // Re-render should NOT re-run the effect
    triggerSet(1)
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    expect(effectRuns).toBe(1)
  })
})

// ─── useMemo ─────────────────────────────────────────────────────────────────

describe('useMemo', () => {
  test('returns computed value', () => {
    const value = withHookCtx(() => useMemo(() => 6 * 7, []))
    expect(value).toBe(42)
  })

  test('recalculates when dep changes', () => {
    const runner = createHookRunner()
    const v1 = runner.run(() => useMemo(() => 'a', ['x']))
    expect(v1).toBe('a')

    // Same deps — cached
    const v2 = runner.run(() => useMemo(() => 'b', ['x']))
    expect(v2).toBe('a')

    // Different deps — recompute
    const v3 = runner.run(() => useMemo(() => 'c', ['y']))
    expect(v3).toBe('c')
  })
})

// ─── useRef ──────────────────────────────────────────────────────────────────

describe('useRef', () => {
  test('initial current value', () => {
    const ref = withHookCtx(() => useRef(99))
    expect(ref.current).toBe(99)
  })

  test('mutable current', () => {
    const ref = withHookCtx(() => useRef(0))
    ref.current = 123
    expect(ref.current).toBe(123)
  })
})

// ─── useReducer ──────────────────────────────────────────────────────────────

describe('useReducer', () => {
  test('dispatch actions update state', () => {
    const runner = createHookRunner()
    type Action = { type: 'add'; payload: number } | { type: 'reset' }
    const reducer = (state: number, action: Action): number => {
      switch (action.type) {
        case 'add':
          return state + action.payload
        case 'reset':
          return 0
        default:
          return state
      }
    }

    const [s0, dispatch] = runner.run(() => useReducer(reducer, 10))
    expect(s0).toBe(10)

    dispatch({ type: 'add', payload: 5 })
    const [s1] = runner.run(() => useReducer(reducer, 10))
    expect(s1).toBe(15)

    dispatch({ type: 'reset' })
    const [s2] = runner.run(() => useReducer(reducer, 10))
    expect(s2).toBe(0)
  })
})

// ─── memo ────────────────────────────────────────────────────────────────────

describe('memo', () => {
  test('returns same component (memoized)', () => {
    let renders = 0
    const Inner = (props: { x: number }) => {
      renders++
      return h('span', null, String(props.x))
    }
    const Memoized = memo(Inner)

    Memoized({ x: 1 })
    expect(renders).toBe(1)

    Memoized({ x: 1 })
    expect(renders).toBe(1) // same props — skipped

    Memoized({ x: 2 })
    expect(renders).toBe(2) // different props — re-rendered
  })
})

// ─── forwardRef ──────────────────────────────────────────────────────────────

describe('forwardRef', () => {
  test('passes ref through to render function', () => {
    const ref = { current: null as HTMLDivElement | null }
    let receivedRef: { current: unknown } | null = null

    const FancyInput = forwardRef<{ label: string }>((props, fwdRef) => {
      receivedRef = fwdRef
      return h('div', null, props.label)
    })

    FancyInput({ label: 'test', ref })
    expect(receivedRef).toBe(ref)
  })

  test('ref defaults to null when not provided', () => {
    let receivedRef: { current: unknown } | null = 'not-called' as unknown as null

    const Comp = forwardRef<Record<string, unknown>>((_props, fwdRef) => {
      receivedRef = fwdRef
      return h('div', null, 'no-ref')
    })

    Comp({})
    expect(receivedRef).toBeNull()
  })
})

// ─── Children utilities ──────────────────────────────────────────────────────

describe('Children utilities', () => {
  test('Children.map iterates VNode children', () => {
    const children = [h('span', null, 'a'), h('span', null, 'b'), h('span', null, 'c')]
    const mapped = Children.map(children, (child, index) => ({ child, index }))
    expect(mapped).toHaveLength(3)
    expect(mapped[0]?.index).toBe(0)
    expect(mapped[1]?.index).toBe(1)
    expect(mapped[2]?.index).toBe(2)
  })

  test('Children.count returns count', () => {
    const children = [h('span', null, 'a'), h('span', null, 'b')]
    expect(Children.count(children)).toBe(2)
  })

  test('Children.count skips null/undefined/boolean', () => {
    const children = [h('span', null, 'a'), null, undefined, true, false, h('span', null, 'b')]
    expect(Children.count(children)).toBe(2)
  })

  test('Children.toArray converts to flat array', () => {
    const children = [h('span', null, 'a'), [h('span', null, 'b'), h('span', null, 'c')]]
    const arr = Children.toArray(children)
    expect(arr).toHaveLength(3)
  })

  test('Children.toArray filters out null/undefined/boolean', () => {
    const children = [null, h('span', null, 'a'), undefined, false, true]
    const arr = Children.toArray(children)
    expect(arr).toHaveLength(1)
  })

  test('Children.only returns single child', () => {
    const child = h('span', null, 'only')
    const result = Children.only([child])
    expect(result).toBe(child)
  })

  test('Children.only throws with multiple children', () => {
    const children = [h('span', null, 'a'), h('span', null, 'b')]
    expect(() => Children.only(children)).toThrow('exactly one child')
  })

  test('Children.only throws with no children', () => {
    expect(() => Children.only([])).toThrow('exactly one child')
  })

  test('Children.forEach iterates without return', () => {
    const children = [h('span', null, 'a'), h('span', null, 'b')]
    const indices: number[] = []
    Children.forEach(children, (_child, index) => {
      indices.push(index)
    })
    expect(indices).toEqual([0, 1])
  })

  test('Children.map with single child (not array)', () => {
    const child = h('span', null, 'solo')
    const mapped = Children.map(child, (_c, i) => i)
    expect(mapped).toEqual([0])
  })

  test('Children.count with single child', () => {
    expect(Children.count(h('span', null, 'x'))).toBe(1)
  })

  test('Children.count with null', () => {
    expect(Children.count(null)).toBe(0)
  })
})

// ─── cloneElement ────────────────────────────────────────────────────────────

describe('cloneElement', () => {
  test('clones element with merged props', () => {
    const original = h('div', { id: 'original', class: 'a' }, 'hello')
    const cloned = cloneElement(original, { class: 'b', 'data-new': true })
    expect(cloned.type).toBe('div')
    expect(cloned.props.id).toBe('original')
    expect(cloned.props.class).toBe('b')
    expect(cloned.props['data-new']).toBe(true)
  })

  test('clones element preserving children when none provided', () => {
    const original = h('div', null, 'child')
    const cloned = cloneElement(original)
    expect(cloned.children).toHaveLength(1)
    expect(cloned.children[0]).toBe('child')
  })

  test('clones element with new children', () => {
    const original = h('div', null, 'old')
    const cloned = cloneElement(original, {}, 'new1', 'new2')
    expect(cloned.children).toHaveLength(2)
    expect(cloned.children[0]).toBe('new1')
    expect(cloned.children[1]).toBe('new2')
  })
})

// ─── JSX runtime attribute mapping ──────────────────────────────────────────

describe('jsx-runtime attribute mapping', () => {
  test('className is mapped to class', () => {
    const vnode = jsx('div', { className: 'my-class', children: 'text' })
    expect(vnode.props.class).toBe('my-class')
    expect(vnode.props.className).toBeUndefined()
  })

  test('htmlFor is mapped to for', () => {
    const vnode = jsx('label', { htmlFor: 'input-id', children: 'Label' })
    expect(vnode.props.for).toBe('input-id')
    expect(vnode.props.htmlFor).toBeUndefined()
  })

  test('className and htmlFor on same element', () => {
    const vnode = jsx('label', { className: 'label-class', htmlFor: 'name', children: 'Name' })
    expect(vnode.props.class).toBe('label-class')
    expect(vnode.props.for).toBe('name')
    expect(vnode.props.className).toBeUndefined()
    expect(vnode.props.htmlFor).toBeUndefined()
  })

  test('className/htmlFor not mapped on component types', () => {
    const MyComp = (props: { className?: string; htmlFor?: string }) =>
      h('div', null, props.className ?? '')
    const vnode = jsx(MyComp, { className: 'keep', htmlFor: 'keep' })
    // Component props should pass through to the wrapper — no rename
    expect(vnode.type).not.toBe(MyComp) // wrapped by compat runtime
    expect(typeof vnode.type).toBe('function')
  })
})
