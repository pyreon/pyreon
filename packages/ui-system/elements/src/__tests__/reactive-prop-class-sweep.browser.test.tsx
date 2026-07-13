/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for the reactive-prop FREEZE class sweep (the 0.43.x
 * follow-up to the Text.label fix). Everything here is DOM-observable
 * behavior happy-dom cannot prove:
 *
 *  - COMPUTED styles actually change when a signal-driven layout/css prop
 *    flips (the styler class swap resolves through a real CSSOM).
 *  - The Overlay trigger keeps its element identity + FOCUS across
 *    open/close (the focus-restore contract that ruled out re-rendering the
 *    trigger per flip), with real click/keyboard events.
 *
 * Every spec uses the `_rp()` GETTER form — what the compiler emits for
 * `prop={signal()}` — NOT the accessor form, which was never broken.
 */
import { _rp, h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { Element } from '../Element'
import { List } from '../List'
import { Overlay } from '../Overlay'
import { Portal } from '../Portal'
import { Text } from '../Text'

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

describe('Element — reactive layout props re-style the SAME element', () => {
  it('contentAlignX flip changes computed align-items without remount', async () => {
    const ax = signal<'left' | 'center'>('left')
    const { container } = mountInBrowser(
      h(Element, {
        'data-testid': 'el-align',
        contentAlignX: _rp(() => ax()),
        children: 'aligned',
      }),
    )
    await flush()
    const el = container.querySelector('[data-testid="el-align"]') as HTMLElement
    expect(el).not.toBeNull()
    expect(getComputedStyle(el).alignItems).toBe('flex-start')

    ax.set('center')
    await flush()
    expect(container.querySelector('[data-testid="el-align"]')).toBe(el)
    expect(getComputedStyle(el).alignItems).toBe('center')
  })

  it('getter-shaped beforeContent appears on flip (slot existence)', async () => {
    const show = signal(false)
    const { container } = mountInBrowser(
      h(Element, {
        'data-testid': 'el-slots',
        beforeContent: _rp(() => (show() ? 'ICON' : null)),
        children: 'body',
      }),
    )
    await flush()
    expect(container.textContent).not.toContain('ICON')
    expect(container.textContent).toContain('body')

    show.set(true)
    await flush()
    expect(container.textContent).toContain('ICON')
    expect(container.textContent).toContain('body')
  })
})

describe('Portal — getter-shaped children render live into the wrapper', () => {
  it('a reactive children PROP updates the portaled text in place', async () => {
    const value = signal('p-1')
    const { unmount } = mountInBrowser(
      h(Portal as never, {
        // `children={sig()}` compiles to `_rp(() => sig())` → a getter after
        // makeReactiveProps. Portal's `hasGetterProps(props, ['children'])`
        // gate must wrap it in an accessor so it re-reads on change; an eager
        // `props.children` read would freeze it at 'p-1'.
        children: _rp(() => h('span', { 'data-testid': 'portal-child' }, value())),
      }),
    )
    await flush()
    const child = document.querySelector('[data-testid="portal-child"]') as HTMLElement
    expect(child, 'portal child should render into the wrapper').not.toBeNull()
    expect(child.textContent).toBe('p-1')

    value.set('p-2')
    await flush()
    expect(document.querySelector('[data-testid="portal-child"]')?.textContent).toBe('p-2')
    unmount()
  })
})

describe('Text — reactive css changes computed style on the SAME element', () => {
  it('color flips with the css signal', async () => {
    const c = signal('color: rgb(10, 20, 30);')
    const { container } = mountInBrowser(
      h(Text, {
        tag: 'span',
        'data-testid': 'txt-css',
        css: _rp(() => c()),
        children: 'styled',
      }),
    )
    await flush()
    const el = container.querySelector('[data-testid="txt-css"]') as HTMLElement
    expect(getComputedStyle(el).color).toBe('rgb(10, 20, 30)')

    c.set('color: rgb(30, 20, 10);')
    await flush()
    expect(container.querySelector('[data-testid="txt-css"]')).toBe(el)
    expect(getComputedStyle(el).color).toBe('rgb(30, 20, 10)')
  })
})

describe('List — reactive data re-renders rows in a real browser', () => {
  it('adds/removes rows on a data signal flip', async () => {
    const items = signal(['alpha', 'beta'])
    const Row = (p: { children?: VNodeChild }) => h('li', { class: 'row' }, p.children as never)
    const { container } = mountInBrowser(
      h(List as never, {
        data: _rp(() => items()),
        component: Row,
        valueName: 'children',
      }),
    )
    await flush()
    expect(container.querySelectorAll('li.row').length).toBe(2)

    items.set(['alpha', 'beta', 'gamma'])
    await flush()
    expect(container.querySelectorAll('li.row').length).toBe(3)
    expect(container.textContent).toContain('gamma')

    items.set(['gamma'])
    await flush()
    expect(container.querySelectorAll('li.row').length).toBe(1)
    expect(container.textContent).not.toContain('alpha')
  })
})

describe('Overlay — live trigger aria-expanded + intact focus restore', () => {
  it('real click opens (aria-expanded flips true on the SAME button), ESC restores focus to the trigger', async () => {
    const { container } = mountInBrowser(
      h(Overlay as never, {
        // click-driven open, ESC close (closeOnEsc defaults true)
        openOn: 'click',
        closeOn: 'clickOutsideContent',
        trigger: (p: Record<string, unknown>) =>
          h(
            'button',
            {
              ref: p.ref,
              'data-testid': 'ov-trigger',
              // The real compiler wraps prop reads in accessors — mirrored
              // here so the getter-backed prop binds reactively.
              'aria-expanded': () => p['aria-expanded'],
            },
            'menu',
          ),
        children: (p: Record<string, unknown>) =>
          h('div', { ref: p.ref, 'data-testid': 'ov-menu' }, 'menu body'),
      }),
    )
    await flush()
    const btn = container.querySelector('[data-testid="ov-trigger"]') as HTMLButtonElement
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('aria-expanded')).toBe('false')

    btn.focus()
    btn.click()
    await flush()
    await raf()

    // SAME element (no trigger remount — load-bearing for focus restore),
    // told the truth about the popup state.
    expect(container.querySelector('[data-testid="ov-trigger"]')).toBe(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('[data-testid="ov-menu"]')).not.toBeNull()
    // Focus survived the open (the pre-fix alternative — re-rendering the
    // trigger per flip — would have detached the focused element).
    expect(document.activeElement).toBe(btn)

    // ESC closes; useOverlay's hideContent restores focus to the trigger.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    await raf()
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[data-testid="ov-menu"]')).toBeNull()
    expect(document.activeElement).toBe(btn)
  })

  it('getter-shaped disabled gates clicks live (re-enables without remount)', async () => {
    const busy = signal(true)
    const { container } = mountInBrowser(
      h(Overlay as never, {
        openOn: 'click',
        closeOn: 'clickOutsideContent',
        disabled: _rp(() => busy()),
        trigger: (p: Record<string, unknown>) =>
          h('button', { ref: p.ref, 'data-testid': 'dis-trigger' }, 'menu'),
        children: (p: Record<string, unknown>) =>
          h('div', { ref: p.ref, 'data-testid': 'dis-menu' }, 'menu body'),
      }),
    )
    await flush()
    const btn = container.querySelector('[data-testid="dis-trigger"]') as HTMLButtonElement

    btn.click()
    await flush()
    expect(document.querySelector('[data-testid="dis-menu"]'), 'disabled click must not open').toBeNull()

    busy.set(false)
    btn.click()
    await flush()
    expect(
      document.querySelector('[data-testid="dis-menu"]'),
      're-enabled click must open',
    ).not.toBeNull()
  })
})
