/**
 * The WEB arm of `@pyreon/permissions`' native runtimes.
 *
 * `PyreonPermissions.swift` and `PyreonPermissions.kt` implement the same
 * resolver against the same granted set. They AGREED with each other and
 * disagreed with this file — both were written from one belief about what
 * `"posts.*"` means, and the belief was wrong. Two native implementations
 * matching is not evidence; this is the reference they are matched against.
 *
 * The divergence mattered because of its DIRECTION: `.*` was resolved with a
 * bare prefix match, so granting `"posts.*"` also granted
 * `"posts.comments.edit"` — a key the web denies. A permission check that
 * grants more on device than in the browser is the wrong way round.
 *
 * Native counterparts:
 *   native/tests/PyreonPermissionsTests.swift
 *   native/tests/PyreonPermissionsTest.kt
 */
import { describe, expect, it } from 'vitest'
import { createPermissions } from '../permissions'

describe('`.*` is ONE segment', () => {
  const can = createPermissions({ 'posts.*': true })

  it('covers a direct child', () => {
    expect(can('posts.edit')).toBe(true)
    expect(can('posts.delete')).toBe(true)
  })

  // The assertion the native tests were missing. Their comment already
  // said "segment-scoped"; nothing checked the case that distinguishes it.
  it('does NOT reach a nested namespace', () => {
    expect(can('posts.comments.edit')).toBe(false)
  })

  it('does not grant its own prefix, and is not a substring match', () => {
    expect(can('posts')).toBe(false)
    expect(can('postsX')).toBe(false)
  })

  it('stays inside its namespace', () => {
    expect(can('users.edit')).toBe(false)
  })
})

describe('`.**` is any depth', () => {
  const can = createPermissions({ 'posts.**': true })

  it('covers one segment and many', () => {
    expect(can('posts.edit')).toBe(true)
    expect(can('posts.comments.edit')).toBe(true)
  })

  it('stays inside its prefix', () => {
    expect(can('users.edit')).toBe(false)
  })

  it('resolves the most specific ancestor first', () => {
    // Both entries match `posts.admin.delete`; the deeper one wins, which
    // is what makes a narrower deny expressible under a broader grant.
    const nested = createPermissions({ 'posts.**': true, 'posts.admin.**': false })
    expect(nested('posts.admin.delete')).toBe(false)
    expect(nested('posts.public.read')).toBe(true)
  })
})

describe('`*` grants everything', () => {
  it('matches any key at any depth', () => {
    const can = createPermissions({ '*': true })
    expect(can('anything.deep.key')).toBe(true)
  })
})

describe('resolution order', () => {
  it('an exact entry wins over a wildcard, in both directions', () => {
    // This is the half the native runtimes still cannot express: their
    // granted set is a Set<String>, so a `false` VALUE has nowhere to
    // live. Pinned here so the gap is visible rather than assumed away.
    const can = createPermissions({ 'posts.*': true, 'posts.delete': false })
    expect(can('posts.edit')).toBe(true)
    expect(can('posts.delete')).toBe(false)
  })

  it('an unmatched key with no wildcards anywhere is denied', () => {
    const can = createPermissions({ 'posts.edit': true })
    expect(can('posts.delete')).toBe(false)
  })
})
