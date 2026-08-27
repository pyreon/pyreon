import { describe, expect, it } from 'vitest'

/**
 * Differential equivalence lock for the zero-allocation rewrites of
 * `isSegmentPrefix` (components.tsx) and `matchSegments` (router.ts). Those
 * functions are module-internal, so this test reproduces BOTH the OLD
 * split('/').filter(Boolean) + .every implementations (the oracle) and the NEW
 * charCodeAt offset-walk implementations (mirroring what shipped), and asserts
 * they agree on a large deterministic input matrix — including the empty-segment
 * edge cases (leading/trailing/double slashes) that `filter(Boolean)` dropped and
 * the offset-walk must drop identically. The existing `useIsActive` +
 * RouterLink-active tests exercise the SHIPPED functions; this pins the
 * algorithm swap is behavior-identical. If a `NEW_*` here ever diverges from its
 * shipped counterpart, update it here in lock-step.
 */

// ── OLD (oracle) ────────────────────────────────────────────────────────────
function oldIsSegmentPrefix(current: string, target: string): boolean {
  if (target === '/') return false
  const cs = current.split('/').filter(Boolean)
  const ts = target.split('/').filter(Boolean)
  if (ts.length > cs.length) return false
  return ts.every((seg, i) => seg === cs[i])
}
function oldMatchSegments(current: string, pattern: string, exact: boolean): boolean {
  const cs = current.split('/').filter(Boolean)
  const ps = pattern.split('/').filter(Boolean)
  if (exact) {
    if (cs.length !== ps.length) return false
    return ps.every((seg, i) => seg.startsWith(':') || seg === cs[i])
  }
  if (ps.length > cs.length) return false
  return ps.every((seg, i) => seg.startsWith(':') || seg === cs[i])
}

// ── NEW (mirrors the shipped offset-walk) ────────────────────────────────────
function newIsSegmentPrefix(current: string, target: string): boolean {
  if (target === '/') return false
  let ci = 0
  let ti = 0
  const cl = current.length
  const tl = target.length
  for (;;) {
    while (ci < cl && current.charCodeAt(ci) === 47) ci++
    while (ti < tl && target.charCodeAt(ti) === 47) ti++
    if (ti >= tl) return true
    if (ci >= cl) return false
    let ce = ci
    while (ce < cl && current.charCodeAt(ce) !== 47) ce++
    let te = ti
    while (te < tl && target.charCodeAt(te) !== 47) te++
    const clen = ce - ci
    if (clen !== te - ti) return false
    for (let k = 0; k < clen; k++) {
      if (current.charCodeAt(ci + k) !== target.charCodeAt(ti + k)) return false
    }
    ci = ce
    ti = te
  }
}
function newMatchSegments(current: string, pattern: string, exact: boolean): boolean {
  let ci = 0
  let pi = 0
  const cl = current.length
  const pl = pattern.length
  for (;;) {
    while (ci < cl && current.charCodeAt(ci) === 47) ci++
    while (pi < pl && pattern.charCodeAt(pi) === 47) pi++
    const cHas = ci < cl
    const pHas = pi < pl
    if (!pHas) return exact ? !cHas : true
    if (!cHas) return false
    if (pattern.charCodeAt(pi) === 58) {
      while (ci < cl && current.charCodeAt(ci) !== 47) ci++
      while (pi < pl && pattern.charCodeAt(pi) !== 47) pi++
    } else {
      let ce = ci
      while (ce < cl && current.charCodeAt(ce) !== 47) ce++
      let pe = pi
      while (pe < pl && pattern.charCodeAt(pe) !== 47) pe++
      const clen = ce - ci
      if (clen !== pe - pi) return false
      for (let k = 0; k < clen; k++) {
        if (current.charCodeAt(ci + k) !== pattern.charCodeAt(pi + k)) return false
      }
      ci = ce
      pi = pe
    }
  }
}

// Deterministic path corpus covering the shapes matchSegments/isSegmentPrefix
// see, plus empty-segment edge cases (leading/trailing/double slashes).
const SEGMENTS = ['', 'admin', 'users', 'user', ':id', '42', 'org', ':orgId', 'team', ':teamId', 'a']
function buildPaths(): string[] {
  const paths = new Set<string>(['', '/', '//', '/admin/', '//admin//users//', '/user/42/'])
  for (const a of SEGMENTS) {
    paths.add(`/${a}`)
    for (const b of SEGMENTS) {
      paths.add(`/${a}/${b}`)
      for (const c of ['', 'admin', ':id', 'posts', '42']) paths.add(`/${a}/${b}/${c}`)
    }
  }
  return [...paths]
}

describe('segment matching — zero-alloc rewrite equivalence (differential)', () => {
  const paths = buildPaths()

  it('newMatchSegments ≡ oldMatchSegments over the full matrix (exact + prefix)', () => {
    let checked = 0
    for (const current of paths) {
      for (const pattern of paths) {
        for (const exact of [true, false]) {
          expect(newMatchSegments(current, pattern, exact)).toBe(
            oldMatchSegments(current, pattern, exact),
          )
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(10000)
  })

  it('newIsSegmentPrefix ≡ oldIsSegmentPrefix over the full matrix', () => {
    for (const current of paths) {
      for (const target of paths) {
        expect(newIsSegmentPrefix(current, target)).toBe(oldIsSegmentPrefix(current, target))
      }
    }
  })
})
