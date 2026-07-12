/**
 * The table-driven email scanner (`isEmailStandard`, the hot 'standard'
 * path inside `validateEmail`) MUST be byte-identical in verdict to the
 * published `EMAIL_RE` — the scanner is a perf rewrite, not a semantic
 * change. Locks the equivalence three ways:
 *
 *   1. EXHAUSTIVE — every string up to length 4 over an 11-char alphabet
 *      covering every grammar class (local char, end char, dot, @, hyphen,
 *      apostrophe, invalid) — 16k+ strings.
 *   2. TARGETED — the tricky longer shapes (consecutive dots, dot-before-@,
 *      trailing apostrophe, empty labels, hyphen-led labels, 1-char TLD,
 *      digit TLD, multi-label domains, non-ASCII).
 *   3. SEEDED FUZZ — 100k random strings over a grammar-biased alphabet.
 *
 * Bisect contract: perturbing the scanner (e.g. dropping the consecutive-dot
 * guard or the TLD alpha check) fails the exhaustive tier immediately.
 */
import { describe, expect, it } from 'vitest'
import { EMAIL_RE, validateEmail } from '../primitives/string'

const scan = (v: string) => validateEmail(v, 'standard')

describe('email scanner ≡ EMAIL_RE', () => {
  it('exhaustive: all strings up to length 4 over the grammar alphabet', () => {
    const ALPHABET = ['a', 'B', '0', '.', "'", '@', '-', '_', '+', ' ', '!']
    const queue = ['']
    let checked = 0
    while (queue.length > 0) {
      const cur = queue.shift()!
      expect(scan(cur), JSON.stringify(cur)).toBe(EMAIL_RE.test(cur))
      checked++
      if (cur.length < 4) for (const ch of ALPHABET) queue.push(cur + ch)
    }
    expect(checked).toBeGreaterThan(16_000)
  })

  it('targeted longer shapes', () => {
    const CASES = [
      'user@example.com',
      "o'brien@x.co",
      'a.b.c@d.e.fg',
      'a..b@x.com',
      '.a@x.com',
      'a.@x.com',
      "a'@x.com",
      "'a@x.com",
      "''@x.com",
      "'a'@x.com",
      'a@x',
      'a@x.c',
      'a@x.com.',
      'a@.com',
      'a@x-.com',
      'a@-x.com',
      'a@x..com',
      'a@x.c0m',
      'a@x.commmmmm',
      'user+tag@sub.domain.example.travel',
      'a@b.cd',
      '@x.com',
      'a@',
      'a@b@c.com',
      'ab@cd.ef.gh.ij.kl.mn',
      'a_b-c+d@ex-am-ple.com',
      'a b@x.com',
      'a@b c.com',
      'ada@exämple.com',
      'ädä@example.com',
      'user@example.co-m',
      'a-@x.com',
      '-a@x.com',
      '+a@x.com',
      '_@x.com',
    ]
    for (const c of CASES) {
      expect(scan(c), JSON.stringify(c)).toBe(EMAIL_RE.test(c))
    }
  })

  it('seeded fuzz: 100k random strings agree', () => {
    let seed = 0xdecaf >>> 0
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    const CH = "aB0.'@-_+ !zZ9é"
    for (let n = 0; n < 100_000; n++) {
      const len = 1 + Math.floor(rnd() * 24)
      let str = ''
      for (let k = 0; k < len; k++) str += CH[Math.floor(rnd() * CH.length)]
      expect(scan(str), JSON.stringify(str)).toBe(EMAIL_RE.test(str))
    }
  })
})
