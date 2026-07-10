/** @jsxImportSource @pyreon/core */
/**
 * Regression suite for the reactive-prop FREEZE class in `@pyreon/elements`
 * (the 0.43.x sweep — the Text.label fix's siblings).
 *
 * BUG SHAPE (all instances): the compiler emits `prop={sig()}` as
 * `_rp(() => sig())`; `makeReactiveProps` (mount pipeline) converts the brand
 * into a property GETTER. An EAGER read — a body/parameter destructure, a
 * plain object-literal value read, or an esbuild JSX spread — fires the
 * getter ONCE and freezes the prop at its first value forever.
 *
 * Every spec uses the `_rp()` GETTER form (what the compiler actually emits)
 * — NOT the accessor form `prop={() => sig()}`, which was never broken.
 *
 * Per-instance bisect notes live in the PR description; each describe block
 * names the source site it locks.
 */
import type { VNode, VNodeChild } from '@pyreon/core'
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { Element } from '../Element'
import Iterator from '../helpers/Iterator'
import Wrapper from '../helpers/Wrapper/component'
import { List } from '../List'
import { Overlay, useOverlay } from '../Overlay'
import { Portal } from '../Portal'
import { Text } from '../Text'
import { Util } from '../Util'
import { definePropsFromAccessors, hasGetterProps } from '../utils'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

let cleanups: (() => void)[] = []
const mountInDom = (vnode: VNode) => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(vnode, root)
  cleanups.push(() => {
    dispose()
    root.remove()
  })
  return root
}

afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
  document.body.style.overflow = ''
})

// ─── shared utils ───────────────────────────────────────────────────────────

describe('utils — hasGetterProps / definePropsFromAccessors', () => {
  it('hasGetterProps detects getter-shaped keys and ignores data props', () => {
    const obj: Record<string, unknown> = { a: 1 }
    Object.defineProperty(obj, 'b', { get: () => 2, enumerable: true, configurable: true })
    expect(hasGetterProps(obj, ['a'])).toBe(false)
    expect(hasGetterProps(obj, ['b'])).toBe(true)
    expect(hasGetterProps(obj, ['a', 'b'])).toBe(true)
    expect(hasGetterProps(obj, ['missing'])).toBe(false)
  })

  it('definePropsFromAccessors builds live enumerable getters (with and without base)', () => {
    const s = signal(1)
    const noBase = definePropsFromAccessors({ x: () => s() })
    const withBase = definePropsFromAccessors({ x: () => s() }, { y: 'static' })
    expect(noBase.x).toBe(1)
    expect(withBase.x).toBe(1)
    expect(withBase.y).toBe('static')
    s.set(2)
    expect(noBase.x).toBe(2)
    expect(withBase.x).toBe(2)
    // enumerable + configurable (mergeProps must be able to redefine)
    expect(Object.keys(withBase).sort()).toEqual(['x', 'y'])
    expect(Object.getOwnPropertyDescriptor(withBase, 'x')?.configurable).toBe(true)
  })
})

// ─── Instance 1: List — JSX spreads → h(…, descriptor-preserving props) ─────

describe('List — reactive props survive the pick/omit forwarding (was JSX spread)', () => {
  it('forwards a reactive HTML prop through omit→Element when rootElement is set', async () => {
    const title = signal('one')
    const root = mountInDom(
      h(List as never, {
        rootElement: true,
        data: ['a'],
        component: (p: { children?: VNodeChild }) => h('span', null, p.children as never),
        valueName: 'children',
        title: _rp(() => title()),
        'data-testid': 'list-root',
      }) as VNode,
    )
    await flush()
    const el = root.querySelector('[data-testid="list-root"]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.getAttribute('title')).toBe('one')

    title.set('two')
    await flush()
    expect(el.getAttribute('title')).toBe('two')
  })

  it('forwards reactive data through pick→Iterator (rows update on signal flip)', async () => {
    const items = signal(['a', 'b'])
    const Row = (p: { children?: VNodeChild }) => h('li', { class: 'row' }, p.children as never)
    const root = mountInDom(
      h(List as never, {
        data: _rp(() => items()),
        component: Row,
        valueName: 'children',
      }) as VNode,
    )
    await flush()
    expect(root.querySelectorAll('li.row').length).toBe(2)
    expect(root.textContent).toContain('a')

    items.set(['a', 'b', 'c'])
    await flush()
    expect(root.querySelectorAll('li.row').length).toBe(3)
    expect(root.textContent).toContain('c')
  })
})

// ─── Instance 2: Iterator — reactive body (was one-shot + body destructure) ─

describe('Iterator — reactive data / itemProps / children (was frozen one-shot)', () => {
  it('re-renders rows when a getter-shaped data prop flips', async () => {
    const items = signal([
      { id: 1, name: 'first' },
      { id: 2, name: 'second' },
    ])
    const Row = (p: { name?: string }) => h('li', { 'data-row': p.name }, p.name)
    const root = mountInDom(
      h(Iterator as never, {
        data: _rp(() => items()),
        component: Row,
      }) as VNode,
    )
    await flush()
    expect(root.querySelectorAll('li').length).toBe(2)
    expect(root.querySelector('[data-row="first"]')).not.toBeNull()

    items.set([{ id: 3, name: 'third' }])
    await flush()
    expect(root.querySelectorAll('li').length).toBe(1)
    expect(root.querySelector('[data-row="third"]')).not.toBeNull()
    expect(root.querySelector('[data-row="first"]')).toBeNull()
  })

  it('re-fires a getter-shaped itemProps injector on flip', async () => {
    const tone = signal('warm')
    const Row = (p: { children?: VNodeChild; 'data-tone'?: string }) =>
      h('li', { 'data-tone': p['data-tone'] }, p.children as never)
    const root = mountInDom(
      h(Iterator as never, {
        data: ['x'],
        valueName: 'children',
        component: Row,
        itemProps: _rp(() => ({ 'data-tone': tone() })),
      }) as VNode,
    )
    await flush()
    expect(root.querySelector('li')?.getAttribute('data-tone')).toBe('warm')

    tone.set('cool')
    await flush()
    expect(root.querySelector('li')?.getAttribute('data-tone')).toBe('cool')
  })

  it('re-renders when a function-valued children thunk reads a signal', async () => {
    const flag = signal(false)
    const root = mountInDom(
      h(Iterator as never, {
        children: (() =>
          flag()
            ? [h('i', { 'data-id': 'on' }, 'on')]
            : [h('b', { 'data-id': 'off' }, 'off')]) as unknown as VNodeChild,
      }) as VNode,
    )
    await flush()
    expect(root.querySelector('[data-id="off"]')).not.toBeNull()

    flag.set(true)
    await flush()
    expect(root.querySelector('[data-id="on"]')).not.toBeNull()
    expect(root.querySelector('[data-id="off"]')).toBeNull()
  })

  it('static path — plain data renders once and stays correct (control)', async () => {
    const Row = (p: { children?: VNodeChild }) => h('li', null, p.children as never)
    const root = mountInDom(
      h(Iterator as never, {
        data: ['a', 'b'],
        valueName: 'children',
        component: Row,
      }) as VNode,
    )
    await flush()
    expect(root.querySelectorAll('li').length).toBe(2)
  })
})

// ─── Instance 3: Overlay trigger — live active/aria-expanded, no remount ────

describe('Overlay — trigger receives LIVE active/aria-expanded without remount', () => {
  it('flips aria-expanded + active on the SAME trigger element across open/close', async () => {
    let show!: () => void
    let hide!: () => void
    // The trigger forwards the getter-backed props through ACCESSORS — the
    // shape the real compiler emits for `<button aria-expanded={props[…]}>`.
    const Trigger = (p: Record<string, unknown>) => {
      show = p.showContent as () => void
      hide = p.hideContent as () => void
      return h(
        'button',
        {
          ref: p.ref,
          'data-testid': 'ov-trigger',
          'aria-expanded': () => p['aria-expanded'],
        },
        () => ((p as { active?: boolean }).active ? 'open' : 'closed'),
      )
    }
    const root = mountInDom(
      h(Overlay as never, {
        openOn: 'manual',
        closeOn: 'manual',
        trigger: Trigger,
        children: (p: Record<string, unknown>) =>
          h('div', { ref: p.ref, 'data-testid': 'ov-content' }, 'content'),
      }) as VNode,
    )
    await flush()
    const btn = root.querySelector('[data-testid="ov-trigger"]') as HTMLButtonElement
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.textContent).toBe('closed')

    show()
    await flush()
    const btnAfter = root.querySelector('[data-testid="ov-trigger"]') as HTMLButtonElement
    // Identity preserved — the trigger was NOT remounted (load-bearing for
    // the focus-restore contract in useOverlay.hideContent).
    expect(btnAfter).toBe(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(btn.textContent).toBe('open')
    expect(document.querySelector('[data-testid="ov-content"]')).not.toBeNull()

    hide()
    await flush()
    expect(root.querySelector('[data-testid="ov-trigger"]')).toBe(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.textContent).toBe('closed')
  })
})

// ─── Instance 4: useOverlay — live `disabled` (was parameter-destructured) ──

describe('useOverlay — getter-shaped `disabled` is re-read per event', () => {
  it('ignores clicks while disabled, honors them after the signal flips', async () => {
    const busy = signal(true)
    const props = definePropsFromAccessors(
      { disabled: () => busy() },
      { openOn: 'click', closeOn: 'manual' },
    )
    const o = useOverlay(props as never)

    const btn = document.createElement('button')
    document.body.appendChild(btn)
    cleanups.push(() => btn.remove())
    o.triggerRef(btn)
    const cleanup = o.setupListeners()
    cleanups.push(cleanup)

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(o.active(), 'click while disabled must not open').toBe(false)

    busy.set(false)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(o.active(), 'click after re-enable must open').toBe(true)
  })

  it('align accessor stays live for a getter-shaped align prop', () => {
    const a = signal<'top' | 'bottom'>('top')
    const props = definePropsFromAccessors({ align: () => a() })
    const o = useOverlay(props as never)
    expect(o.align()).toBe('top')
    a.set('bottom')
    expect(o.align()).toBe('bottom')
  })
})

// ─── Instance 5: Util — reactive className/style (was param destructure) ────

describe('Util — reactive className / style (was one-shot destructure)', () => {
  it('re-injects a getter-shaped className on flip', async () => {
    const cls = signal('a')
    const Child = (p: { className?: string }) =>
      h('div', { 'data-testid': 'util-child', class: p.className }, 'x')
    const root = mountInDom(
      h(Util as never, {
        className: _rp(() => cls()),
        children: Child,
      }) as VNode,
    )
    await flush()
    expect(root.querySelector('[data-testid="util-child"]')?.className).toBe('a')

    cls.set('b')
    await flush()
    expect(root.querySelector('[data-testid="util-child"]')?.className).toBe('b')
  })

  it('static path — plain className renders unchanged (control)', async () => {
    const Child = (p: { className?: string }) =>
      h('div', { 'data-testid': 'util-static', class: p.className }, 'x')
    const root = mountInDom(h(Util as never, { className: ['a', 'b'], children: Child }) as VNode)
    await flush()
    expect(root.querySelector('[data-testid="util-static"]')?.className).toBe('a b')
  })
})

// ─── Instance 6: Text — reactive `css` via the styler's $text accessor axis ─

describe('Text — reactive css re-resolves the injected class (no remount)', () => {
  it('swaps the class on the SAME element when the css signal flips', async () => {
    const c = signal('color: rgb(1, 2, 3);')
    const root = mountInDom(
      h(Text, {
        tag: 'span',
        'data-testid': 'txt-css',
        css: _rp(() => c()),
        children: 'styled',
      }) as VNode,
    )
    await flush()
    const el = root.querySelector('[data-testid="txt-css"]') as HTMLElement
    expect(el).not.toBeNull()
    const before = el.className
    expect(before).not.toBe('')

    c.set('color: rgb(9, 9, 9);')
    await flush()
    expect(root.querySelector('[data-testid="txt-css"]')).toBe(el)
    expect(el.className).not.toBe(before)
  })
})

// ─── Instance 7: Wrapper / Portal — defensive getter-shaped children ────────

describe('Wrapper / Portal — getter-shaped children stay live', () => {
  it('Wrapper re-renders a getter-shaped children prop', async () => {
    const txt = signal('one')
    const root = mountInDom(
      h(Wrapper as never, {
        tag: 'div',
        'data-testid': 'wrap-kids',
        children: _rp(() => txt()),
      }) as VNode,
    )
    await flush()
    const el = root.querySelector('[data-testid="wrap-kids"]') as HTMLElement
    expect(el.textContent).toBe('one')

    txt.set('two')
    await flush()
    expect(el.textContent).toBe('two')
  })

  it('Wrapper static children (incl. accessor-valued) keep the non-wrapped path', async () => {
    const txt = signal('a')
    // Accessor-valued children (what Element passes) — already live by
    // construction; the gate must NOT double-wrap them.
    const root = mountInDom(
      h(Wrapper as never, {
        tag: 'div',
        'data-testid': 'wrap-accessor',
        children: () => txt(),
      }) as VNode,
    )
    await flush()
    const el = root.querySelector('[data-testid="wrap-accessor"]') as HTMLElement
    expect(el.textContent).toBe('a')
    txt.set('b')
    await flush()
    expect(el.textContent).toBe('b')
  })

  it('Portal re-renders a getter-shaped children prop inside its wrapper', async () => {
    const txt = signal('p-one')
    mountInDom(
      h(Portal as never, {
        children: _rp(() => h('span', { 'data-testid': 'portal-kid' }, txt())),
      }) as VNode,
    )
    await flush()
    const el = document.querySelector('[data-testid="portal-kid"]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.textContent).toBe('p-one')

    txt.set('p-two')
    await flush()
    expect(document.querySelector('[data-testid="portal-kid"]')?.textContent).toBe('p-two')
  })
})

// ─── Instance 8: Element — reactive layout props + slot existence ───────────

describe('Element — reactive layout props (class swap, same element)', () => {
  it('simple fast path: contentAlignX flip re-resolves the class, identity preserved', async () => {
    const ax = signal<'left' | 'center'>('left')
    const root = mountInDom(
      h(Element, {
        'data-testid': 'el-align',
        contentAlignX: _rp(() => ax()),
        children: 'x',
      }) as VNode,
    )
    await flush()
    const el = root.querySelector('[data-testid="el-align"]') as HTMLElement
    expect(el).not.toBeNull()
    const before = el.className
    expect(before).not.toBe('')

    ax.set('center')
    await flush()
    expect(root.querySelector('[data-testid="el-align"]')).toBe(el)
    expect(el.className, 'alignX flip must produce a different resolved class').not.toBe(before)
  })

  it('void-tag path (shouldBeEmpty): reactive block re-resolves through Wrapper', async () => {
    const block = signal(false)
    const root = mountInDom(
      h(Element, {
        tag: 'input',
        'data-testid': 'el-void',
        block: _rp(() => block()),
      }) as VNode,
    )
    await flush()
    const el = root.querySelector('[data-testid="el-void"]') as HTMLElement
    const before = el.className

    block.set(true)
    await flush()
    expect(root.querySelector('[data-testid="el-void"]')).toBe(el)
    expect(el.className).not.toBe(before)
  })

  it('needsFix path (tag=button): reactive block re-resolves the outer class', async () => {
    const block = signal(false)
    const root = mountInDom(
      h(Element, {
        tag: 'button',
        'data-testid': 'el-fix',
        block: _rp(() => block()),
        children: 'b',
      }) as VNode,
    )
    await flush()
    const el = root.querySelector('[data-testid="el-fix"]') as HTMLElement
    const before = el.className

    block.set(true)
    await flush()
    expect(root.querySelector('[data-testid="el-fix"]')).toBe(el)
    expect(el.className).not.toBe(before)
  })

  it('compound path: reactive contentAlignX threads into the Content slot', async () => {
    const ax = signal<'left' | 'center'>('left')
    const root = mountInDom(
      h(Element, {
        'data-testid': 'el-compound',
        beforeContent: 'B',
        contentAlignX: _rp(() => ax()),
        children: 'x',
      }) as VNode,
    )
    await flush()
    const content = root.querySelector('[data-pyr-element="content"]') as HTMLElement
    expect(content).not.toBeNull()
    const before = content.className

    ax.set('center')
    await flush()
    expect(root.querySelector('[data-pyr-element="content"]')).toBe(content)
    expect(content.className).not.toBe(before)
  })

  it('slot existence: getter-shaped beforeContent appears/disappears on flip', async () => {
    const show = signal(false)
    const root = mountInDom(
      h(Element, {
        'data-testid': 'el-slots',
        beforeContent: _rp(() => (show() ? 'B' : null)),
        children: 'body',
      }) as VNode,
    )
    await flush()
    expect(root.querySelector('[data-pyr-element="before"]')).toBeNull()
    expect(root.textContent).toContain('body')

    show.set(true)
    await flush()
    const before = root.querySelector('[data-pyr-element="before"]') as HTMLElement
    expect(before, 'beforeContent slot must appear when the signal flips true').not.toBeNull()
    expect(before.textContent).toBe('B')
    expect(root.textContent).toContain('body')

    show.set(false)
    await flush()
    expect(root.querySelector('[data-pyr-element="before"]')).toBeNull()
    expect(root.textContent).toContain('body')
  })

  it('static control: plain layout props keep the interned one-shot path', async () => {
    const root = mountInDom(
      h(Element, {
        'data-testid': 'el-static',
        contentAlignX: 'center',
        children: 'x',
      }) as VNode,
    )
    await flush()
    const el = root.querySelector('[data-testid="el-static"]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.className).not.toBe('')
  })
})
