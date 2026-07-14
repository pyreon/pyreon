/**
 * Excellence-sweep behavioral coverage for router edge contracts (the tractable
 * small-file gaps — the match.ts residual is internal fast-lane sparse-array
 * guards + 404-trie specificity not reachable via the public resolveRoute API,
 * left as a follow-up):
 *   - loader.ts    stringifyLoaderData circular-reference throw
 *   - redirect.ts  getRedirectInfo on a real redirect error vs a plain error
 *   - announcer.ts announceRouteChange creates a live region; clear removes it
 *
 * Every case asserts observable behavior, not just that a line ran.
 */
import { describe, expect, it } from 'vitest'
import { announceRouteChange, clearRouteAnnouncer } from '../announcer'
import { getRedirectInfo, isRedirectError, redirect, stringifyLoaderData } from '../index'

describe('loader — stringifyLoaderData circular guard', () => {
  it('throws a descriptive error on a circular reference', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj.self = obj
    expect(() => stringifyLoaderData(obj)).toThrow(/circular reference/)
  })

  it('serializes acyclic data (incl. shared non-cyclic refs) fine', () => {
    const shared = { x: 1 }
    // `shared` appears twice but is NOT a cycle — must not throw.
    expect(stringifyLoaderData({ a: shared, b: shared })).toContain('"x":1')
  })
})

describe('redirect — getRedirectInfo', () => {
  it('returns { url, status } for a real redirect error', () => {
    let err: unknown
    try {
      redirect('/login', 302)
    } catch (e) {
      err = e
    }
    expect(isRedirectError(err)).toBe(true)
    expect(getRedirectInfo(err)).toEqual({ url: '/login', status: 302 })
  })

  it('returns null for a plain (non-redirect) error', () => {
    expect(getRedirectInfo(new Error('nope'))).toBeNull()
  })
})

describe('announcer — live-region lifecycle', () => {
  afterEach(() => clearRouteAnnouncer())

  it('announceRouteChange creates a connected aria-live region', () => {
    announceRouteChange('Home page')
    const region = document.querySelector('[aria-live]')
    expect(region).not.toBeNull()
    expect(region?.isConnected).toBe(true)
  })

  it('clearRouteAnnouncer removes the region from the document', () => {
    announceRouteChange('Home page')
    expect(document.querySelector('[aria-live]')).not.toBeNull()
    clearRouteAnnouncer()
    expect(document.querySelector('[aria-live]')).toBeNull()
  })
})
