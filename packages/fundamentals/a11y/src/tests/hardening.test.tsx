/** @jsxImportSource @pyreon/core */
// Regression locks for the 2026-09 @pyreon/a11y hardening pass. Each spec was
// written against the broken code first and bisect-verified (see the PR).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { createRouter, type RouteRecord, RouterProvider, RouterView } from '@pyreon/router'
import { announce, clearAnnouncements } from '../announce'
import { LiveRegion } from '../live-region'
import { RouteAnnouncer } from '../router'
import { SkipLink } from '../skip-link'
import { VisuallyHidden } from '../visually-hidden'

const settle = (ms = 200): Promise<void> => new Promise((r) => setTimeout(r, ms))

function region(politeness: 'polite' | 'assertive') {
  return document.querySelector<HTMLElement>(`[data-pyreon-announcer="${politeness}"]`)
}

let cleanup: Array<() => void> = []
function mountIn(node: unknown): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = mount(node as never, host)
  cleanup.push(() => {
    dispose()
    host.remove()
  })
  return host
}

afterEach(() => {
  for (const c of cleanup.splice(0)) c()
  clearAnnouncements()
  vi.restoreAllMocks()
})

describe('announce()', () => {
  it('two announcements in the same tick are BOTH delivered (joined), not overwritten', async () => {
    announce('Item added')
    announce('Cart total $12')
    await settle()
    expect(region('polite')!.textContent).toBe('Item added Cart total $12')
  })

  it('both regions exist before the first message is written', () => {
    announce('first')
    // A live region inserted and filled in the same moment is often not
    // announced at all — so both are created up front, and the write is
    // deferred until the region has been in the tree for a while.
    expect(region('polite')).not.toBeNull()
    expect(region('assertive')).not.toBeNull()
    expect(region('polite')!.textContent).toBe('')
  })
})

describe('announce() — clearAfter bookkeeping', () => {
  it('a new message cancels the previous clearAfter, and a negative clearAfter never clears', async () => {
    announce('old', { clearAfter: 120 })
    await settle(150)
    announce('new', { clearAfter: -1 })
    await settle(300)
    expect(region('polite')!.textContent).toBe('new')
  })

  it('clearAnnouncements() drops a pending clearAfter timer', async () => {
    announce('x', { clearAfter: 500 })
    await settle(150)
    expect(() => clearAnnouncements()).not.toThrow()
    expect(region('polite')).toBeNull()
  })
})

describe('<LiveRegion> — props stay reactive', () => {
  it('a compiler-reactive (getter) politeness is not frozen at setup', () => {
    const p = signal<'polite' | 'assertive'>('polite')
    const el = mountIn(h(LiveRegion, { politeness: _rp(() => p()) }, 'x')).querySelector('div')!
    p.set('assertive')
    expect(el.getAttribute('aria-live')).toBe('assertive')
  })

  it('politeness / atomic / role accessors update the live region in place', () => {
    const p = signal<'polite' | 'assertive' | 'off'>('polite')
    const atomic = signal(true)
    const el = mountIn(
      <LiveRegion politeness={() => p()} atomic={() => atomic()}>
        status
      </LiveRegion>,
    ).querySelector('div')!
    expect(el.getAttribute('aria-live')).toBe('polite')
    expect(el.getAttribute('role')).toBe('status')
    p.set('assertive')
    expect(el.getAttribute('aria-live')).toBe('assertive')
    expect(el.getAttribute('role')).toBe('alert')
    p.set('off')
    expect(el.getAttribute('role')).toBeNull()
    atomic.set(false)
    expect(el.getAttribute('aria-atomic')).toBe('false')
  })

  it('a reactive `visible` toggles the clipping without remounting', () => {
    const visible = signal(false)
    const el = mountIn(<LiveRegion visible={() => visible()}>x</LiveRegion>).querySelector('div')!
    expect(el.style.position).toBe('absolute')
    visible.set(true)
    expect(el.style.position).toBe('')
  })
})

describe('<VisuallyHidden> — forwarded props stay reactive', () => {
  // `_rp` is what the compiler emits for `class={cls()}` — a getter-backed
  // prop. Destructuring `...rest` fired that getter once at setup.
  it('a compiler-reactive (getter) class is not frozen at setup', () => {
    const cls = signal('a')
    const el = mountIn(h(VisuallyHidden, { class: _rp(() => cls()) }, 'x')).querySelector('span')!
    expect(el.className).toBe('a')
    cls.set('b')
    expect(el.className).toBe('b')
  })
})

describe('<SkipLink>', () => {
  it('prevents the default hash navigation (a hash router would treat #main as a route)', () => {
    const host = mountIn(
      <div>
        <SkipLink href="#main">Skip</SkipLink>
        <main id="main">Main</main>
      </div>,
    )
    const a = host.querySelector('a')!
    const main = host.querySelector('main')!
    main.scrollIntoView = vi.fn()
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    a.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(main)
    expect(main.scrollIntoView).toHaveBeenCalled()
  })

  it('a compiler-reactive (getter) href is not frozen at setup', () => {
    const href = signal('#main')
    const a = mountIn(h(SkipLink, { href: _rp(() => href()) }, 'Skip')).querySelector('a')!
    expect(a.getAttribute('href')).toBe('#main')
    href.set('#content')
    expect(a.getAttribute('href')).toBe('#content')
  })
})

describe('<RouteAnnouncer> next to the router’s built-in announcer', () => {
  it('warns in dev that navigations are announced twice', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const noop = (): null => null
    const routes: RouteRecord[] = [
      { path: '/', component: noop, meta: { title: 'Home' } },
      { path: '/about', component: noop, meta: { title: 'About' } },
    ]
    const router = createRouter({ routes, url: '/' })
    mountIn(
      <RouterProvider router={router}>
        <RouteAnnouncer />
        <RouterView />
      </RouterProvider>,
    )
    await router.push('/about')
    await settle(50)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('announceRouteChanges'))).toBe(true)
  })
})
