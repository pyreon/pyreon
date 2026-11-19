// pyreon-lint-disable-file pyreon/no-missing-fallback -- these are route tables fed to routeCommands, not a router's own config
import { describe, expect, it, vi } from 'vitest'
import { createRouter } from '@pyreon/router'
import { createCommands } from '../commands'
import { routeCommands } from '../router'
import type { RouteLike } from '../router'

const Page = (): null => null

const routes: RouteLike[] = [
  { path: '/', name: 'home', meta: {} },
  { path: '/settings', meta: { title: 'Settings' }, children: [{ path: 'profile' }, { path: 'billing-details', name: 'billing' }, { path: ':section' }] },
  { path: '/users/:id' },
  { path: '/old', redirect: '/settings' },
  { path: '/docs/(.*)' },
  { path: '/admin', meta: { requiresAuth: true } },
]

describe('routeCommands', () => {
  const navigate = vi.fn()
  const list = routeCommands(routes, { navigate })

  it('makes one command per route you can go to, joins child paths, and leaves out params, wildcards and redirects', () => {
    expect(list.map((c) => c.id)).toEqual(['route:/', 'route:/settings', 'route:/settings/profile', 'route:/settings/billing-details', 'route:/admin'])
  })

  it('titles from meta.title, else the name or the last segment, made readable; the root is Home', () => {
    expect(list.map((c) => c.title)).toEqual(['Home', 'Settings', 'Profile', 'Billing', 'Admin'])
  })

  it('has the path as a keyword and navigates when run', async () => {
    expect(list[2]!.keywords).toEqual(['/settings/profile'])
    await list[2]!.run!({} as never)
    expect(navigate).toHaveBeenCalledWith('/settings/profile')
  })

  it('filters, retitles (a function follows the locale), groups and adds keywords', () => {
    const custom = routeCommands(routes, {
      navigate,
      filter: (r) => r.meta.requiresAuth !== true,
      title: (r) => () => `Go to ${r.path}`,
      group: 'navigate',
      keywords: (r) => (r.path === '/' ? ['start'] : []),
      id: (p) => `nav${p}`,
    })
    expect(custom.map((c) => c.id)).toEqual(['nav/', 'nav/settings', 'nav/settings/profile', 'nav/settings/billing-details'])
    expect(custom.every((c) => c.group === 'navigate' && typeof c.title === 'function')).toBe(true)
    expect(custom[0]!.keywords).toEqual(['/', 'start'])
  })

  it('does not list a path twice (an alias of a nested route)', () => {
    expect(routeCommands([{ path: '/a', children: [{ path: '/a' }] }], { navigate }).map((c) => c.id)).toEqual(['route:/a'])
  })

  it('works with a real router: the same routes array, router.push as navigate, and the palette finds and runs them', async () => {
    const router = createRouter({ routes: [{ path: '/', component: Page }, { path: '/settings/profile', component: Page, meta: { title: 'Profile settings' } }], mode: 'history' })
    const registry = createCommands()
    registry.register(routeCommands([{ path: '/', component: Page }, { path: '/settings/profile', component: Page, meta: { title: 'Profile settings' } }] as never, { navigate: (path) => router.push(path) }))
    expect(registry.search('profile')[0]!.title).toBe('Profile settings')
    await registry.run('route:/settings/profile')
    expect(router.currentRoute().path).toBe('/settings/profile')
    registry.dispose()
  })
})
