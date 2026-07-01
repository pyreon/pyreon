/**
 * @vitest-environment happy-dom
 *
 * `<Link>` (and `useLink`) automatic external-link detection + overrides,
 * exercised through a real `mount()` so the rendered `<a>` attributes and the
 * click navigation path are the actual JSX wiring — not a re-implementation.
 *
 * The router's own `classifyHref` classification contract is proved in real
 * Chromium in `@pyreon/router`; this asserts zero's `createLink`/`useLink`
 * WIRES that result into `<a target>` / `<a rel>` / `href` + `router.push`.
 */
import { h } from '@pyreon/core'
import type { LinkConfig } from '@pyreon/router'
import { createRouter, RouterProvider } from '@pyreon/router'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Link } from '../link'

const routes = [
  { path: '/', component: () => h('div', { id: 'home' }, 'home') },
  { path: '/about', component: () => h('div', { id: 'about' }, 'about') },
]

let host: HTMLElement
let stopNav: ((e: MouseEvent) => void) | null = null

beforeEach(() => {
  window.location.hash = ''
  host = document.createElement('div')
  document.body.appendChild(host)
  // Prevent a real navigation only for EXTERNAL (absolute / protocol-relative)
  // anchors — internal `/about` clicks stay on-page and must reach `<Link>`'s
  // delegated handler with `defaultPrevented === false`.
  stopNav = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.('a')
    const href = a?.getAttribute('href') ?? ''
    if (/^(https?:|\/\/)/i.test(href)) e.preventDefault()
  }
  document.addEventListener('click', stopNav, true)
})
afterEach(() => {
  if (stopNav) document.removeEventListener('click', stopNav, true)
  stopNav = null
  host.remove()
  window.location.hash = ''
})

function mountLink(props: Record<string, unknown>, links?: LinkConfig) {
  const router = createRouter({ routes, mode: 'hash', ...(links ? { links } : {}) })
  mount(h(RouterProvider, { router }, h(Link, { ...props }, 'go')), host)
  const anchor = () => host.querySelector<HTMLAnchorElement>('a')!
  return { router, anchor }
}

describe('<Link> external-link detection', () => {
  it('external http(s) → target=_blank + secure rel, href verbatim', () => {
    const { anchor } = mountLink({ href: 'https://example.com/docs' })
    const a = anchor()
    expect(a.getAttribute('href')).toBe('https://example.com/docs')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('protocol-relative //host → external new-tab', () => {
    const a = mountLink({ href: '//cdn.example.com/x' }).anchor()
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('internal path → no target/rel', () => {
    const a = mountLink({ href: '/about' }).anchor()
    expect(a.getAttribute('href')).toBe('/about')
    expect(a.getAttribute('target')).toBeNull()
    expect(a.getAttribute('rel')).toBeNull()
  })

  it('mailto: → plain <a>, no target', () => {
    const a = mountLink({ href: 'mailto:hi@example.com' }).anchor()
    expect(a.getAttribute('href')).toBe('mailto:hi@example.com')
    expect(a.getAttribute('target')).toBeNull()
  })
})

describe('<Link> config + overrides', () => {
  it('externalNewTab:false → external link has no target/rel', () => {
    const a = mountLink({ href: 'https://example.com' }, { externalNewTab: false }).anchor()
    expect(a.getAttribute('target')).toBeNull()
    expect(a.getAttribute('rel')).toBeNull()
  })

  it('externalRel override applied', () => {
    const a = mountLink({ href: 'https://example.com' }, { externalRel: 'noopener' }).anchor()
    expect(a.getAttribute('rel')).toBe('noopener')
  })

  it('external={false} forces a cross-origin URL internal (no target)', () => {
    const a = mountLink({ href: 'https://other.example.com/x', external: false }).anchor()
    expect(a.getAttribute('target')).toBeNull()
  })

  it('external={true} forces an internal path into a new-tab external link', () => {
    const a = mountLink({ href: '/about', external: true }).anchor()
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('target override wins; rel not auto-applied for _self', () => {
    const a = mountLink({ href: 'https://example.com', target: '_self' }).anchor()
    expect(a.getAttribute('target')).toBe('_self')
    expect(a.getAttribute('rel')).toBeNull()
  })

  it('rel override wins over the secure default', () => {
    const a = mountLink({ href: 'https://example.com', rel: 'sponsored' }).anchor()
    expect(a.getAttribute('rel')).toBe('sponsored')
  })
})

describe('<Link> navigation vs full-load', () => {
  // Spy on `router.push` so the assertion is the handler's DECISION (intercept
  // vs not), independent of happy-dom's async hashchange resolution.
  function mountWithPushSpy(props: Record<string, unknown>) {
    const router = createRouter({ routes, mode: 'hash' })
    const pushed: string[] = []
    const origPush = router.push.bind(router)
    router.push = (p: string) => {
      pushed.push(p)
      return origPush(p)
    }
    mount(h(RouterProvider, { router }, h(Link, { ...props }, 'go')), host)
    return { anchor: () => host.querySelector<HTMLAnchorElement>('a')!, pushed }
  }

  it('internal click → client router push', () => {
    const { anchor, pushed } = mountWithPushSpy({ href: '/about' })
    anchor().click()
    expect(pushed).toEqual(['/about'])
  })

  it('external click → router push NOT called (browser owns it)', () => {
    const { anchor, pushed } = mountWithPushSpy({ href: 'https://example.com' })
    anchor().click()
    expect(pushed).toEqual([])
  })
})
