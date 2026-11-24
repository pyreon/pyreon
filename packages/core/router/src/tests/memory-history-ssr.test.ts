// @vitest-environment node
/**
 * `mode: 'memory'` with no `window` at all (#4372).
 *
 * A memory router keeps its location in an entry stack, so it must work in a
 * DOM-less process — a server render, a test harness, a native-preview host —
 * including traversal, which in the browser modes reaches for
 * `window.history`. `isServer` is computed at module load from
 * `typeof document`, so this file declares the `node` environment.
 */
import { isServer } from '@pyreon/reactivity'
import { createRouter } from '../router'
import { preloadRoute } from '../server-loaders'
import type { RouteRecord, Router } from '../types'

const Page = () => null

const routes: RouteRecord[] = [
  { path: '/', component: Page },
  { path: '/a', component: Page },
  { path: '/b', component: Page },
]

const settle = async (r: Router): Promise<void> => {
  for (let i = 0; i < 50; i++) {
    await new Promise((res) => setTimeout(res, 0))
    if (!r.loading()) return
  }
  throw new Error('router did not settle')
}

test('the environment really has no window', () => {
  expect(isServer).toBe(true)
  expect(typeof window).toBe('undefined')
})

test('push / back / forward move through the stack with no window', async () => {
  const r = createRouter({ routes, mode: 'memory', initialEntries: ['/a'] })
  expect(r.currentRoute().path).toBe('/a')
  expect(await r.push('/b')).toBe('committed')
  r.back()
  await settle(r)
  expect(r.currentRoute().path).toBe('/a')
  r.forward()
  await settle(r)
  expect(r.currentRoute().path).toBe('/b')
  r.destroy()
})

test('traversals run guards on the server too, and a cancel keeps the position', async () => {
  const r = createRouter({ routes, mode: 'memory', initialEntries: ['/', '/a', '/b'] })
  r.beforeEach((to) => to.path !== '/a')
  r.back()
  await settle(r)
  expect(r.currentRoute().path).toBe('/b')
  r.destroy()
})

test('`url` seeds the single entry, exactly as it does for the server-side browser modes', async () => {
  const r = createRouter({ routes, mode: 'memory', url: '/b' })
  expect(r.currentRoute().path).toBe('/b')
  await preloadRoute(r, '/b')
  r.destroy()
})
