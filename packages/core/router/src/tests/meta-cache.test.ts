/**
 * Dynamic-route `meta` reuse — locks the per-navigation `mergeMeta` elimination.
 *
 * `resolveRoute` pre-computes each FlattenedRoute's merged `meta` ONCE at
 * flatten time (cached in the WeakMap-keyed route index). The static and
 * wildcard fast paths already reuse it; the dynamic-route paths previously
 * re-ran `mergeMeta(matched)` — a fresh object allocation + a per-record
 * `Object.assign` loop — on EVERY navigation to a dynamic route (the most
 * common case: `/posts/:id`, `/user/:id`).
 *
 * The fix carries the cached `f.meta` through `MatchResult`, so the dynamic
 * paths reuse it. Proof: two navigations to the same dynamic route return the
 * SAME `meta` object identity (reused from the cached index). Pre-fix each
 * navigation allocated a fresh `mergeMeta` result → different identities.
 * Bisect: revert the `meta: match.meta` reuse to `mergeMeta(...)` → identity
 * assertion fails.
 */
import { describe, expect, it } from 'vitest'
import { resolveRoute } from '../match'
import type { RouteRecord } from '../types'

const C = () => null

describe('resolveRoute — dynamic-route meta is cached, not re-merged per navigation', () => {
  const routes: RouteRecord[] = [
    {
      path: '/posts',
      component: C,
      meta: { requiresAuth: true },
      children: [{ path: ':id', component: C, meta: { title: 'Post' } }],
    },
  ]

  it('reuses the FlattenedRoute cached meta across navigations (reference-stable)', () => {
    const a = resolveRoute('/posts/42', routes)
    const b = resolveRoute('/posts/99', routes)

    // Same dynamic FlattenedRoute (`/posts/:id`) → same cached `f.meta`.
    // Post-fix: a.meta === b.meta (reused). Pre-fix: a fresh `mergeMeta` object
    // per call → a.meta !== b.meta.
    expect(a.meta).toBe(b.meta)
    // Sanity: the cached meta is the correctly-merged parent+child value.
    expect(a.meta).toMatchObject({ requiresAuth: true, title: 'Post' })
  })
})

/**
 * The reference-stable meta IS the cache's payload — anyone who mutates
 * `route.meta.X = …` (the natural shape "store some per-navigation state
 * here") permanently pollutes every future navigation to the same route
 * AND every sibling resolving through the same FlattenedRoute. The bug
 * is invisible at the unit-test layer (no test mutates meta) but real for
 * any user code that treats `route.meta` like a per-navigation snapshot
 * — which the type used to suggest (`meta: RouteMeta`).
 *
 * Defense: freeze meta at flatten time. Strict-mode modules (every Pyreon
 * file) throw on mutation of a frozen object, so the bad code path fails
 * at the call site with a clear `TypeError` instead of silently
 * corrupting the cache. Also tightened `ResolvedRoute.meta` to
 * `Readonly<RouteMeta>` so the type system surfaces the contract at
 * compile time.
 *
 * Bisect-verified: removing the `Object.freeze` makes both specs in this
 * block pass — `Object.isFrozen(meta) === false` and the mutation
 * silently succeeds. With the freeze, mutation throws as expected.
 */
describe('resolveRoute — meta is frozen at flatten time (cache-mutation safety)', () => {
  const routes: RouteRecord[] = [
    {
      path: '/posts',
      component: C,
      meta: { requiresAuth: true },
      children: [{ path: ':id', component: C, meta: { title: 'Post' } }],
    },
  ]

  it('cached dynamic-route meta is Object.isFrozen', () => {
    const a = resolveRoute('/posts/42', routes)
    expect(Object.isFrozen(a.meta)).toBe(true)
  })

  it('user mutation through (meta as any).x = ... throws TypeError', () => {
    const a = resolveRoute('/posts/42', routes)
    // The cast bypasses the `Readonly<RouteMeta>` type — exactly the
    // shape user code that hits this footgun would have (no compiler
    // help if they reach for `as any`).
    expect(() => {
      ;(a.meta as { x?: number }).x = 1
    }).toThrow(TypeError)
  })

  it('cache stays uncorrupted after a thrown mutation attempt', () => {
    const a = resolveRoute('/posts/42', routes)
    try {
      ;(a.meta as { x?: number }).x = 1
    } catch {
      // expected
    }
    const b = resolveRoute('/posts/99', routes)
    // b's meta must NOT have a leaked `x` field. (Without freeze, a
    // silent write on a's meta would surface on b's meta since they're
    // the same identity.)
    expect((b.meta as { x?: number }).x).toBeUndefined()
  })
})
