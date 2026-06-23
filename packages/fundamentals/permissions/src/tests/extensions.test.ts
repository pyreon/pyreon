import { effect } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { createPermissions } from '../index'

// ─── Recursive (**) subtree wildcards ──────────────────────────────────────────

describe('recursive (**) wildcards', () => {
  it('matches any depth strictly below the prefix', () => {
    const can = createPermissions({ 'posts.**': true })
    expect(can('posts.read')).toBe(true) // 1 level
    expect(can('posts.admin.delete')).toBe(true) // 2 levels
    expect(can('posts.a.b.c.d')).toBe(true) // deep
  })

  it('does NOT match the prefix itself or sibling prefixes', () => {
    const can = createPermissions({ 'posts.**': true })
    expect(can('posts')).toBe(false) // the prefix node itself
    expect(can('postsX.read')).toBe(false) // sibling prefix
    expect(can('other.read')).toBe(false)
  })

  it('leaves single-segment * unchanged (exactly one segment)', () => {
    const can = createPermissions({ 'posts.*': true })
    expect(can('posts.read')).toBe(true)
    expect(can('posts.admin.delete')).toBe(false) // NOT matched by single *
  })

  it('most-specific subtree deny overrides a broader subtree grant', () => {
    const can = createPermissions({ 'posts.**': true, 'posts.admin.**': false })
    expect(can('posts.read')).toBe(true)
    expect(can('posts.admin.delete')).toBe(false) // admin subtree denied
    expect(can('posts.admin.x.y')).toBe(false)
  })

  it('exact deny overrides a ** grant', () => {
    const can = createPermissions({ 'posts.**': true, 'posts.secret': false })
    expect(can('posts.read')).toBe(true)
    expect(can('posts.secret')).toBe(false)
  })

  it('single-segment * takes precedence over ** for direct children', () => {
    const can = createPermissions({ 'posts.*': false, 'posts.**': true })
    expect(can('posts.read')).toBe(false) // direct child → posts.* (false) wins
    expect(can('posts.a.b')).toBe(true) // deeper → posts.** (true)
  })

  it('resolves the nearest ** ancestor first', () => {
    const can = createPermissions({ 'a.**': false, 'a.b.**': true })
    expect(can('a.b.c')).toBe(true) // a.b.** (nearer) wins over a.** for a.b.c
    expect(can('a.x.y')).toBe(false) // only a.** applies → false
  })

  it('supports predicates as ** values', () => {
    const can = createPermissions({ 'posts.**': (ctx) => (ctx as { ok: boolean }).ok })
    expect(can('posts.a.b', { ok: true })).toBe(true)
    expect(can('posts.a.b', { ok: false })).toBe(false)
  })

  it('is reactive', () => {
    const can = createPermissions()
    let v = false
    effect(() => {
      v = can('posts.a.b')
    })
    expect(v).toBe(false)
    can.set({ 'posts.**': true })
    expect(v).toBe(true)
  })
})

// ─── can.assert ────────────────────────────────────────────────────────────────

describe('can.assert', () => {
  it('throws (with [Pyreon] prefix + the key) when denied', () => {
    const can = createPermissions({ 'posts.read': false })
    expect(() => can.assert('posts.read')).toThrow('[Pyreon] permission denied')
    expect(() => can.assert('posts.read')).toThrow("'posts.read'")
  })

  it('does not throw when granted', () => {
    const can = createPermissions({ 'posts.read': true })
    expect(() => can.assert('posts.read')).not.toThrow()
  })

  it('evaluates the predicate with context', () => {
    const can = createPermissions({ 'posts.update': (p) => (p as { own: boolean }).own })
    expect(() => can.assert('posts.update', { own: true })).not.toThrow()
    expect(() => can.assert('posts.update', { own: false })).toThrow('denied')
  })

  it('honors a ** subtree grant', () => {
    const can = createPermissions({ 'posts.**': true })
    expect(() => can.assert('posts.a.b')).not.toThrow()
  })

  it('throws for an unknown key (deny by default)', () => {
    const can = createPermissions()
    expect(() => can.assert('anything')).toThrow('[Pyreon] permission denied')
  })

  it('uses a custom message when provided', () => {
    const can = createPermissions({ 'billing.export': false })
    expect(() => can.assert('billing.export', undefined, 'Upgrade your plan to export')).toThrow(
      '[Pyreon] Upgrade your plan to export',
    )
    // still no-throw when granted, message ignored
    can.set({ 'billing.export': true })
    expect(() => can.assert('billing.export', undefined, 'Upgrade your plan to export')).not.toThrow()
  })
})

// ─── can.clear ──────────────────────────────────────────────────────────────────

describe('can.clear', () => {
  it('removes all permissions (deny everything)', () => {
    const can = createPermissions({ a: true, b: true })
    expect(can('a')).toBe(true)
    can.clear()
    expect(can('a')).toBe(false)
    expect(can('b')).toBe(false)
  })

  it('is reactive and updates granted / entries', () => {
    const can = createPermissions({ a: true })
    let v = true
    effect(() => {
      v = can('a')
    })
    expect(can.granted()).toEqual(['a'])
    can.clear()
    expect(v).toBe(false)
    expect(can.granted()).toEqual([])
    expect(can.entries()).toEqual([])
  })

  it('permissions can be re-added after clear', () => {
    const can = createPermissions({ a: true })
    can.clear()
    can.patch({ b: true })
    expect(can('a')).toBe(false)
    expect(can('b')).toBe(true)
  })
})
