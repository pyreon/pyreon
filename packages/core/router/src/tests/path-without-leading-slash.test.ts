/**
 * A path that does not start with `/` matches no route.
 *
 * The matcher's lanes assume the leading `/`: the fast lane slices the first
 * segment from index 1 and the first-char fail-fast reads `charCodeAt(1)`.
 * A path without it therefore had its first character dropped, so `xabout`
 * resolved to `/about` and `xuser/42` to `/user/:id`. It now takes the
 * miss tail: the catch-all if there is one, else the not-found fallback.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { resolveRoute } from '../match'
import type { RouteRecord } from '../types'

const Page = () => h('div', null)
const CatchAll = () => h('div', null)
const NotFound = () => h('div', null)

const base: RouteRecord[] = [
  { path: '/', component: Page },
  { path: '/about', component: Page },
  { path: '/user/:id', component: Page },
  { path: '/files/*', component: Page },
]

describe('resolveRoute — path without a leading slash', () => {
  it('still matches the normal paths', () => {
    expect(resolveRoute('/about', base).matched).toHaveLength(1)
    expect(resolveRoute('/user/42', base).params).toEqual({ id: '42' })
  })

  it.each(['xabout', 'about', 'xuser/42', 'user/42', 'xfiles/a/b', 'a%62out'])(
    'does not match a route for %s',
    (path) => {
      const r = resolveRoute(path, base)
      expect(r.matched).toEqual([])
      expect(r.params).toEqual({})
    },
  )

  it('keeps query and hash on the miss', () => {
    const r = resolveRoute('xabout?tab=1#top', base)
    expect(r.matched).toEqual([])
    expect(r.query).toEqual({ tab: '1' })
    expect(r.hash).toBe('top')
  })

  it('resolves to the catch-all when there is one', () => {
    const routes: RouteRecord[] = [...base, { path: '(.*)', component: CatchAll }]
    const r = resolveRoute('xabout', routes)
    expect(r.matched.at(-1)?.component).toBe(CatchAll)
  })

  it('resolves to the not-found fallback when there is no catch-all', () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Page, notFoundComponent: NotFound, children: [{ path: 'about', component: Page }] },
    ]
    expect(resolveRoute('/about', routes).isNotFound).toBeUndefined()
    const r = resolveRoute('xabout', routes)
    expect(r.isNotFound).toBe(true)
  })
})
