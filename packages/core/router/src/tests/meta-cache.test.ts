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
