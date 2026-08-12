import type { VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import StaggerRenderer from '../kinetic/StaggerRenderer'
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
  mode: 'stagger',
  enter: 's-enter',
  enterFrom: 's-enter-from',
  enterTo: 's-enter-to',
  leave: 's-leave',
  leaveFrom: 's-leave-from',
  leaveTo: 's-leave-to',
  ...overrides,
})

// Real h() instead of a hand-built `{ type, props, children, key }`
// literal — same VNode shape as production.
const makeChild = (key: string | number, text: string): VNode => {
  const vnode = h('span', { 'data-testid': `child-${key}` }, text) as VNode
  return { ...vnode, key }
}

/**
 * Extract the cloned child VNode from a TransitionItem VNode.
 *
 * With Pyreon's automatic JSX runtime, component children are placed in
 * props.children (not in vnode.children). We check both locations for safety.
 */
const extractStaggerChild = (tiVNode: VNode): VNode | null => {
  // For automatic JSX runtime, children are in props.children
  const props = tiVNode.props as Record<string, unknown>
  if (props?.children) {
    const pc = Array.isArray(props.children) ? props.children : [props.children]
    for (const c of pc) {
      if (c && typeof c === 'object' && 'type' in (c as object)) return c as VNode
    }
  }
  // Fallback: check vnode.children (classic runtime)
  if (tiVNode.children) {
    const ch = Array.isArray(tiVNode.children) ? tiVNode.children : [tiVNode.children]
    for (const c of ch) {
      if (c && typeof c === 'object' && 'type' in (c as object)) return c as VNode
    }
  }
  return null
}

describe('StaggerRenderer', () => {
  it('returns a VNode wrapping children in config.tag', () => {
    const config = makeConfig()
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    })

    expect(vnode).not.toBeNull()
    expect(vnode?.type).toBe('div')
  })

  it('uses custom tag from config', () => {
    const config = makeConfig({ tag: 'ul' })
    const children = [makeChild('a', 'Alpha')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    })

    expect(vnode?.type).toBe('ul')
  })

  it('passes htmlProps to the wrapper element', () => {
    const config = makeConfig()
    const children = [makeChild('a', 'Alpha')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: { 'data-testid': 'stagger-wrapper', class: 'my-stagger' },
      show: () => true,
      callbacks: {},
      children,
    })

    const props = vnode?.props as Record<string, unknown>
    expect(props?.['data-testid']).toBe('stagger-wrapper')
    expect(props?.class).toBe('my-stagger')
  })

  it('wraps each child in a TransitionItem', () => {
    const config = makeConfig()
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta'), makeChild('c', 'Charlie')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children
    const childArray = Array.isArray(wrapperChildren) ? wrapperChildren : [wrapperChildren]
    expect(childArray.length).toBe(3)

    for (const child of childArray) {
      const childVNode = child as VNode
      expect(typeof childVNode.type).toBe('function')
    }
  })

  it('injects --stagger-index CSS custom property on each child', () => {
    const config = makeConfig()
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta'), makeChild('c', 'Charlie')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]

    for (let i = 0; i < wrapperChildren.length; i++) {
      const clonedChild = extractStaggerChild(wrapperChildren[i] as VNode)
      const childProps = clonedChild?.props as Record<string, unknown>
      const style = childProps?.style as Record<string, unknown>

      expect(style?.['--stagger-index']).toBe(i)
    }
  })

  it('injects --stagger-interval CSS custom property on each child', () => {
    const config = makeConfig({ interval: 100 })
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      interval: 100,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]

    for (const child of wrapperChildren) {
      const clonedChild = extractStaggerChild(child as VNode)
      const childProps = clonedChild?.props as Record<string, unknown>
      const style = childProps?.style as Record<string, unknown>

      expect(style?.['--stagger-interval']).toBe('100ms')
    }
  })

  it('applies transitionDelay based on interval * index', () => {
    const config = makeConfig()
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta'), makeChild('c', 'Charlie')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      interval: 75,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]

    for (let i = 0; i < wrapperChildren.length; i++) {
      const clonedChild = extractStaggerChild(wrapperChildren[i] as VNode)
      const childProps = clonedChild?.props as Record<string, unknown>
      const style = childProps?.style as Record<string, unknown>

      expect(style?.transitionDelay).toBe(`${i * 75}ms`)
    }
  })

  it('uses default interval of 50ms when not specified', () => {
    const config = makeConfig()
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]

    // Check second child has 50ms delay (index=1 * 50ms)
    const clonedChild = extractStaggerChild(wrapperChildren[1] as VNode)
    const childProps = clonedChild?.props as Record<string, unknown>
    const style = childProps?.style as Record<string, unknown>

    expect(style?.transitionDelay).toBe('50ms')
    expect(style?.['--stagger-interval']).toBe('50ms')
  })

  it('reverseLeave keeps enter forward and reverses ONLY the leave delay', () => {
    const config = makeConfig()
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta'), makeChild('c', 'Charlie')]

    // The dominant real usage: visible at mount, reverseLeave affects the LATER
    // leave. (The reversal must NOT be gated on mount-time show() — that was the
    // bug: with show=true it never fired, so reverseLeave did nothing.)
    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      interval: 100,
      reverseLeave: true,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]
    const count = wrapperChildren.length

    for (let i = 0; i < count; i++) {
      const style = (extractStaggerChild(wrapperChildren[i] as VNode)?.props as Record<string, unknown>)
        ?.style as Record<string, unknown>
      // Enter is always forward (item 0 enters first).
      expect(style?.['--stagger-index']).toBe(i)
      expect(style?.['--kinetic-delay']).toBe(`${i * 100}ms`)
      // Leave is reversed: the last-entered item (highest index) leaves first.
      expect(style?.['--kinetic-leave-delay']).toBe(`${(count - 1 - i) * 100}ms`)
    }
    // Concretely for 3 @ 100ms: child 2 (last-in) leaves first (0ms), child 0 last (200ms).
    const s0 = (extractStaggerChild(wrapperChildren[0] as VNode)?.props as Record<string, unknown>)
      ?.style as Record<string, unknown>
    const s2 = (extractStaggerChild(wrapperChildren[2] as VNode)?.props as Record<string, unknown>)
      ?.style as Record<string, unknown>
    expect(s2['--kinetic-leave-delay']).toBe('0ms')
    expect(s0['--kinetic-leave-delay']).toBe('200ms')
  })

  it('reverseLeave reverses the leave delay even when show is true at mount (the common case)', () => {
    // Regression lock for the mount-time-show() gating bug: before the fix, the
    // reversal was gated on `!show()` evaluated once at mount, so a stagger
    // mounted visible (show=true) produced a FORWARD leave delay — reverseLeave
    // was a silent no-op in its dominant usage.
    const config = makeConfig()
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      interval: 100,
      reverseLeave: true,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]
    const s0 = (extractStaggerChild(wrapperChildren[0] as VNode)?.props as Record<string, unknown>)
      ?.style as Record<string, unknown>
    const s1 = (extractStaggerChild(wrapperChildren[1] as VNode)?.props as Record<string, unknown>)
      ?.style as Record<string, unknown>
    // Enter forward, leave reversed: child 1 (last-in) leaves first (0ms).
    expect(s0['--kinetic-delay']).toBe('0ms')
    expect(s1['--kinetic-delay']).toBe('100ms')
    expect(s0['--kinetic-leave-delay']).toBe('100ms')
    expect(s1['--kinetic-leave-delay']).toBe('0ms')
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
    const children = [makeChild('a', 'Alpha')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]
    const tiProps = wrapperChildren[0]?.props as Record<string, unknown>

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
    const children = [makeChild('a', 'Alpha')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]
    const tiProps = wrapperChildren[0]?.props as Record<string, unknown>

    expect(tiProps.enterStyle).toEqual({ opacity: 0 })
    expect(tiProps.enterToStyle).toEqual({ opacity: 1 })
    expect(tiProps.enterTransition).toBe('opacity 300ms ease')
    expect(tiProps.leaveStyle).toEqual({ opacity: 1 })
    expect(tiProps.leaveToStyle).toEqual({ opacity: 0 })
    expect(tiProps.leaveTransition).toBe('opacity 200ms ease-in')
  })

  it('adjusts timeout per child based on stagger delay', () => {
    const config = makeConfig()
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta'), makeChild('c', 'Charlie')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      timeout: 1000,
      interval: 100,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]

    // timeout = effectiveTimeout + delay, where delay = staggerIndex * interval
    for (let i = 0; i < wrapperChildren.length; i++) {
      const tiProps = wrapperChildren[i]?.props as Record<string, unknown>
      const expectedTimeout = 1000 + i * 100
      expect(tiProps.timeout).toBe(expectedTimeout)
    }
  })

  it('only fires onAfterLeave on the last child (normal order)', () => {
    const onAfterLeave = vi.fn()
    const config = makeConfig()
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta'), makeChild('c', 'Charlie')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: { onAfterLeave },
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]

    // onAfterLeave should only be on the last child (index=2)
    for (let i = 0; i < wrapperChildren.length; i++) {
      const tiProps = wrapperChildren[i]?.props as Record<string, unknown>
      if (i === 2) {
        expect(tiProps.onAfterLeave).toBeDefined()
      } else {
        expect(tiProps.onAfterLeave).toBeUndefined()
      }
    }
  })

  it('fires onAfterLeave on the first child when reverseLeave is true', () => {
    const onAfterLeave = vi.fn()
    const config = makeConfig()
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta'), makeChild('c', 'Charlie')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => false,
      reverseLeave: true,
      callbacks: { onAfterLeave },
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]

    // With reverseLeave, onAfterLeave should be on the first child (index=0)
    for (let i = 0; i < wrapperChildren.length; i++) {
      const tiProps = wrapperChildren[i]?.props as Record<string, unknown>
      if (i === 0) {
        expect(tiProps.onAfterLeave).toBeDefined()
      } else {
        expect(tiProps.onAfterLeave).toBeUndefined()
      }
    }
  })

  it('uses config.interval when interval prop is not provided', () => {
    const config = makeConfig({ interval: 200 })
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]
    const clonedChild = extractStaggerChild(wrapperChildren[1] as VNode)
    const childProps = clonedChild?.props as Record<string, unknown>
    const style = childProps?.style as Record<string, unknown>

    expect(style?.transitionDelay).toBe('200ms')
    expect(style?.['--stagger-interval']).toBe('200ms')
  })

  it('interval prop overrides config.interval', () => {
    const config = makeConfig({ interval: 200 })
    const children = [makeChild('a', 'Alpha'), makeChild('b', 'Beta')]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      interval: 300,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]
    const clonedChild = extractStaggerChild(wrapperChildren[1] as VNode)
    const childProps = clonedChild?.props as Record<string, unknown>
    const style = childProps?.style as Record<string, unknown>

    expect(style?.transitionDelay).toBe('300ms')
    expect(style?.['--stagger-interval']).toBe('300ms')
  })

  it('preserves existing style on child when injecting stagger styles', () => {
    const config = makeConfig()
    const realVnode = h('span', { style: { color: 'red', fontWeight: 'bold' } }, 'Styled') as VNode
    const childWithStyle: VNode = { ...realVnode, key: 'styled' }

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      interval: 50,
      callbacks: {},
      children: [childWithStyle],
    })

    const wrapperChildren = vnode?.children as VNode[]
    const clonedChild = extractStaggerChild(wrapperChildren[0] as VNode)
    const childProps = clonedChild?.props as Record<string, unknown>
    const style = childProps?.style as Record<string, unknown>

    // Original styles preserved
    expect(style?.color).toBe('red')
    expect(style?.fontWeight).toBe('bold')
    // Stagger styles injected
    expect(style?.['--stagger-index']).toBe(0)
    expect(style?.['--stagger-interval']).toBe('50ms')
    expect(style?.transitionDelay).toBe('0ms')
  })

  it('filters out non-VNode children', () => {
    const config = makeConfig()
    const validChild = makeChild('a', 'Alpha')
    // Simulate non-VNode values in children array
    const children = [validChild, null as unknown as VNode, undefined as unknown as VNode]

    const vnode = StaggerRenderer({
      config,
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children,
    })

    const wrapperChildren = vnode?.children as VNode[]
    expect(wrapperChildren.length).toBe(1)
  })
})
