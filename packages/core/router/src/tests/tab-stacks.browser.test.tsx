// Real-Chromium Back/Forward across the per-tab stacks of `createRouter({ tabs })`.
//
// happy-dom cannot exercise a real history stack (the unit specs simulate a
// traversal by rewriting `history.state` and dispatching popstate). Here the
// browser walks its own stack: every entry the router wrote carries
// `{ __pyreonTab, __pyreonTabStack }`, and a traversal must restore the tab
// AND that tab's stack through the full navigation pipeline — while the tab
// views keep their pages mounted.
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRouter, RouterProvider, RouterView } from '../index'
import { setActiveRouter } from '../router'
import type { Router } from '../types'

const page = (name: string) => () => h('p', { 'data-page': name }, name)
const routes = [
  { path: '/feed', component: page('feed') },
  { path: '/feed/post/:id', component: page('post') },
  { path: '/me', component: page('me') },
  { path: '/me/settings', component: page('settings') },
]
const tabs = [
  { name: 'feed', root: '/feed' },
  { name: 'me', root: '/me' },
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const waitUntil = async (pred: () => boolean, label: string, budgetMs = 4000): Promise<void> => {
  const deadline = Date.now() + budgetMs
  while (Date.now() < deadline) {
    if (pred()) return
    await sleep(20)
  }
  throw new Error(`waitUntil timed out after ${budgetMs}ms: ${label}`)
}

describe('tab stacks — real browser history', () => {
  beforeEach(() => {
    setActiveRouter(null)
    window.location.hash = '#/feed'
  })
  afterEach(() => {
    setActiveRouter(null)
    window.location.hash = ''
  })

  function mountApp(router: Router) {
    return mountInBrowser(
      h(
        RouterProvider,
        { router },
        h('section', { id: 'feed' }, router.withTab('feed', () => h(RouterView, {}))),
        h('section', { id: 'me' }, router.withTab('me', () => h(RouterView, {}))),
      ),
    )
  }

  it('Back and Forward walk across tabs and restore each tab stack', async () => {
    const router = createRouter({ routes, tabs, mode: 'hash' })
    const { container, unmount } = mountApp(router)
    const shown = (id: string) => container.querySelector(`#${id} [data-page]`)?.getAttribute('data-page')
    const at = (tab: string, path: string) => () =>
      router.activeTab() === tab && router.currentRoute().path === path

    await router.push('/feed/post/1')
    await flush()
    const postNode = container.querySelector('#feed [data-page]')
    expect(shown('feed')).toBe('post')
    await router.selectTab('me')
    await router.push('/me/settings')
    await flush()
    expect(window.location.hash).toBe('#/me/settings')

    window.history.back()
    await waitUntil(at('me', '/me'), 'Back to the me root')
    expect(router.tabStack('me')).toEqual(['/me'])

    window.history.back()
    await waitUntil(at('feed', '/feed/post/1'), 'Back into the feed tab')
    expect(router.tabStack('feed')).toEqual(['/feed', '/feed/post/1'])
    await flush()
    // The feed page was never rebuilt by the traversals.
    expect(container.querySelector('#feed [data-page]')).toBe(postNode)

    window.history.back()
    await waitUntil(at('feed', '/feed'), 'Back to the feed root')
    expect(router.tabStack('feed')).toEqual(['/feed'])

    window.history.forward()
    await waitUntil(at('feed', '/feed/post/1'), 'Forward to the post')
    window.history.forward()
    await waitUntil(at('me', '/me'), 'Forward into the me tab')
    window.history.forward()
    await waitUntil(at('me', '/me/settings'), 'Forward to settings')
    expect(router.tabStack('me')).toEqual(['/me', '/me/settings'])
    await flush()
    expect(shown('me')).toBe('settings')
    expect(shown('feed')).toBe('post')
    unmount()
  })

  it('re-selecting the active tab pops it to root, and Back undoes the pop', async () => {
    const router = createRouter({ routes, tabs, mode: 'hash' })
    const { unmount } = mountApp(router)
    await router.push('/feed/post/1')
    await router.push('/feed/post/2')
    await router.selectTab('feed')
    expect(router.tabStack('feed')).toEqual(['/feed'])
    expect(window.location.hash).toBe('#/feed')

    window.history.back()
    await waitUntil(
      () => router.currentRoute().path === '/feed/post/2',
      'Back restores the stack recorded before the pop',
    )
    expect(router.tabStack('feed')).toEqual(['/feed', '/feed/post/1', '/feed/post/2'])
    unmount()
  })
})
