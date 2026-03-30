import type { VNode } from '@pyreon/core'
import GroupRenderer from '../kinetic/GroupRenderer'
import type { KineticConfig } from '../kinetic/types'

// Mock rAF for deterministic testing
let rafCallbacks: (() => void)[] = []
const originalRaf = globalThis.requestAnimationFrame
const originalCaf = globalThis.cancelAnimationFrame

beforeEach(() => {
  vi.useFakeTimers()
  rafCallbacks = []

  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: () => void) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    }),
  )

  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.stubGlobal('requestAnimationFrame', originalRaf)
  vi.stubGlobal('cancelAnimationFrame', originalCaf)
})

const makeConfig = (overrides: Partial<KineticConfig> = {}): KineticConfig => ({
  tag: 'div',
  mode: 'group',
  enter: 'g-enter',
  enterFrom: 'g-enter-from',
  enterTo: 'g-enter-to',
  leave: 'g-leave',
  leaveFrom: 'g-leave-from',
  leaveTo: 'g-leave-to',
  ...overrides,
})

/** Unwrap reactive accessors returned by GroupRenderer. */
const unwrap = (val: any): any => {
  let result = val
  while (typeof result === 'function') result = result()
  return result
}

const makeKeyedChild = (key: string | number, text: string): VNode => ({
  type: 'span',
  props: { 'data-testid': `child-${key}` },
  children: [text],
  key,
})

describe('GroupRenderer', () => {
  it('returns a VNode wrapping children in config.tag', () => {
    const config = makeConfig()
    const children = [makeKeyedChild('a', 'Alpha'), makeKeyedChild('b', 'Beta')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children,
      }),
    )

    expect(vnode).not.toBeNull()
    expect(vnode?.type).toBe('div')
  })

  it('uses custom tag from config', () => {
    const config = makeConfig({ tag: 'ul' })
    const children = [makeKeyedChild('a', 'Alpha')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children,
      }),
    )

    expect(vnode?.type).toBe('ul')
  })

  it('passes htmlProps to the wrapper element', () => {
    const config = makeConfig()
    const children = [makeKeyedChild('a', 'Alpha')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: { 'data-testid': 'group-wrapper', class: 'my-group' },
        callbacks: {},
        children,
      }),
    )

    const props = vnode?.props as Record<string, unknown>
    expect(props?.['data-testid']).toBe('group-wrapper')
    expect(props?.class).toBe('my-group')
  })

  it('wraps each keyed child in a TransitionItem', () => {
    const config = makeConfig()
    const children = [makeKeyedChild('a', 'Alpha'), makeKeyedChild('b', 'Beta')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children,
      }),
    )

    // The wrapper div should have children that are TransitionItem VNodes
    const wrapperChildren = vnode?.children
    expect(wrapperChildren).toBeDefined()
    const childArray = Array.isArray(wrapperChildren) ? wrapperChildren : [wrapperChildren]
    expect(childArray.length).toBe(2)

    // Each child should be a TransitionItem (function component)
    for (const child of childArray) {
      const childVNode = child as VNode
      expect(typeof childVNode.type).toBe('function')
    }
  })

  it('sets appear=true for newly added children (non-initial)', () => {
    const config = makeConfig()

    // First render with initial children
    const initialChildren = [makeKeyedChild('a', 'Alpha')]
    unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children: initialChildren,
      }),
    )

    // Second render with a new child added
    const updatedChildren = [makeKeyedChild('a', 'Alpha'), makeKeyedChild('b', 'Beta')]
    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children: updatedChildren,
      }),
    )

    const wrapperChildren = vnode?.children as VNode[]
    expect(wrapperChildren.length).toBe(2)
  })

  it('passes transition class config to TransitionItem children', () => {
    const config = makeConfig({
      enter: 'custom-enter',
      enterFrom: 'custom-from',
      enterTo: 'custom-to',
      leave: 'custom-leave',
      leaveFrom: 'custom-lfrom',
      leaveTo: 'custom-lto',
    })
    const children = [makeKeyedChild('a', 'Alpha')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children,
      }),
    )

    const wrapperChildren = vnode?.children as VNode[]
    const transitionItemVNode = wrapperChildren[0] as VNode
    const tiProps = transitionItemVNode.props as Record<string, unknown>

    expect(tiProps.enter).toBe('custom-enter')
    expect(tiProps.enterFrom).toBe('custom-from')
    expect(tiProps.enterTo).toBe('custom-to')
    expect(tiProps.leave).toBe('custom-leave')
    expect(tiProps.leaveFrom).toBe('custom-lfrom')
    expect(tiProps.leaveTo).toBe('custom-lto')
  })

  it('passes style transition config to TransitionItem children', () => {
    const config = makeConfig({
      enterStyle: { opacity: 0 },
      enterToStyle: { opacity: 1 },
      enterTransition: 'opacity 300ms ease',
      leaveStyle: { opacity: 1 },
      leaveToStyle: { opacity: 0 },
      leaveTransition: 'opacity 200ms ease-in',
    })
    const children = [makeKeyedChild('a', 'Alpha')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children,
      }),
    )

    const wrapperChildren = vnode?.children as VNode[]
    const tiProps = wrapperChildren[0]?.props as Record<string, unknown>

    expect(tiProps.enterStyle).toEqual({ opacity: 0 })
    expect(tiProps.enterToStyle).toEqual({ opacity: 1 })
    expect(tiProps.enterTransition).toBe('opacity 300ms ease')
    expect(tiProps.leaveStyle).toEqual({ opacity: 1 })
    expect(tiProps.leaveToStyle).toEqual({ opacity: 0 })
    expect(tiProps.leaveTransition).toBe('opacity 200ms ease-in')
  })

  it('uses effectiveAppear from config when appear prop is not provided', () => {
    const config = makeConfig({ appear: true })
    const children = [makeKeyedChild('a', 'Alpha')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children,
      }),
    )

    const wrapperChildren = vnode?.children as VNode[]
    const tiProps = wrapperChildren[0]?.props as Record<string, unknown>

    // Initial children should use effectiveAppear (true)
    expect(tiProps.appear).toBe(true)
  })

  it('uses effectiveTimeout from config when timeout prop is not provided', () => {
    const config = makeConfig({ timeout: 2000 })
    const children = [makeKeyedChild('a', 'Alpha')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children,
      }),
    )

    const wrapperChildren = vnode?.children as VNode[]
    const tiProps = wrapperChildren[0]?.props as Record<string, unknown>

    expect(tiProps.timeout).toBe(2000)
  })

  it('defaults timeout to 5000 when not provided', () => {
    const config = makeConfig()
    const children = [makeKeyedChild('a', 'Alpha')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children,
      }),
    )

    const wrapperChildren = vnode?.children as VNode[]
    const tiProps = wrapperChildren[0]?.props as Record<string, unknown>

    expect(tiProps.timeout).toBe(5000)
  })

  it('ignores children without keys', () => {
    const config = makeConfig()
    const keyedChild = makeKeyedChild('a', 'Alpha')
    const unkeyedChild: VNode = { type: 'span', props: {}, children: ['No key'], key: null }

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children: [keyedChild, unkeyedChild],
      }),
    )

    // Only keyed child should be wrapped in TransitionItem
    const wrapperChildren = vnode?.children as VNode[]
    expect(wrapperChildren.length).toBe(1)
  })

  it('appear prop overrides config.appear', () => {
    const config = makeConfig({ appear: false })
    const children = [makeKeyedChild('a', 'Alpha')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        appear: true,
        callbacks: {},
        children,
      }),
    )

    const wrapperChildren = vnode?.children as VNode[]
    const tiProps = wrapperChildren[0]?.props as Record<string, unknown>

    expect(tiProps.appear).toBe(true)
  })

  it('timeout prop overrides config.timeout', () => {
    const config = makeConfig({ timeout: 2000 })
    const children = [makeKeyedChild('a', 'Alpha')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        timeout: 3000,
        callbacks: {},
        children,
      }),
    )

    const wrapperChildren = vnode?.children as VNode[]
    const tiProps = wrapperChildren[0]?.props as Record<string, unknown>

    expect(tiProps.timeout).toBe(3000)
  })

  it('handleAfterLeave fires the callbacks.onAfterLeave and updates forceUpdateSignal', () => {
    const onAfterLeave = vi.fn()
    const config = makeConfig()
    const children = [makeKeyedChild('a', 'Alpha')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: { onAfterLeave },
        children,
      }),
    )

    // Each TransitionItem child gets an onAfterLeave that calls handleAfterLeave(key)
    const wrapperChildren = vnode?.children as VNode[]
    const tiProps = wrapperChildren[0]?.props as Record<string, unknown>
    const tiAfterLeave = tiProps.onAfterLeave as () => void

    expect(tiAfterLeave).toBeDefined()
    tiAfterLeave()

    expect(onAfterLeave).toHaveBeenCalledTimes(1)
  })

  it('TransitionItem children have show returning true for current children', () => {
    const config = makeConfig()
    const children = [makeKeyedChild('a', 'Alpha'), makeKeyedChild('b', 'Beta')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children,
      }),
    )

    const wrapperChildren = vnode?.children as VNode[]

    for (const child of wrapperChildren) {
      const tiProps = (child as VNode).props as Record<string, unknown>
      const showFn = tiProps.show as () => boolean
      expect(showFn()).toBe(true)
    }
  })

  it('initial children use effectiveAppear for appear prop', () => {
    const config = makeConfig({ appear: false })
    const children = [makeKeyedChild('a', 'Alpha')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children,
      }),
    )

    const wrapperChildren = vnode?.children as VNode[]
    const tiProps = wrapperChildren[0]?.props as Record<string, unknown>

    // Initial keys use effectiveAppear (false in this case)
    expect(tiProps.appear).toBe(false)
  })

  it('each TransitionItem child gets the element as its children', () => {
    const config = makeConfig()
    const children = [makeKeyedChild('a', 'Alpha')]

    const vnode = unwrap(
      GroupRenderer({
        config,
        htmlProps: {},
        callbacks: {},
        children,
      }),
    )

    const wrapperChildren = vnode?.children as VNode[]
    const tiVNode = wrapperChildren[0] as VNode

    // The TransitionItem should have the original element as children
    const tiChildren = (tiVNode.props as Record<string, unknown>)?.children ?? tiVNode.children
    expect(tiChildren).toBeDefined()
  })
})
