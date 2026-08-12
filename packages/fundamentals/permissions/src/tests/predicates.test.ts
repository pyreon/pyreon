import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { createPermissions } from '../index'

describe('createPermissions — predicate permissions', () => {
  describe('basic predicate evaluation', () => {
    it('evaluates predicate with context argument', () => {
      const can = createPermissions({
        'posts.update': (post: any) => post?.authorId === 'user-1',
      })
      expect(can('posts.update', { authorId: 'user-1' })).toBe(true)
      expect(can('posts.update', { authorId: 'user-2' })).toBe(false)
    })

    it('predicate called without context receives undefined', () => {
      const can = createPermissions({
        'posts.update': (post?: any) => post?.authorId === 'user-1',
      })
      // No context — post is undefined
      expect(can('posts.update')).toBe(false)
    })

    it('predicate that ignores context (always true)', () => {
      const can = createPermissions({
        'posts.create': () => true,
      })
      expect(can('posts.create')).toBe(true)
      expect(can('posts.create', { anything: true })).toBe(true)
    })

    it('predicate that ignores context (always false)', () => {
      const can = createPermissions({
        'posts.create': () => false,
      })
      expect(can('posts.create')).toBe(false)
    })

    it('DENIES a predicate that returns a truthy NON-boolean (fail-closed)', () => {
      // Regression: `evaluate` returned the raw predicate result, so a truthy
      // non-boolean (from an `any`-typed context body) GRANTED access it should
      // deny. Only an explicit `true` may grant.
      const can = createPermissions({
        // (u: any) => u.role — a real body returning a truthy string
        'posts.edit': (u: any) => u?.role,
      })
      expect(can('posts.edit', { role: 'admin' })).toBe(false) // was true (string is truthy)
      expect(can.not('posts.edit', { role: 'admin' })).toBe(true)
    })

    it('DENIES an (accidentally) async predicate — a Promise is always truthy', () => {
      const can = createPermissions({
        // A thenable slips the `=> boolean` type via `any`; a Promise is truthy.
        'posts.publish': (() => Promise.resolve(false)) as unknown as (c?: unknown) => boolean,
      })
      expect(can('posts.publish')).toBe(false) // was true (Promise is truthy)
      expect(can.not('posts.publish')).toBe(true)
    })
  })

  describe('complex predicate logic', () => {
    it('ownership check', () => {
      const currentUserId = 'user-42'
      const can = createPermissions({
        'posts.update': (post: any) => post?.authorId === currentUserId,
        'posts.delete': (post: any) => post?.authorId === currentUserId && post?.status === 'draft',
      })

      const myDraft = { authorId: 'user-42', status: 'draft' }
      const myPublished = { authorId: 'user-42', status: 'published' }
      const otherPost = { authorId: 'user-99', status: 'draft' }

      expect(can('posts.update', myDraft)).toBe(true)
      expect(can('posts.update', myPublished)).toBe(true)
      expect(can('posts.update', otherPost)).toBe(false)
      expect(can('posts.delete', myDraft)).toBe(true)
      expect(can('posts.delete', myPublished)).toBe(false)
      expect(can('posts.delete', otherPost)).toBe(false)
    })

    it('predicate with multiple conditions', () => {
      const can = createPermissions({
        'orders.refund': (order: any) => {
          if (!order) return false
          const isRecent = Date.now() - order.createdAt < 86400000
          const isSmall = order.amount < 100
          return isRecent && isSmall
        },
      })

      const recentSmall = { createdAt: Date.now() - 1000, amount: 50 }
      const recentLarge = { createdAt: Date.now() - 1000, amount: 200 }
      const oldSmall = { createdAt: Date.now() - 100_000_000, amount: 50 }

      expect(can('orders.refund', recentSmall)).toBe(true)
      expect(can('orders.refund', recentLarge)).toBe(false)
      expect(can('orders.refund', oldSmall)).toBe(false)
    })

    it('predicate referencing reactive signal', () => {
      const role = signal('admin')
      const can = createPermissions({
        'users.manage': () => role.peek() === 'admin',
      })

      expect(can('users.manage')).toBe(true)

      role.set('viewer')
      // Need to trigger version update for reactive tracking,
      // but predicate re-evaluation on read still reflects signal state
      can.patch({ 'users.manage': () => role.peek() === 'admin' })
      expect(can('users.manage')).toBe(false)
    })
  })

  describe('predicate error handling', () => {
    it('returns false when predicate throws', () => {
      const can = createPermissions({
        'posts.update': () => {
          throw new Error('boom')
        },
      })
      expect(can('posts.update')).toBe(false)
    })

    it('returns false when predicate throws with context', () => {
      const can = createPermissions({
        'posts.update': (_post: any) => {
          throw new TypeError('property access failed')
        },
      })
      expect(can('posts.update', { id: 1 })).toBe(false)
    })

    it('can.not returns true when predicate throws', () => {
      const can = createPermissions({
        'posts.update': () => {
          throw new Error('error')
        },
      })
      expect(can.not('posts.update')).toBe(true)
    })

    it('other permissions unaffected when one predicate throws', () => {
      const can = createPermissions({
        'posts.read': true,
        'posts.update': () => {
          throw new Error('boom')
        },
        'posts.create': () => true,
      })
      expect(can('posts.read')).toBe(true)
      expect(can('posts.update')).toBe(false)
      expect(can('posts.create')).toBe(true)
    })
  })

  describe('predicates in granted()', () => {
    it('predicates count as capabilities in granted()', () => {
      const can = createPermissions({
        'posts.read': true,
        'posts.update': (post: any) => post?.authorId === 'me',
        'posts.delete': false,
      })
      const granted = can.granted()
      expect(granted).toContain('posts.read')
      expect(granted).toContain('posts.update') // predicate = capability exists
      expect(granted).not.toContain('posts.delete')
    })
  })
})
