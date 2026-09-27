/**
 * `globalThis.__PYREON_ROUTER_LOADERS__` — the compile-time flag that lets a
 * build drop the loader engine. In a real bundle it is a `define`, folded to a
 * literal; here the global is set directly, which exercises the same two
 * guards at runtime. The bundle-level half (the engine really leaving the
 * output) is locked in @pyreon/zero, which is the build that defines it.
 */
import { createRouter } from '../router'
import type { RouteRecord, RouterInstance } from '../types'

const flag = globalThis as { __PYREON_ROUTER_LOADERS__?: boolean }
const Page = () => null

afterEach(() => {
  delete flag.__PYREON_ROUTER_LOADERS__
})

function setup() {
  const loader = vi.fn(async () => 'data')
  const routes: RouteRecord[] = [
    { path: '/', component: Page },
    { path: '/a', component: Page, loader },
  ]
  const router = createRouter({ routes, url: '/' }) as RouterInstance
  return { router, loader, routes }
}

describe('__PYREON_ROUTER_LOADERS__', () => {
  it('runs loaders when the flag is unset (every app that does not define it)', async () => {
    const { router, loader, routes } = setup()
    expect(await router.push('/a')).toBe('committed')
    expect(loader).toHaveBeenCalledTimes(1)
    expect(router._loaderData.get(routes[1]!)).toBe('data')
  })

  it('runs loaders when the flag is true', async () => {
    flag.__PYREON_ROUTER_LOADERS__ = true
    const { router, loader } = setup()
    await router.push('/a')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('skips the engine entirely when the flag is false — navigation still commits', async () => {
    flag.__PYREON_ROUTER_LOADERS__ = false
    const { router, loader, routes } = setup()
    expect(await router.push('/a')).toBe('committed')
    expect(loader).not.toHaveBeenCalled()
    expect(router._loaderData.has(routes[1]!)).toBe(false)
    // The prefetch/RouterLink path is guarded too.
    expect(await router._executeLoader(routes[1]!, { params: {}, query: {} } as never)).toBe(
      undefined,
    )
    expect(loader).not.toHaveBeenCalled()
  })
})
