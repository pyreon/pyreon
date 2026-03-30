import type { VNode } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

let _reducedMotion = false

vi.mock('../useReducedMotion', () => ({
  useReducedMotion: () => () => _reducedMotion,
}))

import Transition from '../Transition'

// Mock rAF for deterministic double-rAF testing
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

const flushRaf = () => {
  const cbs = [...rafCallbacks]
  rafCallbacks = []
  for (const cb of cbs) cb()
}

const fireTransitionEnd = (el: HTMLElement) => {
  const event = new Event('transitionend', { bubbles: true })
  Object.defineProperty(event, 'target', { value: el })
  el.dispatchEvent(event)
}

/**
 * Recursively finds and invokes all refs in a VNode tree,
 * wiring them to the given element.
 */
const wireRef = (vnode: VNode | null, el: HTMLElement) => {
  if (!vnode) return
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex logic is inherent to this function
  const visitNode = (node: VNode) => {
    const nodeProps = node.props as Record<string, unknown>
    if (typeof nodeProps?.ref === 'function') {
      ;(nodeProps.ref as (element: HTMLElement | null) => void)(el)
    } else if (nodeProps?.ref && typeof nodeProps.ref === 'object') {
      ;(nodeProps.ref as { current: HTMLElement | null }).current = el
    }
    if (node.children) {
      const ch = Array.isArray(node.children) ? node.children : [node.children]
      for (const c of ch) {
        if (c && typeof c === 'object' && 'type' in (c as object)) visitNode(c as VNode)
      }
    }
    if (nodeProps?.children) {
      const pc = Array.isArray(nodeProps.children) ? nodeProps.children : [nodeProps.children]
      for (const c of pc) {
        if (c && typeof c === 'object' && 'type' in (c as object)) visitNode(c as VNode)
      }
    }
    if (
      nodeProps?.fallback &&
      typeof nodeProps.fallback === 'object' &&
      'type' in (nodeProps.fallback as object)
    ) {
      visitNode(nodeProps.fallback as VNode)
    }
  }
  visitNode(vnode)
}

/**
 * Helper: call Transition and wire up a mock element to the merged ref.
 */
const setupTransition = (props: Record<string, unknown>) => {
  const el = document.createElement('div')
  const child: VNode = {
    type: 'div',
    props: { 'data-testid': 'child' },
    children: ['Hello'],
    key: null,
  }

  const vnode = Transition({
    ...props,
    children: child,
  } as any)

  wireRef(vnode, el)

  return { vnode, el }
}

describe('Transition', () => {
  it('returns a VNode when show=true', () => {
    const show = signal(true)
    const child: VNode = { type: 'div', props: {}, children: ['Hello'], key: null }
    const vnode = Transition({ show, children: child })
    expect(vnode).not.toBeNull()
  })

  it('returns a VNode with Show component', () => {
    const show = signal(true)
    const child: VNode = { type: 'div', props: {}, children: ['Hello'], key: null }
    const vnode = Transition({ show, children: child })
    expect(vnode).not.toBeNull()
    // The outermost VNode should be a Show component
    expect(typeof vnode?.type).toBe('function')
  })

  it('fires onEnter callback when entering starts', () => {
    const show = signal(false)
    const onEnter = vi.fn()

    setupTransition({ show, onEnter })

    expect(onEnter).not.toHaveBeenCalled()

    show.set(true)
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('fires onLeave callback when leaving starts', () => {
    const show = signal(true)
    const onLeave = vi.fn()

    setupTransition({ show, onLeave })

    show.set(false)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('fires onAfterEnter after transitionend', () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()

    const { el } = setupTransition({ show, onAfterEnter })

    show.set(true)
    expect(onAfterEnter).not.toHaveBeenCalled()

    flushRaf()
    flushRaf()
    fireTransitionEnd(el)

    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })

  it('fires onAfterLeave after transitionend', () => {
    const show = signal(true)
    const onAfterLeave = vi.fn()

    const { el } = setupTransition({ show, onAfterLeave })

    show.set(false)
    expect(onAfterLeave).not.toHaveBeenCalled()

    flushRaf()
    flushRaf()
    fireTransitionEnd(el)

    expect(onAfterLeave).toHaveBeenCalledTimes(1)
  })

  it('applies enter classes on entering', () => {
    const show = signal(false)
    const { el } = setupTransition({
      show,
      enter: 't-enter',
      enterFrom: 't-enter-from',
      enterTo: 't-enter-to',
    })

    show.set(true)

    expect(el.classList.contains('t-enter')).toBe(true)
    expect(el.classList.contains('t-enter-from')).toBe(true)
    expect(el.classList.contains('t-enter-to')).toBe(false)
  })

  it('swaps enterFrom to enterTo after double rAF', () => {
    const show = signal(false)
    const { el } = setupTransition({
      show,
      enter: 't-enter',
      enterFrom: 't-enter-from',
      enterTo: 't-enter-to',
    })

    show.set(true)

    flushRaf()
    flushRaf()

    expect(el.classList.contains('t-enter')).toBe(true)
    expect(el.classList.contains('t-enter-from')).toBe(false)
    expect(el.classList.contains('t-enter-to')).toBe(true)
  })

  it('cleans up enter classes after transitionend', () => {
    const show = signal(false)
    const { el } = setupTransition({
      show,
      enter: 't-enter',
      enterFrom: 't-enter-from',
      enterTo: 't-enter-to',
    })

    show.set(true)
    flushRaf()
    flushRaf()
    fireTransitionEnd(el)

    // enter class should be removed on entered stage
    expect(el.classList.contains('t-enter')).toBe(false)
  })

  it('applies style-object transitions on entering', () => {
    const show = signal(false)
    const { el } = setupTransition({
      show,
      enterStyle: { opacity: 0 },
      enterToStyle: { opacity: 1 },
      enterTransition: 'opacity 300ms ease',
    })

    show.set(true)

    expect(el.style.opacity).toBe('0')
    expect(el.style.transition).toBe('opacity 300ms ease')

    flushRaf()
    flushRaf()

    expect(el.style.opacity).toBe('1')
  })

  it('applies leave classes on leaving', () => {
    const show = signal(true)
    const { el } = setupTransition({
      show,
      leave: 't-leave',
      leaveFrom: 't-leave-from',
      leaveTo: 't-leave-to',
    })

    show.set(false)

    expect(el.classList.contains('t-leave')).toBe(true)
    expect(el.classList.contains('t-leave-from')).toBe(true)

    flushRaf()
    flushRaf()

    expect(el.classList.contains('t-leave-from')).toBe(false)
    expect(el.classList.contains('t-leave-to')).toBe(true)
  })

  it('applies leave style transitions', () => {
    const show = signal(true)
    const { el } = setupTransition({
      show,
      leaveStyle: { opacity: 1 },
      leaveToStyle: { opacity: 0 },
      leaveTransition: 'opacity 200ms ease-in',
    })

    show.set(false)

    expect(el.style.opacity).toBe('1')
    expect(el.style.transition).toBe('opacity 200ms ease-in')

    flushRaf()
    flushRaf()

    expect(el.style.opacity).toBe('0')
  })

  it('appear=true fires onEnter on initial mount', () => {
    const show = signal(true)
    const onEnter = vi.fn()

    setupTransition({ show, appear: true, onEnter })

    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('timeout fallback completes transition when transitionend never fires', () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()

    setupTransition({ show, timeout: 1000, onAfterEnter })

    show.set(true)

    expect(onAfterEnter).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)

    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })

  it('cleans up transition style on entered stage', () => {
    const show = signal(false)
    const { el } = setupTransition({
      show,
      enter: 't-enter',
      enterTransition: 'opacity 300ms ease',
      enterStyle: { opacity: 0 },
      enterToStyle: { opacity: 1 },
    })

    show.set(true)
    expect(el.style.transition).toBe('opacity 300ms ease')
    expect(el.classList.contains('t-enter')).toBe(true)

    flushRaf()
    flushRaf()
    fireTransitionEnd(el)

    // After entering -> entered, transition reset and enter class removed
    expect(el.style.transition).toBe('')
    expect(el.classList.contains('t-enter')).toBe(false)
  })
})

describe('Transition — reduced motion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    rafCallbacks = []
    _reducedMotion = true

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
    _reducedMotion = false
  })

  it('reduced motion: entering fires onEnter and onAfterEnter immediately', () => {
    const show = signal(false)
    const onEnter = vi.fn()
    const onAfterEnter = vi.fn()

    setupTransition({ show, onEnter, onAfterEnter })

    show.set(true)

    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })

  it('reduced motion: leaving fires onLeave and onAfterLeave immediately', () => {
    const show = signal(true)
    const onLeave = vi.fn()
    const onAfterLeave = vi.fn()

    setupTransition({ show, onLeave, onAfterLeave })

    show.set(false)

    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(onAfterLeave).toHaveBeenCalledTimes(1)
  })

  it('reduced motion: does not use rAF or apply CSS classes', () => {
    const show = signal(false)
    const { el } = setupTransition({
      show,
      enter: 't-enter',
      enterFrom: 't-enter-from',
      enterTo: 't-enter-to',
    })

    show.set(true)

    expect(el.classList.contains('t-enter')).toBe(false)
    expect(el.classList.contains('t-enter-from')).toBe(false)
    expect(rafCallbacks.length).toBe(0)
  })
})
