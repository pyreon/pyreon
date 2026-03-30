import { effect } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { createPermissions } from '../index'

describe('createPermissions — wildcard matching', () => {
  describe('prefix wildcard (posts.*)', () => {
    it('matches any sub-key under the prefix', () => {
      const can = createPermissions({ 'posts.*': true })
      expect(can('posts.read')).toBe(true)
      expect(can('posts.create')).toBe(true)
      expect(can('posts.update')).toBe(true)
      expect(can('posts.delete')).toBe(true)
    })

    it('does not match keys without a dot', () => {
      const can = createPermissions({ 'posts.*': true })
      expect(can('posts')).toBe(false) // no dot, no wildcard match
    })

    it('does not match different prefix', () => {
      const can = createPermissions({ 'posts.*': true })
      expect(can('users.read')).toBe(false)
      expect(can('comments.read')).toBe(false)
    })

    it('does not match partial prefix overlap', () => {
      const can = createPermissions({ 'post.*': true })
      expect(can('posts.read')).toBe(false) // 'posts' !== 'post'
    })

    it('exact match takes precedence over wildcard', () => {
      const can = createPermissions({
        'posts.*': true,
        'posts.delete': false,
      })
      expect(can('posts.read')).toBe(true)
      expect(can('posts.create')).toBe(true)
      expect(can('posts.delete')).toBe(false) // exact overrides wildcard
    })

    it('wildcard with predicate function', () => {
      const can = createPermissions({
        'posts.*': (post: any) => post?.status !== 'archived',
      })
      expect(can('posts.read', { status: 'published' })).toBe(true)
      expect(can('posts.update', { status: 'archived' })).toBe(false)
      expect(can('posts.delete', { status: 'draft' })).toBe(true)
    })

    it('multiple prefix wildcards for different namespaces', () => {
      const can = createPermissions({
        'posts.*': true,
        'users.*': false,
      })
      expect(can('posts.read')).toBe(true)
      expect(can('users.read')).toBe(false)
    })
  })

  describe('global wildcard (*)', () => {
    it('matches any key', () => {
      const can = createPermissions({ '*': true })
      expect(can('posts.read')).toBe(true)
      expect(can('users.manage')).toBe(true)
      expect(can('anything.at.all')).toBe(true)
      expect(can('simple-key')).toBe(true)
    })

    it('exact match takes precedence over global wildcard', () => {
      const can = createPermissions({
        '*': true,
        'billing.export': false,
      })
      expect(can('posts.read')).toBe(true)
      expect(can('billing.export')).toBe(false)
    })

    it('prefix wildcard takes precedence over global wildcard', () => {
      const can = createPermissions({
        '*': false,
        'posts.*': true,
      })
      expect(can('posts.read')).toBe(true)
      expect(can('posts.create')).toBe(true)
      expect(can('users.manage')).toBe(false) // falls to global *
    })

    it('resolution order: exact > prefix wildcard > global wildcard', () => {
      const can = createPermissions({
        '*': false,
        'posts.*': true,
        'posts.delete': false,
      })
      expect(can('posts.read')).toBe(true) // matched by posts.*
      expect(can('posts.delete')).toBe(false) // exact match
      expect(can('users.manage')).toBe(false) // matched by *
    })

    it('global wildcard with predicate', () => {
      const can = createPermissions({
        '*': (ctx: any) => ctx?.role === 'admin',
      })
      expect(can('posts.read', { role: 'admin' })).toBe(true)
      expect(can('posts.read', { role: 'viewer' })).toBe(false)
    })
  })

  describe('wildcard reactivity', () => {
    it('wildcards are reactive after set()', () => {
      const can = createPermissions({ 'posts.*': false })
      const results: boolean[] = []

      effect(() => {
        results.push(can('posts.read'))
      })

      can.set({ 'posts.*': true })
      expect(results).toEqual([false, true])
    })

    it('wildcards are reactive after patch()', () => {
      const can = createPermissions({ 'posts.*': true })
      const results: boolean[] = []

      effect(() => {
        results.push(can('posts.read'))
      })

      can.patch({ 'posts.read': false }) // exact override
      expect(results).toEqual([true, false])
    })

    it('removing wildcard via set() removes its effect', () => {
      const can = createPermissions({ 'posts.*': true })
      expect(can('posts.read')).toBe(true)

      can.set({}) // remove all permissions
      expect(can('posts.read')).toBe(false)
    })
  })
})
