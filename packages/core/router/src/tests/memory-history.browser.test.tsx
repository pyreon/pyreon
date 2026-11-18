import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRouter, RouterLink, RouterProvider, RouterView } from '../index'
import { setActiveRouter } from '../router'
import type { Router } from '../types'

// Real-Chromium coverage for `mode: 'memory'` (#4372): a memory router embedded
// in a page that already runs a browser router. Real browsers fire popstate /
// hashchange on traversal, count `history.length`, and run View Transitions —
// the parts happy-dom stubs.

const page = (name: string) => () => h('p', { 'data-page': name }, name)
const routes = [
  { path: '/', component: page('home') },
  { path: '/a', component: page('a') },
  { path: '/b', component: page('b') },
  { path: '/user/:id', component: page('user') },
]

const waitUntil = async (pred: () => boolean, label: string, budgetMs = 4000): Promise<void> => {
  const deadline = Date.now() + budgetMs
  while (Date.now() < deadline) {
    await flush()
    if (pred()) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`waitUntil timed out after ${budgetMs}ms: ${label}`)
}

const settle = (r: Router, label: string) => waitUntil(() => !r.loading(), label)
const path = (r: Router) => r.currentRoute().path

describe('memory router beside a browser router (real Chromium)', () => {
  // The runner page's own URL: history mode rewrites the pathname, so every
  // test puts it back.
  let original = ''
  beforeEach(() => {
    original = window.location.href
  })
  afterEach(() => {
    setActiveRouter(null)
    window.history.replaceState(null, '', original)
  })

  it('the page URL and history.length do not change while the memory router navigates', async () => {
    const demo = createRouter({ routes, mode: 'memory' })
    const { container, unmount } = mountInBrowser(
      h(
        RouterProvider,
        { router: demo },
        h(RouterLink, { to: '/user/3', id: 'demo-link' }, 'user'),
        h(RouterView, {}),
      ),
    )
    const href = window.location.href
    const length = window.history.length

    await demo.push('/a')
    await demo.push('/b')
    container.querySelector<HTMLAnchorElement>('#demo-link')!.click()
    await settle(demo, 'link click')
    expect(path(demo)).toBe('/user/3')
    demo.back()
    await settle(demo, 'back')
    expect(path(demo)).toBe('/b')
    expect(container.querySelector('[data-page]')?.textContent).toBe('b')

    expect(window.location.href).toBe(href)
    expect(window.history.length).toBe(length)
    expect(container.querySelector('#demo-link')?.getAttribute('href')).toBe('/user/3')
    unmount()
    demo.destroy()
  })

  it('a history router and a memory router on one page do not disturb each other', async () => {
    const base = new URL(original).pathname.replace(/\/$/, '')
    const site = createRouter({ routes, mode: 'history', base })
    const demo = createRouter({ routes, mode: 'memory' })
    const siteView = mountInBrowser(h(RouterProvider, { router: site }, h(RouterView, {})))
    const demoView = mountInBrowser(h(RouterProvider, { router: demo }, h(RouterView, {})))

    // The page's router navigates: the demo stays put.
    await site.push('/a')
    expect(window.location.pathname).toBe(`${base}/a`)
    expect(path(demo)).toBe('/')

    // The demo navigates: the page URL stays put.
    await demo.push('/b')
    expect(window.location.pathname).toBe(`${base}/a`)
    expect(path(site)).toBe('/a')

    // A REAL browser Back moves only the page's router.
    window.history.back()
    await waitUntil(() => path(site) === '/', 'site back')
    expect(path(demo)).toBe('/b')

    // The demo's Back moves only the demo.
    window.history.forward()
    await waitUntil(() => path(site) === '/a', 'site forward')
    demo.back()
    await settle(demo, 'demo back')
    expect(path(demo)).toBe('/')
    expect(path(site)).toBe('/a')
    expect(window.location.pathname).toBe(`${base}/a`)

    // The page router keeps ownership of cancelled-traversal restores even
    // though the memory router was created after it: a blocked real Back
    // puts the page URL back.
    const remove = site.beforeEach(() => false)
    window.history.back()
    await waitUntil(() => window.location.pathname === `${base}/a` && !site.loading(), 'restored')
    expect(path(site)).toBe('/a')
    remove()

    expect(siteView.container.querySelector('[data-page]')?.textContent).toBe('a')
    expect(demoView.container.querySelector('[data-page]')?.textContent).toBe('home')
    siteView.unmount()
    demoView.unmount()
    demo.destroy()
    site.destroy()
  })

  it("a page's in-document anchor does not navigate a memory router", async () => {
    const demo = createRouter({ routes, mode: 'memory', initialEntries: ['/a'] })
    const anchor = document.createElement('a')
    anchor.href = '#/b'
    document.body.appendChild(anchor)
    anchor.click()
    await flush()
    await new Promise((r) => setTimeout(r, 50))
    expect(path(demo)).toBe('/a')
    anchor.remove()
    demo.destroy()
  })
})
