// @vitest-environment node
/**
 * SSR store-state injection — the SERVER half of the @pyreon/store hydration
 * handshake, wired into `renderPage` via the decoupled `__PYREON_DEHYDRATE_STORES__`
 * globalThis bridge (set by @pyreon/store on import — the same decoupling as the
 * styler-flush sink, so @pyreon/server keeps NO dependency on @pyreon/store).
 *
 * These specs test render-page's CONSUMPTION of the bridge with a FAKE bridge
 * (no @pyreon/store import — that would be a core→fundamentals layering
 * violation). The store package's own tests cover that importing it registers
 * the real bridge + that the emitted JSON round-trips through `hydrateStores`.
 *
 * Bisect anchor: removing the bridge read in render-page.ts makes
 * "injects __PYREON_STORE_STATE__" fail (the script is absent).
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { createRouter, RouterView } from '@pyreon/router'
import { afterEach, describe, expect, test } from 'vitest'
import { renderPage } from '../render-page'

interface Bridge {
  __PYREON_DEHYDRATE_STORES__?: () => Record<string, Record<string, unknown>>
}
function setBridge(snapshot: Record<string, Record<string, unknown>> | null): void {
  if (snapshot === null) delete (globalThis as Bridge).__PYREON_DEHYDRATE_STORES__
  else (globalThis as Bridge).__PYREON_DEHYDRATE_STORES__ = () => snapshot
}

function makeRouter(routes: import('@pyreon/router').RouteRecord[], url: string) {
  return createRouter({ routes, mode: 'history', url })
}

const Page: ComponentFn = () => h('main', { id: 'page' }, 'hi')

describe('renderPage — store-state injection (SSR hydration bridge)', () => {
  afterEach(() => setBridge(null))

  test('injects __PYREON_STORE_STATE__ when the dehydrate bridge is present', async () => {
    setBridge({ cart: { count: 7, label: 'server' } })
    const router = makeRouter([{ path: '/', component: Page }], '/')

    const result = await renderPage(() => h(RouterView, null), router as never, '/')
    expect(result.kind).toBe('html')
    if (result.kind !== 'html') return

    expect(result.loaderScript).toContain('window.__PYREON_STORE_STATE__=')
    expect(result.loaderScript).toContain('"count":7')
    expect(result.loaderScript).toContain('"label":"server"')
  })

  test('emits the store script ALONGSIDE the loader-data script', async () => {
    setBridge({ ui: { open: true } })
    const router = makeRouter(
      [{ path: '/', component: Page, loader: async () => ({ greeting: 'hello' }) }],
      '/',
    )
    const result = await renderPage(() => h(RouterView, null), router as never, '/')
    if (result.kind !== 'html') throw new Error('expected html')
    expect(result.loaderScript).toContain('window.__PYREON_LOADER_DATA__=')
    expect(result.loaderScript).toContain('window.__PYREON_STORE_STATE__=')
  })

  test('emits NO store script when no bridge is registered (app uses no stores)', async () => {
    setBridge(null)
    const router = makeRouter([{ path: '/', component: Page }], '/')
    const result = await renderPage(() => h(RouterView, null), router as never, '/')
    if (result.kind !== 'html') throw new Error('expected html')
    expect(result.loaderScript).not.toContain('__PYREON_STORE_STATE__')
  })

  test('emits NO store script when the bridge returns an empty snapshot', async () => {
    setBridge({})
    const router = makeRouter([{ path: '/', component: Page }], '/')
    const result = await renderPage(() => h(RouterView, null), router as never, '/')
    if (result.kind !== 'html') throw new Error('expected html')
    expect(result.loaderScript).not.toContain('__PYREON_STORE_STATE__')
  })

  test('the emitted JSON is </script>-escaped + parseable (the wire format)', async () => {
    setBridge({ cart: { count: 42 } })
    const router = makeRouter([{ path: '/', component: Page }], '/')
    const result = await renderPage(() => h(RouterView, null), router as never, '/')
    if (result.kind !== 'html') throw new Error('expected html')
    const m = result.loaderScript.match(/window\.__PYREON_STORE_STATE__=(\{.*?\})<\/script>/)
    expect(m).not.toBeNull()
    expect(JSON.parse(m![1] as string)).toEqual({ cart: { count: 42 } })
  })
})
