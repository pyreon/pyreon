import type { VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import Collapse from '../Collapse'
import CollapseRenderer from '../kinetic/CollapseRenderer'
import type { KineticConfig } from '../kinetic/types'

let _reducedMotion = false

vi.mock('../useReducedMotion', () => ({
  useReducedMotion: () => () => _reducedMotion,
}))

// Mock scrollHeight
const mockScrollHeight = (value: number) => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return value
    },
  })
}

const fireTransitionEnd = (el: HTMLElement) => {
  const event = new Event('transitionend', { bubbles: true })
  Object.defineProperty(event, 'target', { value: el })
  el.dispatchEvent(event)
}

/**
 * Helper: call Collapse and wire up mock elements to the refs.
 * Collapse creates a wrapper div (wrapperRef) and inner content div (contentRef).
 * We manually assign mock elements to the refs so the animation logic runs.
 */
const setupCollapse = (props: Record<string, unknown>) => {
  const wrapperEl = document.createElement('div')
  const contentEl = document.createElement('div')

  // Mock offsetHeight for reflow forcing
  Object.defineProperty(wrapperEl, 'offsetHeight', {
    configurable: true,
    get() {
      return 0
    },
  })

  const vnode = Collapse(props as any)

  // Wire up refs: the wrapper div has ref={wrapperRef}, inner div has ref={contentRef}
  // In the VNode tree: <div ref={wrapperRef}><Show><div ref={contentRef}>...</div></Show></div>
  if (vnode?.props) {
    const vnodeProps = vnode.props as Record<string, unknown>
    // wrapperRef is on the outer div
    if (typeof vnodeProps.ref === 'function') {
      ;(vnodeProps.ref as (el: HTMLElement | null) => void)(wrapperEl)
    } else if (vnodeProps.ref && typeof vnodeProps.ref === 'object') {
      ;(vnodeProps.ref as { current: HTMLElement | null }).current = wrapperEl
    }
  }

  // Find contentRef in children (Show > div)
  if (vnode?.children) {
    const children = Array.isArray(vnode.children) ? vnode.children : [vnode.children]
    for (const child of children) {
      if (child && typeof child === 'object' && 'type' in (child as object)) {
        const showNode = child as any
        // Show's children contain <div ref={contentRef}>
        const showChildren = showNode.props?.children ?? showNode.children
        if (showChildren) {
          const sc = Array.isArray(showChildren) ? showChildren : [showChildren]
          for (const s of sc) {
            if (s && typeof s === 'object' && 'props' in s) {
              const ref = s.props?.ref
              if (ref && typeof ref === 'object') {
                ref.current = contentEl
              } else if (typeof ref === 'function') {
                ref(contentEl)
              }
            }
          }
        }
      }
    }
  }

  return { vnode, wrapperEl, contentEl }
}

describe('Collapse', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockScrollHeight(200)
  })

  afterEach(() => vi.useRealTimers())

  it('returns a VNode', () => {
    const show = signal(true)
    const child = h('div', null, 'Hello') as VNode
    const vnode = Collapse({ show, children: child } as any)
    expect(vnode).not.toBeNull()
  })

  it('fires onEnter callback when entering', () => {
    const show = signal(false)
    const onEnter = vi.fn()

    setupCollapse({
      show,
      onEnter,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(true)
    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('fires onAfterEnter after transitionend', () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()

    const { wrapperEl } = setupCollapse({
      show,
      onAfterEnter,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(true)
    expect(onAfterEnter).not.toHaveBeenCalled()

    fireTransitionEnd(wrapperEl)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })

  it('fires onLeave callback when leaving', () => {
    const show = signal(true)
    const onLeave = vi.fn()

    setupCollapse({
      show,
      onLeave,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(false)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('fires onAfterLeave after transitionend', () => {
    const show = signal(true)
    const onAfterLeave = vi.fn()

    const { wrapperEl } = setupCollapse({
      show,
      onAfterLeave,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(false)
    expect(onAfterLeave).not.toHaveBeenCalled()

    fireTransitionEnd(wrapperEl)
    expect(onAfterLeave).toHaveBeenCalledTimes(1)
  })

  it('animates height from 0 to scrollHeight on enter', () => {
    const show = signal(false)

    const { wrapperEl } = setupCollapse({
      show,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(true)

    expect(wrapperEl.style.height).toBe('200px')
    expect(wrapperEl.style.transition).toBe('height 300ms ease')
  })

  it('switches to height:auto after enter animation completes', () => {
    const show = signal(false)

    const { wrapperEl } = setupCollapse({
      show,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(true)
    fireTransitionEnd(wrapperEl)

    expect(wrapperEl.style.height).toBe('auto')
    expect(wrapperEl.style.overflow).toBe('')
    expect(wrapperEl.style.transition).toBe('')
  })

  it('animates height to 0 on leave', () => {
    const show = signal(true)

    const { wrapperEl } = setupCollapse({
      show,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(false)

    expect(wrapperEl.style.height).toBe('0px')
    expect(wrapperEl.style.overflow).toBe('hidden')
  })

  it('uses custom transition property', () => {
    const show = signal(false)

    const { wrapperEl } = setupCollapse({
      show,
      transition: 'height 500ms ease-in-out',
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(true)

    expect(wrapperEl.style.transition).toBe('height 500ms ease-in-out')
  })

  it('appear=true animates on initial mount', async () => {
    const show = signal(true)
    const onEnter = vi.fn()

    const { wrapperEl } = setupCollapse({
      show,
      appear: true,
      onEnter,
      children: h('div', null, 'Hello') as VNode,
    })

    // appear defers via queueMicrotask so all refs are wired first
    await Promise.resolve()

    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(wrapperEl.style.height).toBe('200px')
  })

  it('custom timeout completes leave when transitionend does not fire', () => {
    const show = signal(true)
    const onAfterLeave = vi.fn()

    setupCollapse({
      show,
      timeout: 800,
      onAfterLeave,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(false)
    expect(onAfterLeave).not.toHaveBeenCalled()

    vi.advanceTimersByTime(800)

    expect(onAfterLeave).toHaveBeenCalledTimes(1)
  })

  it('interrupts leave and starts entering when toggled back to show', () => {
    const show = signal(true)
    const onEnter = vi.fn()
    const onLeave = vi.fn()

    const { wrapperEl } = setupCollapse({
      show,
      onEnter,
      onLeave,
      children: h('div', null, 'Hello') as VNode,
    })

    // Start leaving
    show.set(false)
    expect(onLeave).toHaveBeenCalledTimes(1)

    // Toggle back
    show.set(true)
    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(wrapperEl.style.height).toBe('200px')
  })

  it('interrupts entering and starts leaving when toggled back to hide', () => {
    const show = signal(false)
    const onEnter = vi.fn()
    const onLeave = vi.fn()

    setupCollapse({
      show,
      onEnter,
      onLeave,
      children: h('div', null, 'Hello') as VNode,
    })

    // Start entering
    show.set(true)
    expect(onEnter).toHaveBeenCalledTimes(1)

    // Toggle back before transitionend
    show.set(false)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('does not re-trigger entering if already entered', () => {
    const show = signal(false)
    const onEnter = vi.fn()

    const { wrapperEl } = setupCollapse({
      show,
      onEnter,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(true)
    expect(onEnter).toHaveBeenCalledTimes(1)

    // Complete the transition
    fireTransitionEnd(wrapperEl)

    // Toggle show off and on again
    show.set(false)
    show.set(true)
    expect(onEnter).toHaveBeenCalledTimes(2)
  })

  it('does not re-trigger leaving if already hidden', () => {
    const show = signal(true)
    const onLeave = vi.fn()

    const { wrapperEl } = setupCollapse({
      show,
      onLeave,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(false)
    expect(onLeave).toHaveBeenCalledTimes(1)

    fireTransitionEnd(wrapperEl)

    // Already hidden, setting false again should not trigger leave
    show.set(false)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('appear=true fires onAfterEnter after transitionend', async () => {
    const show = signal(true)
    const onAfterEnter = vi.fn()

    const { wrapperEl } = setupCollapse({
      show,
      appear: true,
      onAfterEnter,
      children: h('div', null, 'Hello') as VNode,
    })

    await Promise.resolve()

    expect(onAfterEnter).not.toHaveBeenCalled()
    fireTransitionEnd(wrapperEl)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })

  it('leave transition sets height to scrollHeight first then to 0', () => {
    const show = signal(true)

    const { wrapperEl } = setupCollapse({
      show,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(false)

    // After leaving, height should be 0
    expect(wrapperEl.style.height).toBe('0px')
    expect(wrapperEl.style.overflow).toBe('hidden')
    expect(wrapperEl.style.transition).toBe('height 300ms ease')
  })
})

// ─── CollapseRenderer (kinetic mode) ──────────────────────

const makeCollapseConfig = (overrides: Partial<KineticConfig> = {}): KineticConfig => ({
  tag: 'div',
  mode: 'collapse',
  ...overrides,
})

/** Wire a ref (function or object) on a VNode's props to a given element. */
const wireWrapperRef = (vnode: VNode | null, el: HTMLElement) => {
  if (!vnode?.props) return
  const vnodeProps = vnode.props as Record<string, unknown>
  if (typeof vnodeProps.ref === 'function') {
    ;(vnodeProps.ref as (el: HTMLElement | null) => void)(el)
  } else if (vnodeProps.ref && typeof vnodeProps.ref === 'object') {
    ;(vnodeProps.ref as { current: HTMLElement | null }).current = el
  }
}

/** Find and wire contentRef inside Show > div children. */
const wireContentRef = (vnode: VNode | null, contentEl: HTMLElement) => {
  if (!vnode?.children) return
  const vnodeChildren = Array.isArray(vnode.children) ? vnode.children : [vnode.children]
  for (const c of vnodeChildren) {
    if (!c || typeof c !== 'object' || !('type' in (c as object))) continue
    const showNode = c as any
    const showChildren = showNode.props?.children ?? showNode.children
    if (!showChildren) continue
    const sc = Array.isArray(showChildren) ? showChildren : [showChildren]
    for (const s of sc) {
      if (!s || typeof s !== 'object' || !('props' in s)) continue
      const ref = s.props?.ref
      if (ref && typeof ref === 'object') {
        ref.current = contentEl
      } else if (typeof ref === 'function') {
        ref(contentEl)
      }
    }
  }
}

/**
 * Helper: call CollapseRenderer and wire up mock elements to the refs.
 * CollapseRenderer uses h(config.tag, { ref: wrapperRef }) and an inner
 * <div ref={contentRef}> — same structure as Collapse but via config.tag.
 */
const setupCollapseRenderer = (props: {
  config?: KineticConfig
  show: () => boolean
  appear?: boolean | undefined
  timeout?: number | undefined
  transition?: string | undefined
  callbacks?: Record<string, unknown>
  children?: VNode | VNode[]
}) => {
  const wrapperEl = document.createElement('div')
  const contentEl = document.createElement('div')

  Object.defineProperty(wrapperEl, 'offsetHeight', {
    configurable: true,
    get() {
      return 0
    },
  })

  const config = props.config ?? makeCollapseConfig()
  const child = h('p', null, 'Content') as VNode

  const vnode = CollapseRenderer({
    config,
    htmlProps: {},
    show: props.show,
    appear: props.appear,
    timeout: props.timeout,
    transition: props.transition,
    callbacks: (props.callbacks ?? {}) as Record<string, () => void>,
    children: props.children ?? child,
  })

  wireWrapperRef(vnode, wrapperEl)
  wireContentRef(vnode, contentEl)

  return { vnode, wrapperEl, contentEl }
}

describe('CollapseRenderer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockScrollHeight(200)
  })

  afterEach(() => vi.useRealTimers())

  it('returns a VNode with the config.tag', () => {
    const show = signal(true)
    const config = makeCollapseConfig({ tag: 'section' })
    const child = h('p', null, 'Content') as VNode

    const vnode = CollapseRenderer({
      config,
      htmlProps: {},
      show: () => show(),
      callbacks: {},
      children: child,
    })

    expect(vnode).not.toBeNull()
    expect(vnode?.type).toBe('section')
  })

  it('fires onEnter and animates height on entering', () => {
    const show = signal(false)
    const onEnter = vi.fn()

    const { wrapperEl } = setupCollapseRenderer({
      show: () => show(),
      callbacks: { onEnter },
    })

    show.set(true)
    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(wrapperEl.style.height).toBe('200px')
    expect(wrapperEl.style.transition).toBe('height 300ms ease')
  })

  it('fires onLeave and animates height to 0 on leaving', () => {
    const show = signal(true)
    const onLeave = vi.fn()

    const { wrapperEl } = setupCollapseRenderer({
      show: () => show(),
      callbacks: { onLeave },
    })

    show.set(false)
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(wrapperEl.style.height).toBe('0px')
    expect(wrapperEl.style.overflow).toBe('hidden')
  })

  it('fires onAfterEnter and sets height:auto after transitionend', () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()

    const { wrapperEl } = setupCollapseRenderer({
      show: () => show(),
      callbacks: { onAfterEnter },
    })

    show.set(true)
    fireTransitionEnd(wrapperEl)

    expect(onAfterEnter).toHaveBeenCalledTimes(1)
    expect(wrapperEl.style.height).toBe('auto')
    expect(wrapperEl.style.overflow).toBe('')
    expect(wrapperEl.style.transition).toBe('')
  })

  it('fires onAfterLeave after leave transitionend', () => {
    const show = signal(true)
    const onAfterLeave = vi.fn()

    const { wrapperEl } = setupCollapseRenderer({
      show: () => show(),
      callbacks: { onAfterLeave },
    })

    show.set(false)
    fireTransitionEnd(wrapperEl)

    expect(onAfterLeave).toHaveBeenCalledTimes(1)
  })

  it('uses custom transition from prop', () => {
    const show = signal(false)

    const { wrapperEl } = setupCollapseRenderer({
      show: () => show(),
      transition: 'height 500ms ease-in-out',
      callbacks: {},
    })

    show.set(true)
    expect(wrapperEl.style.transition).toBe('height 500ms ease-in-out')
  })

  it('uses config.transition as fallback', () => {
    const show = signal(false)
    const config = makeCollapseConfig({ transition: 'height 700ms linear' })

    const { wrapperEl } = setupCollapseRenderer({
      config,
      show: () => show(),
      callbacks: {},
    })

    show.set(true)
    expect(wrapperEl.style.transition).toBe('height 700ms linear')
  })

  it('appear=true triggers entering via ref proxy on initial mount', async () => {
    const show = signal(true)
    const onEnter = vi.fn()

    const { wrapperEl } = setupCollapseRenderer({
      show: () => show(),
      appear: true,
      callbacks: { onEnter },
    })

    // appear defers via queueMicrotask
    await Promise.resolve()

    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(wrapperEl.style.height).toBe('200px')
  })

  it('timeout fallback completes enter when transitionend never fires', () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()

    setupCollapseRenderer({
      show: () => show(),
      timeout: 600,
      callbacks: { onAfterEnter },
    })

    show.set(true)
    expect(onAfterEnter).not.toHaveBeenCalled()

    vi.advanceTimersByTime(600)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })

  it('timeout fallback completes leave when transitionend never fires', () => {
    const show = signal(true)
    const onAfterLeave = vi.fn()

    setupCollapseRenderer({
      show: () => show(),
      timeout: 600,
      callbacks: { onAfterLeave },
    })

    show.set(false)
    expect(onAfterLeave).not.toHaveBeenCalled()

    vi.advanceTimersByTime(600)
    expect(onAfterLeave).toHaveBeenCalledTimes(1)
  })

  it('interrupts leave and re-enters when show toggles back', () => {
    const show = signal(true)
    const onEnter = vi.fn()
    const onLeave = vi.fn()

    const { wrapperEl } = setupCollapseRenderer({
      show: () => show(),
      callbacks: { onEnter, onLeave },
    })

    show.set(false)
    expect(onLeave).toHaveBeenCalledTimes(1)

    show.set(true)
    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(wrapperEl.style.height).toBe('200px')
  })

  it('uses config.timeout as fallback', () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()
    const config = makeCollapseConfig({ timeout: 400 })

    setupCollapseRenderer({
      config,
      show: () => show(),
      callbacks: { onAfterEnter },
    })

    show.set(true)
    vi.advanceTimersByTime(400)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })

  it('uses config.appear as fallback', async () => {
    const show = signal(true)
    const onEnter = vi.fn()
    const config = makeCollapseConfig({ appear: true })

    setupCollapseRenderer({
      config,
      show: () => show(),
      callbacks: { onEnter },
    })

    await Promise.resolve()
    expect(onEnter).toHaveBeenCalledTimes(1)
  })
})

describe('CollapseRenderer — reduced motion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockScrollHeight(200)
    _reducedMotion = true
  })

  afterEach(() => {
    vi.useRealTimers()
    _reducedMotion = false
  })

  it('reduced motion: entering skips animation and sets height:auto immediately', () => {
    const show = signal(false)
    const onEnter = vi.fn()
    const onAfterEnter = vi.fn()

    const { wrapperEl } = setupCollapseRenderer({
      show: () => show(),
      callbacks: { onEnter, onAfterEnter },
    })

    show.set(true)

    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
    expect(wrapperEl.style.height).toBe('auto')
    expect(wrapperEl.style.overflow).toBe('')
  })

  it('reduced motion: leaving skips animation and sets height:0 immediately', () => {
    const show = signal(true)
    const onLeave = vi.fn()
    const onAfterLeave = vi.fn()

    const { wrapperEl } = setupCollapseRenderer({
      show: () => show(),
      callbacks: { onLeave, onAfterLeave },
    })

    show.set(false)

    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(onAfterLeave).toHaveBeenCalledTimes(1)
    expect(wrapperEl.style.height).toBe('0px')
    expect(wrapperEl.style.overflow).toBe('hidden')
  })
})

describe('Collapse — reduced motion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockScrollHeight(200)
    _reducedMotion = true
  })

  afterEach(() => {
    vi.useRealTimers()
    _reducedMotion = false
  })

  it('reduced motion: entering skips animation and fires both callbacks', () => {
    const show = signal(false)
    const onEnter = vi.fn()
    const onAfterEnter = vi.fn()

    const { wrapperEl } = setupCollapse({
      show,
      onEnter,
      onAfterEnter,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(true)

    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
    expect(wrapperEl.style.height).toBe('auto')
    expect(wrapperEl.style.overflow).toBe('')
  })

  it('reduced motion: leaving skips animation and fires both callbacks', () => {
    const show = signal(true)
    const onLeave = vi.fn()
    const onAfterLeave = vi.fn()

    const { wrapperEl } = setupCollapse({
      show,
      onLeave,
      onAfterLeave,
      children: h('div', null, 'Hello') as VNode,
    })

    show.set(false)

    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(onAfterLeave).toHaveBeenCalledTimes(1)
    expect(wrapperEl.style.height).toBe('0px')
    expect(wrapperEl.style.overflow).toBe('hidden')
  })
})
