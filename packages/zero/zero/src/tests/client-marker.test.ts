// @vitest-environment happy-dom
/**
 * The two client-side halves of islands-only pages (#4371) that need no
 * browser: the marker the client looks for is the one the server writes, and
 * a client-side navigation to an islands-only route leaves the app for a
 * full page load.
 */
import type { ResolvedRoute } from '@pyreon/router'
import { ISLANDS_ONLY_MARKER } from '@pyreon/server'
import { afterEach, describe, expect, it } from 'vitest'
import { islandsOnlyNavigation } from '../client'
import { ISLANDS_ONLY_SELECTOR, isIslandsOnlyPage } from '../client-marker'

afterEach(() => {
  document.head.innerHTML = ''
})

describe('islands-only marker', () => {
  it('the selector the client reads matches the marker the server writes', () => {
    expect(isIslandsOnlyPage()).toBe(false)
    document.head.innerHTML = ISLANDS_ONLY_MARKER
    expect(document.querySelector(ISLANDS_ONLY_SELECTOR)).not.toBeNull()
    expect(isIslandsOnlyPage()).toBe(true)
  })
})

const route = (
  path: string,
  meta: Record<string, unknown> = {},
  extra: Partial<ResolvedRoute> = {},
) =>
  ({
    path,
    params: {},
    query: {},
    hash: '',
    matched: [],
    meta,
    ...extra,
  }) as unknown as ResolvedRoute

describe('islandsOnlyNavigation', () => {
  it('turns a navigation to an islands-only route into a full page load', () => {
    const loads: string[] = []
    const guard = islandsOnlyNavigation('', (href) => loads.push(href))
    expect(guard(route('/docs/intro', { hydrate: 'islands' }), route('/'))).toBe(false)
    expect(loads).toEqual(['/docs/intro'])
  })

  it('keeps the base, the query and the hash', () => {
    const loads: string[] = []
    const guard = islandsOnlyNavigation('/blog', (href) => loads.push(href))
    guard(
      route('/post', { hydrate: 'islands' }, { query: { a: '1', b: 'x y' }, hash: 'top' }),
      route('/'),
    )
    expect(loads).toEqual(['/blog/post?a=1&b=x%20y#top'])
  })

  it('lets every other navigation through', () => {
    const loads: string[] = []
    const guard = islandsOnlyNavigation('', (href) => loads.push(href))
    expect(guard(route('/app'), route('/'))).toBeUndefined()
    expect(guard(route('/app', { hydrate: 'app' }), route('/'))).toBeUndefined()
    expect(loads).toEqual([])
  })

  it('never reloads the route the app is already on (a cold start re-running its loaders)', () => {
    const loads: string[] = []
    const guard = islandsOnlyNavigation('', (href) => loads.push(href))
    expect(guard(route('/docs', { hydrate: 'islands' }), route('/docs'))).toBeUndefined()
    expect(loads).toEqual([])
  })
})
