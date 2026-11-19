// @vitest-environment node
//
// A real server: no `document`, so `@pyreon/reactivity`'s `isServer` is true.
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { createRouter, getActiveRouter, RouterProvider, useParams, useRoute, useSearchParams } from '@pyreon/router'
import { renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import { afterEach, describe, expect, it } from 'vitest'
import { _resetServerIslands, serverIsland } from '../server-island'
import { renderServerIslandFragment } from '../server-island-render'

/**
 * DATA EXPOSURE. `<RouterProvider>` also wrote the router into a MODULE-LEVEL
 * fallback (`setActiveRouter`), and every router hook fell back to it when no
 * provider was above. On a server that slot is shared by every request, and it
 * held the LAST page request's router. A server-island fragment renders with no
 * `<RouterProvider>`, so `useRoute()` inside it resolved to another user's
 * path and query.
 *
 * On the server the hooks now resolve through context only.
 */
afterEach(() => _resetServerIslands())

const routes = [{ path: '/x', component: (() => h('main', null, 'page')) as ComponentFn }]

async function renderPage(url: string): Promise<string> {
  const router = createRouter({ routes, mode: 'history', url })
  return runWithRequestContext(async () =>
    renderToString(h(RouterProvider, { router }, h('div', null, 'page'))),
  )
}

describe('server: router hooks never resolve another request’s router', () => {
  it('a server-island fragment does not see the previous page request’s route', async () => {
    let seen = 'not rendered'
    const RouteReader = (): VNodeChild => {
      try {
        const r = useRoute()()
        seen = `${r.path}?${JSON.stringify(r.query)}`
      } catch (err) {
        seen = (err as Error).message
      }

      return h('span', null, 'island')
    }
    serverIsland(async () => RouteReader, { name: 'RouteReader' })

    await renderPage('/x?token=secret-of-user-a')
    const result = await renderServerIslandFragment('RouteReader', null)

    expect(result.kind).toBe('html')
    expect(seen).not.toContain('secret-of-user-a')
    expect(seen).toContain('[Pyreon] No router installed')
  })

  it('useParams / useSearchParams / getActiveRouter outside a provider see no router', async () => {
    await renderPage('/x?token=secret')
    const results: string[] = []
    const Probe = (): VNodeChild => {
      for (const read of [
        () => JSON.stringify(useParams()),
        () => JSON.stringify(useSearchParams()[0]()),
      ]) {
        try {
          results.push(read())
        } catch (err) {
          results.push((err as Error).message)
        }
      }
      results.push(String(getActiveRouter()))
      return null
    }
    await renderToString(h(Probe, null))
    expect(results.join(' ')).not.toContain('secret')
    expect(results[2]).toBe('null')
  })

  it('inside a provider the hooks still resolve that request’s router', async () => {
    const router = createRouter({ routes, mode: 'history', url: '/x?q=1' })
    let path = ''
    const Reader = (): VNodeChild => {
      const r = useRoute()()
      path = `${r.path} ${r.query.q}`
      return null
    }
    await renderToString(h(RouterProvider, { router }, h(Reader, null)))
    expect(path).toBe('/x 1')
  })
})
