/**
 * @vitest-environment happy-dom
 *
 * Regression coverage for `@pyreon/zero/client` startClient:
 *   1. Loader data embedded by the SSR server in `window.__PYREON_LOADER_DATA__`
 *      is hydrated into the router BEFORE the first render — otherwise
 *      `useLoaderData()` returns undefined on direct URL navigation and the
 *      page shows the fallback indefinitely.
 *   2. On SPA cold start (no SSR loader data), startClient triggers the
 *      router's loader pipeline for the current path so loaders run.
 *
 * Bisect-verified: revert the `hydrateLoaderData` call → "hydrates SSR loader
 * data" fails. Revert the `router.replace(currentPath)` cold-start call →
 * "kicks off loaders on SPA cold start" fails.
 */

import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const replaceMock = vi.fn(() => Promise.resolve())
const currentRouteMock = vi.fn(() => ({ path: '/users/42' }))
const routerStub = {
  replace: replaceMock,
  currentRoute: currentRouteMock,
}
const hydrateLoaderDataMock = vi.fn()

vi.mock('../app', () => ({
  createApp: () => ({
    App: (() => h('span', null, 'app')) as ComponentFn,
    router: routerStub,
  }),
}))

vi.mock('@pyreon/router', async () => {
  const actual = await vi.importActual<typeof import('@pyreon/router')>(
    '@pyreon/router',
  )
  return {
    ...actual,
    hydrateLoaderData: hydrateLoaderDataMock,
  }
})

vi.mock('@pyreon/runtime-dom', () => ({
  hydrateRoot: vi.fn(() => () => {}),
  mount: vi.fn(() => () => {}),
}))

const route: RouteRecord = {
  path: '/users/:id',
  component: (() => null) as ComponentFn,
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  delete (window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__
  replaceMock.mockClear()
  hydrateLoaderDataMock.mockClear()
})

afterEach(() => {
  document.body.innerHTML = ''
  delete (window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__
})

describe('startClient — loader integration', () => {
  it('hydrates SSR loader data from window.__PYREON_LOADER_DATA__', async () => {
    const { startClient } = await import('../client')
    const ssrData = { '/users/:id': { userId: '42', name: 'User 42' } }
    ;(window as unknown as Record<string, unknown>).__PYREON_LOADER_DATA__ =
      ssrData

    startClient({ routes: [route] })

    expect(hydrateLoaderDataMock).toHaveBeenCalledTimes(1)
    expect(hydrateLoaderDataMock.mock.calls[0]?.[1]).toBe(ssrData)
    // No SPA cold-start router.replace — SSR data path skips it
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('kicks off loaders on SPA cold start (no SSR loader data)', async () => {
    const { startClient } = await import('../client')

    startClient({ routes: [route] })

    expect(hydrateLoaderDataMock).not.toHaveBeenCalled()
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock.mock.calls[0]?.[0]).toBe('/users/42')
  })

  it('throws when #app container is missing', async () => {
    const { startClient } = await import('../client')
    document.body.innerHTML = ''
    expect(() => startClient({ routes: [route] })).toThrow(
      /Missing #app container/,
    )
  })
})
