// @vitest-environment happy-dom
/**
 * `@pyreon/server`'s own `startClient` (apps without `@pyreon/zero`) and
 * islands-only pages (#4371): with `islandsOnly: islandsOnlyPages(start)`, a
 * page the server marked runs `start` INSTEAD of the app (no router, the tree
 * is never hydrated), and on an app page a navigation to an islands-only
 * route is a full page load. Without the option a marked page still starts
 * the app, and says in dev why that is wrong.
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { RouterLink, RouterView } from '@pyreon/router'
import { query } from '@pyreon/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ISLANDS_ONLY_SELECTOR, islandsOnlyPages, startClient } from '../client'
import { ISLANDS_ONLY_MARKER } from '../render-page'

const Home: ComponentFn = () => h('main', { id: 'home' }, h(RouterLink, { to: '/static?x=1#top', id: 'to-static' }, 'static'))
const StaticPage: ComponentFn = () => h('main', { id: 'static' }, 'static')

const routes = [
  { path: '/', component: Home },
  { path: '/static', component: StaticPage, meta: { hydrate: 'islands' } as never },
  { path: '*', component: () => h('main', null, 'not found') },
]

const App: ComponentFn = () => h(RouterView, null)

const markPage = () => document.head.insertAdjacentHTML('beforeend', ISLANDS_ONLY_MARKER)

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = '<div id="app"></div>'
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('startClient — islands-only pages', () => {
  it('the selector matches the marker the server writes', () => {
    markPage()
    expect(document.querySelector(ISLANDS_ONLY_SELECTOR)).not.toBeNull()
  })

  it('a marked page runs the islands start instead of the app, and returns its cleanup', () => {
    markPage()
    const stop = vi.fn()
    const start = vi.fn(() => stop)
    const cleanup = startClient({ App, routes, islandsOnly: islandsOnlyPages(start) })
    expect(start).toHaveBeenCalledTimes(1)
    expect(document.querySelector('#app')!.childNodes.length).toBe(0)
    cleanup()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('an unmarked page starts the app and never runs the islands start', async () => {
    const start = vi.fn(() => () => {})
    const cleanup = startClient({ App, routes, islandsOnly: islandsOnlyPages(start) })
    expect(start).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(document.querySelector('#home')).not.toBeNull())
    cleanup()
  })

  it('a navigation from an app page to an islands-only route is a full page load', async () => {
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
    const cleanup = startClient({ App, routes, islandsOnly: islandsOnlyPages(() => () => {}) })
    await vi.waitFor(() => expect(document.querySelector('#to-static')).not.toBeNull())
    query<HTMLAnchorElement>(document, '#to-static').click()
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/static?x=1#top'))
    // The router stayed where it was: the islands-only route never rendered client-side.
    expect(document.querySelector('#static')).toBeNull()
    expect(document.querySelector('#home')).not.toBeNull()
    cleanup()
  })

  it('the guard leaves app routes and the current path alone', () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    const { guard } = islandsOnlyPages(() => () => {})
    const route = (path: string, hydrate?: string) =>
      ({ path, query: {}, hash: '', params: {}, matched: [], meta: hydrate ? { hydrate } : {} }) as never
    expect(guard(route('/about'), route('/'))).toBeUndefined()
    expect(guard(route('/static', 'islands'), route('/static', 'islands'))).toBeUndefined()
    expect(guard(route('/static', 'islands'), route('/'))).toBe(false)
    expect(assign).toHaveBeenCalledTimes(1)
  })

  it('without the option, a marked page starts the app and warns in dev', async () => {
    markPage()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cleanup = startClient({ App, routes })
    await vi.waitFor(() => expect(document.querySelector('#home')).not.toBeNull())
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[Pyreon] This page is islands-only'))).toBe(true)
    cleanup()
  })
})
