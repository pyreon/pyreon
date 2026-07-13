/**
 * Targeted branch/function coverage for the animation-lifecycle arms the
 * existing node suites don't reach: leave-path style/class guards, the
 * `kinetic(tag).<mode>` factory's group branch, GroupRenderer's accessor +
 * leaving-diff arms, the `?? leaveTo : enterFrom` SSR fallback's
 * unmount:false fallbacks, useAnimationEnd's double-`done()` guard, and the
 * collapse appear/leave proxies.
 *
 * Harness mirrors the canonical kinetic node tests (Transition.test.tsx,
 * TransitionItem.test.tsx): a fake rAF queue + wireRef to connect a mock
 * element to the merged ref, then flip the `show` signal and flush
 * rAF/timers. The `watch` effects fire synchronously on signal write, so the
 * lifecycle is fully driveable in happy-dom without a real browser.
 */
import type { VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'

let _reducedMotion = false
vi.mock('../useReducedMotion', () => ({
  useReducedMotion: () => () => _reducedMotion,
}))

import Transition from '../Transition'
import TransitionGroup from '../TransitionGroup'
import Collapse from '../Collapse'
import TransitionItem from '../kinetic/TransitionItem'
import GroupRenderer from '../kinetic/GroupRenderer'
import StaggerRenderer from '../kinetic/StaggerRenderer'
import TransitionRenderer from '../kinetic/TransitionRenderer'
import CollapseRenderer from '../kinetic/CollapseRenderer'
import type { KineticConfig } from '../kinetic/types'
import kinetic from '../kinetic'
import { nextFrame } from '../utils'

let rafCallbacks: (() => void)[] = []
const originalRaf = globalThis.requestAnimationFrame
const originalCaf = globalThis.cancelAnimationFrame

beforeEach(() => {
  vi.useFakeTimers()
  rafCallbacks = []
  _reducedMotion = false
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

/** Wire a mock element to every ref found in a VNode tree. */
const wireRef = (vnode: VNode | null, el: HTMLElement) => {
  if (!vnode) return
  const visit = (node: VNode) => {
    const p = node.props as Record<string, unknown>
    if (typeof p?.ref === 'function') (p.ref as (e: HTMLElement | null) => void)(el)
    else if (p?.ref && typeof p.ref === 'object') (p.ref as { current: HTMLElement | null }).current = el
    const kids = (node.children ? (Array.isArray(node.children) ? node.children : [node.children]) : [])
      .concat(p?.children ? (Array.isArray(p.children) ? p.children : [p.children]) : [])
    for (const c of kids) if (c && typeof c === 'object' && 'type' in (c as object)) visit(c as VNode)
    if (p?.fallback && typeof p.fallback === 'object' && 'type' in (p.fallback as object))
      visit(p.fallback as VNode)
  }
  visit(vnode)
}

const child = () => h('div', { 'data-testid': 'child' }, 'Hello') as VNode

// ─── nextFrame SSR guard (utils.ts) ──────────────────────────────────────

describe('nextFrame — cancel handle', () => {
  it('returns a no-op cancel function when requestAnimationFrame is undefined (SSR path)', () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    const fn = vi.fn()
    const cancel = nextFrame(fn)
    expect(typeof cancel).toBe('function')
    expect(() => cancel()).not.toThrow()
    expect(fn).not.toHaveBeenCalled()
  })

  it('cancels the INNER frame when cancelled after the outer frame already fired', () => {
    const fn = vi.fn()
    const cancel = nextFrame(fn)
    // Outer frame queued (id 1).
    expect(rafCallbacks.length).toBe(1)
    // Run the outer frame → schedules the inner frame (id 2). The callback
    // has NOT fired yet — it runs on the inner frame.
    rafCallbacks[0]?.()
    expect(rafCallbacks.length).toBe(2)
    expect(fn).not.toHaveBeenCalled()
    // Cancel now — a bare cancelAnimationFrame(outerId) would MISS the inner
    // frame (id 2), leaving the stale enter/leave-to commit scheduled.
    cancel()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1) // outer
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2) // inner (the fix)
  })

  it('cancel is a no-op when cancelAnimationFrame is undefined (post-teardown safe)', () => {
    const cancel = nextFrame(vi.fn())
    rafCallbacks[0]?.()
    vi.stubGlobal('cancelAnimationFrame', undefined)
    expect(() => cancel()).not.toThrow()
  })
})

// ─── useAnimationEnd double-done guard ───────────────────────────────────

describe('useAnimationEnd — double done() guard', () => {
  it('ignores a second transitionend after done already fired (called=true arm)', () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()
    const el = document.createElement('div')
    const vnode = Transition({ show, onAfterEnter, children: child() } as any)
    wireRef(vnode, el)

    show.set(true)
    flushRaf()
    flushRaf()
    // First transitionend → done() → onAfterEnter (entering branch)
    fireTransitionEnd(el)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
    // A bubbled/duplicate transitionend on the same element while listeners
    // may still be attached — the `if (called) return` short-circuits. Even
    // if listeners were removed, dispatching again must NOT double-fire.
    fireTransitionEnd(el)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })
})

// ─── Transition / TransitionItem leave-path guards + fallbacks ────────────

describe('Transition — leave path + unmount:false fallback', () => {
  it('leaving with class-only config does not touch style guards', () => {
    const show = signal(true)
    const el = document.createElement('div')
    const vnode = Transition({
      show,
      leave: 't-leave',
      leaveFrom: 't-leave-from',
      leaveTo: 't-leave-to',
      children: child(),
    } as any)
    wireRef(vnode, el)
    show.set(false)
    flushRaf()
    flushRaf()
    expect(el.classList.contains('t-leave')).toBe(true)
    expect(el.classList.contains('t-leave-to')).toBe(true)
  })

  it('initially-visible + unmount:false renders the hidden-display fallback (cond else arm)', () => {
    const show = signal(true)
    const vnode = Transition({
      show,
      unmount: false,
      children: child(),
    } as any)
    // The Show component's fallback prop carries the cloneVNode-with-display:none.
    // Reaching for it via the returned Show vnode props exercises the `unmount
    // ? null : cloneVNode(...)` else arm at construction time.
    expect(vnode).not.toBeNull()
    const showProps = vnode?.props as Record<string, unknown>
    expect(showProps.fallback).toBeTruthy()
    const fb = showProps.fallback as VNode
    const fbStyle = (fb.props as Record<string, unknown>).style as Record<string, unknown>
    expect(fbStyle.display).toBe('none')
  })

  it('child without props → childProps falls back to {} (child?.props ?? {} arm)', () => {
    const show = signal(false)
    // A bare vnode-like with no `props` field → `child?.props` is undefined →
    // the `?? {}` right arm fires. cloneVNode at the end still works because
    // it spreads `...vnode.props` (undefined spreads to nothing).
    const propless = { type: 'div', children: ['x'] } as unknown as VNode
    const vnode = Transition({ show, children: propless } as any)
    expect(vnode).toBeDefined()
  })
})

describe('TransitionItem — leave path + unmount:false fallback + propless child', () => {
  it('initially-visible + unmount:false renders the hidden-display fallback', () => {
    const show = signal(true)
    const vnode = TransitionItem({ show, unmount: false, children: child() } as any)
    const showProps = vnode?.props as Record<string, unknown>
    expect(showProps.fallback).toBeTruthy()
    const fb = showProps.fallback as VNode
    const fbStyle = (fb.props as Record<string, unknown>).style as Record<string, unknown>
    expect(fbStyle.display).toBe('none')
  })

  it('child without props → childProps falls back to {} (child?.props ?? {} arm)', () => {
    const show = signal(false)
    const propless = { type: 'div', children: ['x'] } as unknown as VNode
    const vnode = TransitionItem({ show, children: propless } as any)
    expect(vnode).toBeDefined()
  })
})

// ─── kinetic(tag).<mode> — leave path + group branch + factory ────────────

describe('TransitionRenderer — leave path style guards + unmount:false fallback', () => {
  it('leaving with class-only config skips leaveStyle/leaveTransition/leaveToStyle guards', () => {
    const show = signal(true)
    const el = document.createElement('div')
    const config: KineticConfig = {
      tag: 'div',
      mode: 'transition',
      leave: 'k-leave',
      leaveFrom: 'k-leave-from',
      leaveTo: 'k-leave-to',
    }
    const vnode = TransitionRenderer({
      config,
      htmlProps: {},
      show,
      callbacks: {},
      children: child(),
    })
    wireRef(vnode, el)
    show.set(false)
    expect(el.classList.contains('k-leave')).toBe(true)
    expect(el.classList.contains('k-leave-from')).toBe(true)
    flushRaf()
    flushRaf()
    expect(el.classList.contains('k-leave-to')).toBe(true)
  })

  it('initially-visible + unmount:false renders the hidden-display fallback (cond else arm)', () => {
    const show = signal(true)
    const vnode = TransitionRenderer({
      config: { tag: 'div', mode: 'transition', unmount: false },
      htmlProps: {},
      show,
      callbacks: {},
      children: child(),
    })
    const showProps = vnode?.props as Record<string, unknown>
    expect(showProps.fallback).toBeTruthy()
    const fb = showProps.fallback as VNode
    const fbStyle = (fb.props as Record<string, unknown>).style as Record<string, unknown>
    expect(fbStyle.display).toBe('none')
  })
})

describe('kinetic(tag).group() — factory branch', () => {
  it('routes to GroupRenderer when .group() sets mode', () => {
    const GroupDiv = kinetic('ul').group()
    const a = h('li', { 'data-testid': 'a' }, 'A') as VNode
    const keyedA = { ...a, key: 'a' }
    // The factory's `if (config.mode === 'group')` branch executes and yields
    // a <GroupRenderer/> vnode (the renderer's internals are exercised
    // separately in the GroupRenderer describe block below).
    const vnode = (GroupDiv as any)({ children: [keyedA] }) as VNode
    expect(typeof vnode?.type).toBe('function')
    expect(((vnode as VNode).type as { name?: string }).name).toBe('GroupRenderer')
  })
})

// ─── GroupRenderer / TransitionGroup — accessor + leaving diff arms ───────

const makeKeyed = (key: string | number, text: string): VNode => {
  const v = h('span', { 'data-testid': `c-${key}` }, text) as VNode
  return { ...v, key }
}

const groupConfig = (): KineticConfig => ({
  tag: 'div',
  mode: 'group',
  enter: 'g-enter',
  enterFrom: 'g-enter-from',
  enterTo: 'g-enter-to',
  leave: 'g-leave',
  leaveFrom: 'g-leave-from',
  leaveTo: 'g-leave-to',
})

const unwrap = (val: any): any => {
  let r = val
  while (typeof r === 'function') r = r()
  return r
}

describe('GroupRenderer — accessor children + leaving diff + non-initial appear', () => {
  it('accepts a reactive accessor () => VNode[] and detects a removed child', () => {
    const items = signal<VNode[]>([makeKeyed('a', 'A'), makeKeyed('b', 'B')])
    const vnode = GroupRenderer({
      config: groupConfig(),
      htmlProps: {},
      callbacks: {},
      children: () => items(),
    })
    // First render: both present.
    let result = unwrap(vnode)
    expect(result.children).toHaveLength(2)

    // Remove 'b' → it becomes a leaving child (still rendered during leave).
    items.set([makeKeyed('a', 'A')])
    result = unwrap(vnode)
    // Both the surviving 'a' AND the leaving 'b' are kept.
    expect(result.children.length).toBeGreaterThanOrEqual(2)
  })

  it('a newly-added child is non-initial → appear=true (isInitial ? appear : true else arm)', () => {
    const items = signal<VNode[]>([makeKeyed('a', 'A')])
    const vnode = GroupRenderer({
      config: groupConfig(),
      htmlProps: {},
      callbacks: {},
      children: () => items(),
    })
    unwrap(vnode)
    // Add a NOT-initial key.
    items.set([makeKeyed('a', 'A'), makeKeyed('c', 'C')])
    const result = unwrap(vnode)
    expect(result.children.length).toBe(2)
  })

  it('skips non-VNode entries in getKeyedChildren (isVNode false arm)', () => {
    const dirty = [makeKeyed('a', 'A'), 'not-a-vnode' as unknown as VNode, null as unknown as VNode]
    const vnode = GroupRenderer({
      config: groupConfig(),
      htmlProps: {},
      callbacks: {},
      children: dirty,
    })
    const result = unwrap(vnode)
    // Only the keyed VNode survives.
    expect(result.children.length).toBe(1)
  })
})

/** Flatten a Fragment accessor result to its Transition-entry children. */
const fragEntries = (val: any): VNode[] => {
  const result = unwrap(val)
  const kids = Array.isArray(result.children) ? result.children : [result.children]
  return kids.flat().filter((c: unknown) => c && typeof c === 'object')
}

describe('TransitionGroup — accessor + leaving onAfterLeave + non-VNode skip', () => {
  it('detects leaving + non-initial children and drives onAfterLeave → handleAfterLeave → forceUpdate', () => {
    const items = signal<VNode[]>([makeKeyed('a', 'A'), makeKeyed('b', 'B')])
    const accessor = TransitionGroup({ children: () => items() } as unknown as any) as any
    let entries = fragEntries(accessor)
    expect(entries.length).toBe(2)
    // Each entry carries the `show={() => isShowing}` accessor (@124) — call
    // it to cover that FN, and `onAfterLeave={() => handleAfterLeave(key)}`.
    for (const e of entries) {
      expect(typeof (e.props as any).show).toBe('function')
      ;(e.props as any).show()
    }

    // Drop 'b' (leaving) AND add non-initial 'c' (isInitial ? appear : true
    // else arm).
    items.set([makeKeyed('a', 'A'), makeKeyed('c', 'C')])
    entries = fragEntries(accessor)
    // current a,c + leaving b = 3 entries
    expect(entries.length).toBeGreaterThanOrEqual(3)

    // Invoke the LEAVING child's onAfterLeave → handleAfterLeave (@71) →
    // forceUpdate.update (@74) — the leave-complete bookkeeping.
    const leaving = entries.find((e) => (e.props as any).key === 'b')
    expect(leaving).toBeTruthy()
    ;(leaving!.props as any).onAfterLeave()
    // forceUpdate bumped → a re-render drops the leaving child.
    const after = fragEntries(accessor)
    expect(after.length).toBe(2)
  })

  it('ignores a non-VNode array entry (getKeyedChildren isVNode false arm)', () => {
    // A string / null entry fails isVNode → skipped entirely.
    const dirty = [makeKeyed('a', 'A'), 'not-a-vnode', null] as unknown as VNode[]
    const accessor = TransitionGroup({ children: dirty } as unknown as any) as any
    const entries = fragEntries(accessor)
    expect(entries.length).toBe(1)
  })
})

// ─── StaggerRenderer — single non-array child ────────────────────────────

describe('StaggerRenderer — single non-array child', () => {
  it('wraps a single VNode child (Array.isArray false → [resolved])', () => {
    const solo = h('span', { 'data-testid': 'solo' }, 'S') as VNode
    const vnode = StaggerRenderer({
      config: { tag: 'div', mode: 'stagger', enter: 's-enter' },
      htmlProps: {},
      show: () => true,
      callbacks: {},
      children: solo as unknown as VNode[],
    })
    expect(vnode?.type).toBe('div')
  })
})

// ─── Collapse / CollapseRenderer — appear proxy + leave + onEnd guards ────

/**
 * Wire the wrapper (outer `ref` — a createRef object or appear proxy) AND the
 * inner content ref (on the Show'd `<div ref={contentRef}>`). Returns the
 * wrapper element so the test can drive scrollHeight / inspect style.
 */
const wireCollapse = (vnode: VNode | null, wrapper: HTMLElement, content: HTMLElement) => {
  if (!vnode) return
  const wrapperRef = (vnode.props as Record<string, unknown>).ref
  // Outer wrapper ref: createRef object OR appear proxy ({current} setter).
  if (typeof wrapperRef === 'function') (wrapperRef as (e: HTMLElement | null) => void)(wrapper)
  else if (wrapperRef) (wrapperRef as { current: HTMLElement | null }).current = wrapper

  // Walk the whole tree (node.children AND props.children) and wire every
  // OTHER object ref to the content element — that's the <div ref={contentRef}>.
  const visit = (n: VNode): void => {
    const np = n.props as Record<string, unknown> | undefined
    if (np && typeof np.ref === 'object' && np.ref && np.ref !== wrapperRef) {
      ;(np.ref as { current: HTMLElement | null }).current = content
    }
    const kids = [
      ...(n.children ? (Array.isArray(n.children) ? n.children : [n.children]) : []),
      ...(np?.children ? (Array.isArray(np.children) ? np.children : [np.children]) : []),
    ]
    for (const c of kids) if (c && typeof c === 'object' && 'type' in (c as object)) visit(c as VNode)
  }
  visit(vnode)
}

describe('Collapse — appear proxy ref second-set + null-node arms', () => {
  it('appear=true: re-setting the proxy ref (already-triggered + null node) hits the && false arm', () => {
    const show = signal(true)
    const wrapper = document.createElement('div')
    const content = document.createElement('div')
    Object.defineProperty(content, 'scrollHeight', { value: 50, configurable: true })
    const vnode = Collapse({ show, appear: true, children: child() } as any)
    const wrapperRef = ((vnode as VNode).props as Record<string, unknown>).ref as {
      current: HTMLElement | null
    }
    // First set with a real node → appearTriggered becomes true (`node &&
    // !appearTriggered` TRUE arm).
    wrapperRef.current = wrapper
    // Second set with the SAME node → appearTriggered already true → the
    // `node && !appearTriggered` FALSE arm (right operand false).
    wrapperRef.current = wrapper
    // Set null → `node && ...` FALSE arm (left operand false).
    wrapperRef.current = null
    expect(vnode).toBeDefined()
  })
})

describe('Collapse — SSR render (shouldRender + render-time style ternary)', () => {
  it('show=true SSR renders content with height:auto (entered style ternary arm)', async () => {
    const html = await renderToString(
      h(Collapse, { show: () => true, children: h('div', null, 'visible body') }),
    )
    expect(html).toContain('visible body')
    expect(html).toContain('height: auto')
  })

  it('show=false SSR renders the height:0 hidden wrapper (hidden style ternary arm)', async () => {
    const html = await renderToString(
      h(Collapse, { show: () => false, children: h('div', null, 'hidden body') }),
    )
    expect(html).toContain('overflow: hidden')
    expect(html).toContain('height: 0px')
  })
})

describe('Collapse — show→false no-op + leave cycle', () => {
  it('show flips false while hidden is a no-op (else-if false arm)', () => {
    const show = signal(false)
    const vnode = Collapse({ show, children: child() } as any)
    expect(vnode).toBeDefined()
    // Already hidden — the `else if (!showVal && (entered|entering))` guard is
    // false, so no stage change.
    show.set(false)
    expect(vnode).toBeDefined()
  })

  it('drives a full leave cycle then onEnd (leaving→hidden + onEnd entering-false / leaving arms)', () => {
    const show = signal(true)
    const onAfterLeave = vi.fn()
    const wrapper = document.createElement('div')
    const content = document.createElement('div')
    Object.defineProperty(content, 'scrollHeight', { value: 120, configurable: true })
    const vnode = Collapse({ show, onAfterLeave, children: child() } as any)
    wireCollapse(vnode, wrapper, content)
    show.set(false)
    // Leave drives wrapper height to 0; fire the wrapper's transitionend to
    // complete → onEnd's `else if (stage()==='leaving')` arm → onAfterLeave.
    fireTransitionEnd(wrapper)
    expect(onAfterLeave).toHaveBeenCalledTimes(1)
  })

  it('drives an enter cycle onEnd (onEnd entering arm + wrapper-present)', () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()
    const wrapper = document.createElement('div')
    const content = document.createElement('div')
    Object.defineProperty(content, 'scrollHeight', { value: 60, configurable: true })
    const vnode = Collapse({ show, onAfterEnter, children: child() } as any)
    wireCollapse(vnode, wrapper, content)
    show.set(true)
    fireTransitionEnd(wrapper)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
    expect(wrapper.style.height).toBe('auto')
  })

  it('onEnd entering with a cleared wrapper ref hits the `if (wrapper)` false arm', () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()
    const wrapper = document.createElement('div')
    const content = document.createElement('div')
    Object.defineProperty(content, 'scrollHeight', { value: 60, configurable: true })
    const vnode = Collapse({ show, onAfterEnter, children: child() } as any)
    const wrapperRef = ((vnode as VNode).props as Record<string, unknown>).ref as {
      current: HTMLElement | null
    }
    wireCollapse(vnode, wrapper, content)
    // Enter — useAnimationEnd attaches its transitionend listener to `wrapper`.
    show.set(true)
    // The element is detached from the ref mid-animation (ref nulled). The
    // transitionend listener is still bound to the original element object, so
    // firing it drives onEnd, but `wrapperRef.current` now reads null →
    // the `if (wrapper)` guard's false arm.
    wrapperRef.current = null
    fireTransitionEnd(wrapper)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })
})

describe('CollapseRenderer — appear proxy + leave + enter onEnd', () => {
  it('appear=true: proxy ref triggers entering on connect, then re-set/null hit the && false arms', async () => {
    const show = signal(true)
    const wrapper = document.createElement('div')
    const content = document.createElement('div')
    Object.defineProperty(content, 'scrollHeight', { value: 80, configurable: true })
    const vnode = CollapseRenderer({
      config: { tag: 'div', mode: 'collapse' },
      htmlProps: {},
      show,
      appear: true,
      callbacks: {},
      children: child(),
    })
    const wrapperRef = ((vnode as VNode).props as Record<string, unknown>).ref as {
      current: HTMLElement | null
    }
    // First connect — `node && !appearTriggered` TRUE → queueMicrotask.
    wrapperRef.current = wrapper
    // Re-set (appearTriggered now true) → right operand false arm.
    wrapperRef.current = wrapper
    // Null node → left operand false arm.
    wrapperRef.current = null
    // queueMicrotask(() => stage.set('entering')) runs on the next microtask.
    await Promise.resolve()
    await Promise.resolve()
    expect(vnode).toBeDefined()
  })

  it('SSR render covers shouldRender + the render-time style ternary (show=true/false)', async () => {
    const VisibleCollapse = kinetic('div').collapse()
    const visible = await renderToString(
      h(VisibleCollapse, { show: () => true }, h('div', null, 'shown')),
    )
    expect(visible).toContain('shown')
    expect(visible).toContain('height: auto')

    const HiddenCollapse = kinetic('section').collapse()
    const hidden = await renderToString(
      h(HiddenCollapse, { show: () => false }, h('div', null, 'still-present')),
    )
    // Initially-hidden Collapse keeps content structural (SSR) under a 0-height
    // overflow-hidden wrapper.
    expect(hidden).toContain('still-present')
    expect(hidden).toContain('height: 0px')
  })

  it('drives a full enter cycle onEnd (wrapper-present + entering arm)', () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()
    const wrapper = document.createElement('div')
    const content = document.createElement('div')
    Object.defineProperty(content, 'scrollHeight', { value: 100, configurable: true })
    const vnode = CollapseRenderer({
      config: { tag: 'div', mode: 'collapse' },
      htmlProps: {},
      show,
      callbacks: { onAfterEnter },
      children: child(),
    })
    wireCollapse(vnode, wrapper, content)
    show.set(true)
    fireTransitionEnd(wrapper)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
    expect(wrapper.style.height).toBe('auto')
  })

  it('onEnd entering with a cleared wrapper ref hits the `if (wrapper)` false arm', () => {
    const show = signal(false)
    const onAfterEnter = vi.fn()
    const wrapper = document.createElement('div')
    const content = document.createElement('div')
    Object.defineProperty(content, 'scrollHeight', { value: 100, configurable: true })
    const vnode = CollapseRenderer({
      config: { tag: 'div', mode: 'collapse' },
      htmlProps: {},
      show,
      callbacks: { onAfterEnter },
      children: child(),
    })
    const wrapperRef = ((vnode as VNode).props as Record<string, unknown>).ref as {
      current: HTMLElement | null
    }
    wireCollapse(vnode, wrapper, content)
    show.set(true)
    // Ref cleared mid-animation → onEnd reads null wrapper → `if (wrapper)` false.
    wrapperRef.current = null
    fireTransitionEnd(wrapper)
    expect(onAfterEnter).toHaveBeenCalledTimes(1)
  })

  it('drives a full leave cycle onEnd (leaving arm + entered-style ternary)', () => {
    const show = signal(true)
    const onAfterLeave = vi.fn()
    const wrapper = document.createElement('div')
    const content = document.createElement('div')
    Object.defineProperty(content, 'scrollHeight', { value: 100, configurable: true })
    const vnode = CollapseRenderer({
      config: { tag: 'div', mode: 'collapse' },
      htmlProps: {},
      show,
      callbacks: { onAfterLeave },
      children: child(),
    })
    wireCollapse(vnode, wrapper, content)
    show.set(false)
    fireTransitionEnd(wrapper)
    expect(onAfterLeave).toHaveBeenCalledTimes(1)
  })

  it('show flips false while hidden is a no-op (else-if false arm)', () => {
    const show = signal(false)
    const vnode = CollapseRenderer({
      config: { tag: 'div', mode: 'collapse' },
      htmlProps: {},
      show,
      callbacks: {},
      children: child(),
    })
    expect(vnode).toBeDefined()
    show.set(false)
    expect(vnode).toBeDefined()
  })
})
