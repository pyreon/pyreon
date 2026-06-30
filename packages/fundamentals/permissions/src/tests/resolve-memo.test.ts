import { effect } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { createPermissions } from '../index'

/**
 * The resolve memo (`permissions.ts:resolveCache`) caches key→boolean for
 * static-map, no-context checks (the hot path — apps check the same permission
 * repeatedly). These tests lock its correctness: it MUST invalidate on every
 * permission change, and MUST be bypassed for predicate maps + context-bearing
 * checks (where the result is not a pure function of the key). A stale cache
 * would be a silent authorization bug.
 */
describe('createPermissions — resolve memo correctness', () => {
  it('reflects a patch that flips a previously-cached deny → allow', () => {
    const can = createPermissions({ 'posts.read': true, 'admin.**': true })
    expect(can('posts.delete')).toBe(false) // cache a deny
    expect(can('posts.delete')).toBe(false) // warm (memo hit)
    can.patch({ 'posts.delete': true }) // change → memo must invalidate
    expect(can('posts.delete')).toBe(true) // MUST reflect the patch
  })

  it('reflects a patch that flips a previously-cached allow → deny', () => {
    const can = createPermissions({ 'posts.read': true })
    expect(can('posts.read')).toBe(true) // cache an allow
    can.patch({ 'posts.read': false })
    expect(can('posts.read')).toBe(false) // MUST reflect
  })

  it('reflects a set() that removes a wildcard a check was cached against', () => {
    const can = createPermissions({ 'admin.**': true })
    expect(can('admin.users.ban')).toBe(true) // cache a wildcard allow
    can.set({ 'x.read': true }) // replace ALL — admin.** gone
    expect(can('admin.users.ban')).toBe(false) // MUST reflect
    expect(can('x.read')).toBe(true)
  })

  it('reflects clear()', () => {
    const can = createPermissions({ 'posts.read': true })
    expect(can('posts.read')).toBe(true)
    can.clear()
    expect(can('posts.read')).toBe(false)
  })

  it('does NOT cache predicate results — same key, different context resolves independently', () => {
    const can = createPermissions({ edit: (ctx: unknown) => (ctx as { owner?: boolean })?.owner === true })
    expect(can('edit', { owner: true })).toBe(true)
    expect(can('edit', { owner: false })).toBe(false) // would be wrong if `true` were cached
    expect(can('edit', { owner: true })).toBe(true)
  })

  it('disables the memo for the whole map when ANY value is a predicate', () => {
    let calls = 0
    const can = createPermissions({
      'posts.read': true, // static, but...
      edit: () => {
        calls++
        return true
      }, // ...a predicate exists → memo off map-wide
    })
    can('posts.read')
    can('posts.read')
    can('edit') // predicate invoked each time (not memoized)
    can('edit')
    expect(calls).toBe(2) // both `edit` calls hit the predicate — never cached
  })

  it('memo is invisible to reactivity — `can` re-runs after a change inside an effect', () => {
    const can = createPermissions({ 'posts.read': true })
    const seen: boolean[] = []
    const dispose = effect(() => {
      seen.push(can('posts.read'))
    })
    can.patch({ 'posts.read': false })
    expect(seen).toEqual([true, false]) // effect re-ran with the fresh (uncached) value
    dispose.dispose()
  })
})
