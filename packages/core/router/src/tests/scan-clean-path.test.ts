/**
 * `scanCleanPath` frozen-oracle behavior lock.
 *
 * The scan certifies "plain path" (no `%`, no `//`, no trailing slash) and
 * returns the segment count + records the first internal `/` offset — the
 * fast lane's load-bearing gatekeeper. This suite locks its behavior against
 * a FROZEN verbatim copy of the implementation as an oracle, on both outputs
 * (return value AND the `_scanFirstSlash` side channel), over explicit edges
 * + a 5000-path seeded fuzz — so ANY future scan change is differentially
 * checked, not eyeballed.
 *
 * HISTORY: a 2026-07 native-`indexOf` rewrite passed this suite (behavior-
 * identical) but MEASURED SLOWER in a same-conditions A/B (splat +15%,
 * dynamic-1 +15% — JSC's per-call `indexOf` overhead exceeds the JIT'd char
 * loop at 2-6-segment paths) and was reverted; see the negative-result note
 * on `scanCleanPath` itself. BISECT NOTE: with the rewrite in place, removing
 * its `//`-fold made this fuzz fail in bulk — the suite detects behavioral
 * drift, which is its job; it is trivially green when impl === oracle.
 */
import { _scanCleanPathForTest, _scanFirstSlashForTest } from '../match'

/** Verbatim copy of the pre-rewrite char-loop implementation (the oracle). */
function oracleScan(path: string): { count: number; firstSlash: number } {
  const len = path.length
  let count = 0
  let prevSlash = true
  let firstSlash = -1
  for (let i = path.charCodeAt(0) === 47 ? 1 : 0; i < len; i++) {
    const c = path.charCodeAt(i)
    if (c === 47) {
      if (prevSlash) return { count: -1, firstSlash: -2 }
      if (firstSlash < 0) firstSlash = i
      prevSlash = true
    } else {
      if (c === 37) return { count: -1, firstSlash: -2 }
      if (prevSlash) {
        count++
        prevSlash = false
      }
    }
  }
  if (prevSlash && len > 1) return { count: -1, firstSlash: -2 }
  return { count, firstSlash }
}

const scan = (path: string): { count: number; firstSlash: number } => {
  const count = _scanCleanPathForTest(path)
  // `_scanFirstSlash` is only meaningful on success (-1 leaves it stale by
  // contract — the caller never reads it on the -1 branch).
  return { count, firstSlash: count === -1 ? -2 : _scanFirstSlashForTest() }
}

describe('scanCleanPath — explicit edge shapes', () => {
  const CASES = [
    '',
    '/',
    '/a',
    '/about',
    '/a/b',
    '/users/42/posts/7',
    '/files/docs/2020/report-3.pdf',
    'a', // no leading slash
    'a/b',
    '//', // empty segment
    '//about',
    '/a//b',
    '/a/', // trailing slash
    '/about/',
    '/%61bout', // encoded
    '/a%2Fb/c',
    '/a/b%',
    '/héllo/☃', // unicode (plain — no %, //, trailing)
    '/a/b/c/d/e/f/g/h',
  ]
  for (const p of CASES) {
    it(`matches the char-loop oracle for ${JSON.stringify(p)}`, () => {
      expect(scan(p)).toEqual(oracleScan(p))
    })
  }
})

describe('scanCleanPath — seeded differential fuzz vs the char-loop oracle', () => {
  it('5000 generated paths agree on (count, firstSlash)', () => {
    let seed = 0xdecafbad
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 0x100000000
    }
    const atoms = ['a', 'about', 'files', '42', 'x-y_z.ext', '%2F', '%', 'héllo', '☃', '', 'b']
    for (let n = 0; n < 5000; n++) {
      let path = rnd() < 0.9 ? '/' : ''
      const segs = (rnd() * 5) | 0
      for (let s = 0; s < segs; s++) {
        path += atoms[(rnd() * atoms.length) | 0]
        if (s < segs - 1 || rnd() < 0.3) path += '/'
        if (rnd() < 0.08) path += '/' // occasional `//`
      }
      expect(scan(path), `path=${JSON.stringify(path)}`).toEqual(oracleScan(path))
    }
  })
})
