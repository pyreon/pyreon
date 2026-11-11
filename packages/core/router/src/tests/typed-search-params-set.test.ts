/**
 * `useTypedSearchParams` (#4358):
 *
 * - `set` rebuilt the query string from the SCHEMA's keys only, so at
 *   `/x?page=1&utm=a`, `set({ page: 2 })` navigated to `/x?page=2` and lost
 *   `utm` (and wrote defaults such as `q=` for absent schema keys). It now
 *   starts from the URL's own query and changes only the given keys; an
 *   `undefined` value removes one. The hash is kept (also for
 *   `useSearchParams`).
 * - a `'number'` param absent from the URL read `0`, indistinguishable from
 *   `?page=0`; it now reads `undefined`.
 *
 * Bisect-verified: on the old implementation the `set` specs fail
 * (`expected '/x?page=2' to be '/x?page=2&utm=a'`-style) and the read specs
 * fail (`expected 0 to be undefined`).
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { createRouter, RouterProvider, useSearchParams, useTypedSearchParams } from '../index'
import type { RouteRecord } from '../types'

const routes: RouteRecord[] = [{ path: '/x', component: () => null }]

function setup<T>(url: string, use: () => T): { api: T; fullPath: () => string; destroy: () => void } {
  const router = createRouter({ routes, url })
  let api: T | undefined
  const Comp = () => {
    api = use()
    return null
  }
  const dispose = mount(h(RouterProvider, { router }, h(Comp, {})), document.createElement('div'))
  const fullPath = () => {
    const r = router.currentRoute()
    const q = new URLSearchParams(r.query as Record<string, string>).toString()
    return r.path + (q ? `?${q}` : '') + (r.hash ? `#${r.hash}` : '')
  }
  return {
    api: api!,
    fullPath,
    destroy: () => {
      dispose()
      router.destroy()
    },
  }
}

describe('useTypedSearchParams set()', () => {
  test('keeps params outside the schema', async () => {
    const t = setup('/x?page=1&utm=a', () => useTypedSearchParams({ page: 'number' }))
    await t.api[1]({ page: 2 })
    expect(t.fullPath()).toBe('/x?page=2&utm=a')
    t.destroy()
  })

  test('does not write defaults for schema keys that are absent', async () => {
    const t = setup('/x', () => useTypedSearchParams({ page: 'number', q: 'string', on: 'boolean' }))
    await t.api[1]({ page: 2 })
    expect(t.fullPath()).toBe('/x?page=2')
    t.destroy()
  })

  test('an undefined value removes the key; the hash is kept', async () => {
    const t = setup('/x?page=3&q=hi#top', () => useTypedSearchParams({ page: 'number', q: 'string' }))
    await t.api[1]({ page: undefined })
    expect(t.fullPath()).toBe('/x?q=hi#top')
    t.destroy()
  })

  test('a missing number reads undefined; ?page=0 reads 0', () => {
    const missing = setup('/x', () => useTypedSearchParams({ page: 'number' }))
    expect(missing.api[0]().page).toBeUndefined()
    missing.destroy()
    const zero = setup('/x?page=0', () => useTypedSearchParams({ page: 'number' }))
    expect(zero.api[0]().page).toBe(0)
    zero.destroy()
    const empty = setup('/x?page=', () => useTypedSearchParams({ page: 'number' }))
    expect(empty.api[0]().page).toBeUndefined()
    empty.destroy()
  })
})

describe('useSearchParams set()', () => {
  test('keeps the other params and the hash', async () => {
    const t = setup('/x?a=1&b=2#h', () => useSearchParams())
    await t.api[1]({ a: '9' })
    expect(t.fullPath()).toBe('/x?a=9&b=2#h')
    t.destroy()
  })
})
