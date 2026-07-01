import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LinkConfig } from '../index'
import { createRouter, RouterLink, RouterProvider } from '../index'
import { setActiveRouter } from '../router'

const routes = [
  { path: '/', component: () => h('div', { id: 'home' }, 'home') },
  { path: '/about', component: () => h('div', { id: 'about' }, 'about') },
]

/** Mount a single `<RouterLink>` and return its rendered `<a>` + a cleanup. */
function mountLink(
  props: Record<string, unknown>,
  opts: { mode?: 'hash' | 'history'; links?: LinkConfig } = {},
) {
  const router = createRouter({
    routes,
    mode: opts.mode ?? 'hash',
    ...(opts.links ? { links: opts.links } : {}),
  })
  const { container, unmount } = mountInBrowser(
    h(RouterProvider, { router }, h(RouterLink, { id: 'link', ...props }, 'go')),
  )
  const anchor = () => container.querySelector<HTMLAnchorElement>('#link')!
  return { router, anchor, unmount }
}

describe('RouterLink — external-link detection + attributes', () => {
  beforeEach(() => {
    window.location.hash = ''
  })
  afterEach(() => {
    setActiveRouter(null)
    window.location.hash = ''
  })

  it('external http(s) → target=_blank, rel=noopener noreferrer, href verbatim', async () => {
    const { anchor, unmount } = mountLink({ to: 'https://example.com/docs' })
    await flush()
    const a = anchor()
    expect(a.getAttribute('href')).toBe('https://example.com/docs')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    unmount()
  })

  it('protocol-relative //host → external new-tab', async () => {
    const { anchor, unmount } = mountLink({ to: '//cdn.example.com/x' })
    await flush()
    const a = anchor()
    expect(a.getAttribute('href')).toBe('//cdn.example.com/x')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    unmount()
  })

  it('internal path → href=#/about (hash mode), no target/rel', async () => {
    const { anchor, unmount } = mountLink({ to: '/about' })
    await flush()
    const a = anchor()
    expect(a.getAttribute('href')).toBe('#/about')
    expect(a.getAttribute('target')).toBeNull()
    expect(a.getAttribute('rel')).toBeNull()
    unmount()
  })

  it('mailto: → plain <a>, no target (not new-tab eligible)', async () => {
    const { anchor, unmount } = mountLink({ to: 'mailto:hi@example.com' })
    await flush()
    const a = anchor()
    expect(a.getAttribute('href')).toBe('mailto:hi@example.com')
    expect(a.getAttribute('target')).toBeNull()
    expect(a.getAttribute('rel')).toBeNull()
    unmount()
  })

  it('tel: → plain <a>, no target', async () => {
    const { anchor, unmount } = mountLink({ to: 'tel:+15550001' })
    await flush()
    const a = anchor()
    expect(a.getAttribute('href')).toBe('tel:+15550001')
    expect(a.getAttribute('target')).toBeNull()
    unmount()
  })

  it('#hash → same-page anchor, no target', async () => {
    const { anchor, unmount } = mountLink({ to: '#section-2' })
    await flush()
    const a = anchor()
    expect(a.getAttribute('href')).toBe('#section-2')
    expect(a.getAttribute('target')).toBeNull()
    unmount()
  })

  it('same-origin absolute → internal by default (stripped to path, no target)', async () => {
    const origin = window.location.origin
    const { anchor, unmount } = mountLink({ to: `${origin}/about` })
    await flush()
    const a = anchor()
    expect(a.getAttribute('href')).toBe('#/about')
    expect(a.getAttribute('target')).toBeNull()
    unmount()
  })
})

describe('RouterLink — per-router LinkConfig', () => {
  beforeEach(() => {
    window.location.hash = ''
  })
  afterEach(() => {
    setActiveRouter(null)
    window.location.hash = ''
  })

  it('externalNewTab:false → external link has no target/rel', async () => {
    const { anchor, unmount } = mountLink(
      { to: 'https://example.com' },
      { links: { externalNewTab: false } },
    )
    await flush()
    const a = anchor()
    expect(a.getAttribute('href')).toBe('https://example.com')
    expect(a.getAttribute('target')).toBeNull()
    expect(a.getAttribute('rel')).toBeNull()
    unmount()
  })

  it('externalRel override applied to new-tab links', async () => {
    const { anchor, unmount } = mountLink(
      { to: 'https://example.com' },
      { links: { externalRel: 'noopener' } },
    )
    await flush()
    expect(anchor().getAttribute('rel')).toBe('noopener')
    unmount()
  })

  it("sameOriginAbsolute:'external' → same-origin absolute opens new tab", async () => {
    const origin = window.location.origin
    const { anchor, unmount } = mountLink(
      { to: `${origin}/about` },
      { links: { sameOriginAbsolute: 'external' } },
    )
    await flush()
    const a = anchor()
    // treated external → href verbatim, new tab
    expect(a.getAttribute('href')).toBe(`${origin}/about`)
    expect(a.getAttribute('target')).toBe('_blank')
    unmount()
  })
})

describe('RouterLink — per-link overrides', () => {
  beforeEach(() => {
    window.location.hash = ''
  })
  afterEach(() => {
    setActiveRouter(null)
    window.location.hash = ''
  })

  it('external={false} forces a cross-origin URL to be treated as internal', async () => {
    const { anchor, unmount } = mountLink({ to: 'https://other.example.com/x', external: false })
    await flush()
    const a = anchor()
    // internal → stripped to path, no target
    expect(a.getAttribute('href')).toBe('#/x')
    expect(a.getAttribute('target')).toBeNull()
    unmount()
  })

  it('external={true} forces an internal path into a new-tab external link', async () => {
    const { anchor, unmount } = mountLink({ to: '/about', external: true })
    await flush()
    const a = anchor()
    expect(a.getAttribute('href')).toBe('/about')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    unmount()
  })

  it('target override wins over auto _blank; rel not auto-applied for _self', async () => {
    const { anchor, unmount } = mountLink({ to: 'https://example.com', target: '_self' })
    await flush()
    const a = anchor()
    expect(a.getAttribute('target')).toBe('_self')
    expect(a.getAttribute('rel')).toBeNull()
    unmount()
  })

  it('rel override wins over the secure default', async () => {
    const { anchor, unmount } = mountLink({ to: 'https://example.com', rel: 'sponsored' })
    await flush()
    expect(anchor().getAttribute('rel')).toBe('sponsored')
    unmount()
  })
})

describe('RouterLink — navigation vs full-load', () => {
  let stopNav: ((e: MouseEvent) => void) | null = null
  beforeEach(() => {
    window.location.hash = ''
    // Stop a real full-page navigation / new-tab popup for EXTERNAL anchors
    // only. Internal links render `#/path` (a same-page hash change that stays
    // on the test page), so they need no guard — and guarding them (capture
    // preventDefault) would set `defaultPrevented` before Pyreon's delegated
    // handler runs, tripping its correct "don't double-handle" bail.
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
    setActiveRouter(null)
    window.location.hash = ''
  })

  it('internal link click → client router navigates', async () => {
    const { router, anchor, unmount } = mountLink({ to: '/about' })
    await flush()
    expect(router.currentRoute()?.path).toBe('/')
    anchor().click()
    await flush()
    expect(router.currentRoute()?.path).toBe('/about')
    unmount()
  })

  it('external link click → router does NOT navigate (browser owns it)', async () => {
    const { router, anchor, unmount } = mountLink({ to: 'https://example.com' })
    await flush()
    expect(router.currentRoute()?.path).toBe('/')
    anchor().click()
    await flush()
    // Still on the original route — Pyreon left the click to the browser.
    expect(router.currentRoute()?.path).toBe('/')
    unmount()
  })
})
