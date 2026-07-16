/**
 * First-char fail-fast mask (`RouteIndex.firstCharMask`) — resolution-identity
 * lock.
 *
 * The mask lets a miss jump straight to the wildcard/not-found tail when no
 * non-wildcard route's first segment starts with the path's first char. It
 * must NEVER change what any path resolves to — only skip matching work.
 *
 * ORACLE: a differential against the SAME table plus a mask-disabling decoy —
 * a dynamic-FIRST route (`/:a/:b/zzz-mask-decoy-tail`) whose match set is
 * unreachable for every probed path (nothing ends in the decoy tail), so the
 * two tables must resolve every probe identically while one runs the mask and
 * the other structurally cannot (dynamicFirst non-empty → mask null).
 *
 * BISECT NOTE (how this suite was proven load-bearing): the mask's check was
 * temporarily INVERTED (jump on mask HIT instead of miss) — the differential
 * fuzz + the explicit edges below fail in bulk (`expected 'about' to be
 * 'catchall'`-shaped mismatches); restored → all pass. Removing the mask
 * entirely keeps the suite green BY DESIGN (both sides then run the same
 * full pipeline — the suite locks behavior-identity, not the optimization's
 * presence).
 */
import { resolveRoute } from '../match'
import type { RouteRecord } from '../types'

const Noop = () => null

function table(extra: RouteRecord[] = []): RouteRecord[] {
  const routes: RouteRecord[] = [
    { path: '/', name: 'root', component: Noop },
    { path: '/about', name: 'about', component: Noop },
    { path: '/pricing', name: 'pricing', component: Noop },
    { path: '/users/:id', name: 'user', component: Noop },
    { path: '/users/:id/posts/:postId', name: 'post', component: Noop },
    { path: '/files/:splat*', name: 'files', component: Noop },
    ...extra,
    { path: '(.*)', name: 'catchall', component: Noop },
  ]
  return routes
}

/** Decoy that disables the mask (dynamic FIRST segment) but can never match
 * a probe (no probe ends in the decoy tail). */
const MASK_DISABLER: RouteRecord = {
  path: '/:a/:b/zzz-mask-decoy-tail',
  name: 'decoy',
  component: Noop,
}

const fingerprint = (r: ReturnType<typeof resolveRoute>) => ({
  path: r.path,
  params: r.params,
  names: r.matched.map((m) => m.name ?? m.path),
  isNotFound: (r as { isNotFound?: boolean }).isNotFound ?? false,
})

describe('firstCharMask — resolution identity (masked vs structurally unmasked)', () => {
  const masked = table()
  const unmasked = table([MASK_DISABLER])

  const PROBES = [
    // plain misses (the mask's fast lane)
    '/zzz-1/nope',
    '/qqq',
    '/x',
    '/zzz-1/nope?tab=2#frag',
    // statics + nested
    '/',
    '/about',
    '/pricing',
    '/users/42',
    '/users/42/posts/7',
    '/files/docs/2020/report.pdf',
    // shapes the mask MUST fall through on
    '/about/', // trailing slash — misses staticMap, general lane must still match
    '//about', // leading double slash — collapses in the general lane
    '/%61bout', // %-encoded first char (decodes to 'a')
    '/%7Azz/nope', // %-encoded first char (decodes to 'z' — still a miss)
    '', // empty path
    '/?q=1', // root with query
    // unicode path against ASCII-only routes
    '/héllo',
    '/☃/frosty',
  ]

  for (const probe of PROBES) {
    it(`resolves ${JSON.stringify(probe)} identically`, () => {
      expect(fingerprint(resolveRoute(probe, masked))).toEqual(
        fingerprint(resolveRoute(probe, unmasked)),
      )
    })
  }

  it('seeded fuzz: 300 random paths resolve identically', () => {
    let seed = 0xc0ffee
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 0x100000000
    }
    const segs = ['about', 'users', 'files', 'zzz', 'a', '42', 'report.pdf', 'x-y', '%41', 'héllo', '']
    for (let i = 0; i < 300; i++) {
      const n = 1 + ((rnd() * 4) | 0)
      let path = ''
      for (let s = 0; s < n; s++) path += '/' + segs[(rnd() * segs.length) | 0]
      if (rnd() < 0.2) path += '/'
      if (rnd() < 0.2) path += '?q=' + ((rnd() * 100) | 0)
      expect(fingerprint(resolveRoute(path, masked))).toEqual(
        fingerprint(resolveRoute(path, unmasked)),
      )
    }
  })
})

describe('firstCharMask — explicit behavior locks', () => {
  it('a miss still resolves to the catch-all with layout-free identity', () => {
    const r = resolveRoute('/zzz-9/nope', table())
    expect(r.matched.map((m) => m.name)).toEqual(['catchall'])
  })

  it('a miss on a wildcard-free table reaches the not-found tail', () => {
    const routes: RouteRecord[] = [
      { path: '/about', name: 'about', component: Noop },
      { path: '/users/:id', name: 'user', component: Noop },
    ]
    const r = resolveRoute('/zzz/nope', routes)
    expect(r.matched).toEqual([])
  })

  it('trailing-slash static resolves through the general lane (mask must not eat it)', () => {
    const r = resolveRoute('/about/', table())
    expect(r.matched.map((m) => m.name)).toEqual(['about'])
  })

  it('leading double slash still matches the collapsed path', () => {
    const r = resolveRoute('//about', table())
    expect(r.matched.map((m) => m.name)).toEqual(['about'])
  })

  it('unicode-first ROUTE disables the mask (unicode paths still match it)', () => {
    const routes: RouteRecord[] = [
      { path: '/héllo', name: 'hello', component: Noop },
      { path: '(.*)', name: 'catchall', component: Noop },
    ]
    const r = resolveRoute('/héllo', routes)
    expect(r.matched.map((m) => m.name)).toEqual(['hello'])
  })
})
