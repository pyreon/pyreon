import { describe, expect, it } from 'vitest'
import { createPermissions, usePermissions } from '../index'

describe('usePermissions', () => {
  // The invariant is unchanged — a BARE call with no provider still throws.
  // Only the message grew: it now names the seeded form as the other way out.
  it('throws when called outside PermissionsProvider', () => {
    expect(() => usePermissions()).toThrow(
      '[Pyreon] usePermissions() must be used within <PermissionsProvider>',
    )
  })

  // The seeded form is what the native targets compile to. Before it worked on
  // the web, the identical call threw in a browser, so a screen written once
  // could not run on all three targets.
  describe('seeded form — usePermissions([...])', () => {
    it('needs no provider and grants exactly the listed keys', () => {
      const can = usePermissions(['posts.edit'])
      expect(can('posts.edit')).toBe(true)
      expect(can('posts.delete')).toBe(false)
    })

    it('honours wildcards the same way the map form does', () => {
      const can = usePermissions(['posts.*'])
      expect(can('posts.edit')).toBe(true)
      expect(can('users.edit')).toBe(false)
    })

    it('still falls through to the provider contract for an EMPTY list', () => {
      // An empty seed grants nothing, so treating it as self-contained would
      // silently deny everything instead of reading the provider.
      expect(() => usePermissions([])).toThrow('[Pyreon] usePermissions()')
    })
  })
})

describe('createPermissions used directly (no context)', () => {
  it('works standalone without any provider', () => {
    const can = createPermissions({ 'posts.read': true })
    expect(can('posts.read')).toBe(true)
  })

  it('multiple independent instances do not interfere', () => {
    const canA = createPermissions({ 'posts.read': true })
    const canB = createPermissions({ 'posts.read': false })

    expect(canA('posts.read')).toBe(true)
    expect(canB('posts.read')).toBe(false)

    canA.set({ 'posts.read': false })
    expect(canA('posts.read')).toBe(false)
    expect(canB('posts.read')).toBe(false) // unchanged, already false
  })

  it('set() on one instance does not affect another', () => {
    const canA = createPermissions({ a: true, b: true })
    const canB = createPermissions({ a: true, b: true })

    canA.set({ a: false })
    expect(canA('a')).toBe(false)
    expect(canA('b')).toBe(false) // cleared by set

    expect(canB('a')).toBe(true) // unaffected
    expect(canB('b')).toBe(true)
  })

  it('patch() on one instance does not affect another', () => {
    const canA = createPermissions({ shared: true })
    const canB = createPermissions({ shared: true })

    canA.patch({ shared: false })
    expect(canA('shared')).toBe(false)
    expect(canB('shared')).toBe(true) // unaffected
  })
})
