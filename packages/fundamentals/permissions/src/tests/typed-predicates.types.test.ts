/**
 * A predicate that types its context (`(post: Post) => …`) is a valid
 * permission value (#4362). `PermissionMap` is `Record<string,
 * PermissionValue<unknown>>`, and a predicate's parameter was checked
 * contravariantly, so the documented shape
 * `createPermissions({ 'posts.update': (post: Post) => … })` failed strict
 * TypeScript with TS2322. The predicate type is now bivariant in its context,
 * like a DOM event handler: each predicate states the context it expects, and
 * `can(key, context)` passes whatever the caller gives.
 *
 * Checked by `tsc --noEmit` (this file is in the package's typecheck); the
 * runtime assertions keep vitest honest. Bisect-verified: with the old
 * `PermissionPredicate` the `createPermissions` / `set` / `patch` lines fail
 * with TS2322 ("Type '(post: Post) => boolean' is not assignable to type
 * 'PermissionValue<unknown>'").
 */
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createPermissions } from '../index'
import type { PermissionMap, PermissionPredicate, PermissionValue } from '../index'

interface Post {
  authorId: string
}
const me = () => ({ id: 'u1' })

describe('typed permission predicates', () => {
  it('accepts a predicate that types its context, in every map position', () => {
    const can = createPermissions({
      'posts.read': true,
      'posts.update': (post: Post) => post.authorId === me().id,
      'users.manage': () => false,
    })
    can.set({ 'posts.update': (post: Post) => post.authorId === me().id })
    can.patch({ 'posts.delete': (post: Post) => post.authorId === me().id })
    const map: PermissionMap = { 'posts.update': (post: Post) => post.authorId === 'x' }
    expect(can('posts.update', { authorId: 'u1' })).toBe(true)
    expect(can('posts.delete', { authorId: 'u2' })).toBe(false)
    expect(Object.keys(map)).toEqual(['posts.update'])
  })

  it('keeps the predicate type usable on its own', () => {
    const p: PermissionPredicate<Post> = (post) => post?.authorId === 'u1'
    expectTypeOf(p).parameter(0).toEqualTypeOf<Post | undefined>()
    const v: PermissionValue = p
    expect(typeof v).toBe('function')
  })

  it('still rejects values that are not a boolean or a predicate', () => {
    // @ts-expect-error — a string is not a permission value
    const bad: PermissionMap = { 'posts.read': 'yes' }
    // @ts-expect-error — a predicate must return a boolean
    const bad2: PermissionMap = { 'posts.read': (post: Post) => post.authorId }
    expect([bad, bad2].length).toBe(2)
  })
})
