// `<Tabs router={router}>` — tabs bound to a router with per-tab back stacks
// (`createRouter({ tabs })`, #4060). Uses the REAL @pyreon/router, so the
// structural `TabsRouter` contract this package types is checked against the
// router that actually implements it.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { createRouter, RouterProvider, RouterView, setActiveRouter } from '@pyreon/router'
import type { Router } from '@pyreon/router'
import { Tab, Tabs } from '../index'

const page = (name: string) => () => h('p', { 'data-page': name }, name)
const routes = [
  { path: '/feed', component: page('feed') },
  { path: '/feed/post/:id', component: page('post') },
  { path: '/me', component: page('me') },
  { path: '/me/settings', component: page('settings') },
]

let cleanup: (() => void) | undefined
let router: Router | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  router?.destroy()
  router = undefined
  setActiveRouter(null)
})

function renderApp(): HTMLDivElement {
  window.history.replaceState(null, '', '/feed')
  router = createRouter({
    routes,
    mode: 'history',
    tabs: [
      { name: 'feed', root: '/feed' },
      { name: 'me', root: '/me' },
    ],
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = mount(
    h(
      RouterProvider,
      { router },
      h(
        Tabs,
        { router },
        h(Tab, { value: 'feed', label: 'Feed', 'data-testid': 'tab-feed' }, h(RouterView, {})),
        h(Tab, { value: 'me', label: 'Me', 'data-testid': 'tab-me' }, h(RouterView, {})),
      ),
    ),
    container,
  )
  cleanup = () => {
    unmount()
    container.remove()
  }
  return container
}

const flush = () => new Promise((r) => setTimeout(r, 0))
const tabButton = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!
const panelPage = (c: HTMLElement, i: number) =>
  c.querySelectorAll('[role="tabpanel"]')[i]!.querySelector('[data-page]')

describe('<Tabs router>', () => {
  it('selects the router active tab and switches through the router', async () => {
    const c = renderApp()
    expect(tabButton(c, 'tab-feed').getAttribute('aria-selected')).toBe('true')
    expect(panelPage(c, 0)?.getAttribute('data-page')).toBe('feed')
    tabButton(c, 'tab-me').click()
    await flush()
    expect(router!.activeTab()).toBe('me')
    expect(tabButton(c, 'tab-me').getAttribute('aria-selected')).toBe('true')
    expect(panelPage(c, 1)?.getAttribute('data-page')).toBe('me')
  })

  it('a push inside a tab renders in THAT tab, and switching keeps each stack', async () => {
    const c = renderApp()
    await router!.push('/feed/post/1')
    await flush()
    const post = panelPage(c, 0)
    expect(post?.getAttribute('data-page')).toBe('post')
    tabButton(c, 'tab-me').click()
    await flush()
    await router!.push('/me/settings')
    await flush()
    expect(panelPage(c, 1)?.getAttribute('data-page')).toBe('settings')
    tabButton(c, 'tab-feed').click()
    await flush()
    // Same node: the feed tab's page survived the round trip.
    expect(panelPage(c, 0)).toBe(post)
    expect(router!.tabStack('me')).toEqual(['/me', '/me/settings'])
  })

  it('clicking the ACTIVE tab pops it to its root', async () => {
    const c = renderApp()
    await router!.push('/feed/post/1')
    await flush()
    tabButton(c, 'tab-feed').click()
    await flush()
    expect(router!.tabStack('feed')).toEqual(['/feed'])
    expect(panelPage(c, 0)?.getAttribute('data-page')).toBe('feed')
  })

  it('arrow-key activation never re-selects (no pop on the active tab)', async () => {
    const c = renderApp()
    await router!.push('/feed/post/1')
    await flush()
    const list = c.querySelector('[role="tablist"]')!
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flush()
    expect(router!.activeTab()).toBe('me')
    expect(router!.tabStack('feed')).toEqual(['/feed', '/feed/post/1'])
  })
  it('warns when the router has no tabs, and selects nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.history.replaceState(null, '', '/feed')
    router = createRouter({ routes, mode: 'history' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const unmount = mount(
      h(Tabs, { router }, h(Tab, { value: 'feed', label: 'Feed', 'data-testid': 'tab-feed' }, 'x')),
      container,
    )
    cleanup = () => {
      unmount()
      container.remove()
    }
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('this router has no `tabs`'))
    expect(tabButton(container, 'tab-feed').getAttribute('aria-selected')).toBe('false')
    warn.mockRestore()
  })
})
