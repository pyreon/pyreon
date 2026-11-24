// Email precision tiers (server/client split) + the a@b.c bug-fix regression.
// Pre-2026-06 the default `EMAIL_RE` was the loose `^[^\s@]+@[^\s@]+\.[^\s@]+$`,
// which accepted `a@b.c` (1-char TLD) and most garbage — looser than every
// other major validator.
import { describe, expect, it } from 'vitest'
import { s, string } from '../v1'
import { EMAIL_HTML5_RE, EMAIL_RE, validateEmail } from '../primitives/string'

describe('email — default (standard) tier', () => {
  const schema = s.string().email()
  const accept = ['user@example.com', 'a@b.co', 'user+tag@ex.io', 'first.last@sub.domain.org', "o'brien@mail.com"]
  const reject = ['a@b.c', '.lead@x.com', 'a..b@x.com', 'plainaddr', 'no-at-sign', 'a @b.com', 'a@b', 'foo@bar', '@b.com', 'a@.com', '']

  it.each(accept)('accepts %s', (e) => {
    expect(schema.parse(e).ok).toBe(true)
  })
  it.each(reject)('rejects %s', (e) => {
    expect(schema.parse(e).ok).toBe(false)
  })

  it('REGRESSION: a@b.c (single-char TLD) is rejected (was wrongly accepted pre-fix)', () => {
    expect(schema.parse('a@b.c').ok).toBe(false)
    expect(EMAIL_RE.test('a@b.c')).toBe(false)
  })

  it('emits an invalid_format issue on failure', () => {
    const r = schema.parse('a@b.c')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues).toHaveLength(1)
      expect((r.issues[0] as { code?: string }).code).toBe('invalid_format')
    }
  })
})

describe('email — html5 tier (browser-lenient)', () => {
  const schema = s.string().email({ precision: 'html5' })
  it('accepts a single-char TLD like a@b.c (matches <input type=email>)', () => {
    expect(schema.parse('a@b.c').ok).toBe(true)
    expect(EMAIL_HTML5_RE.test('a@b.c')).toBe(true)
  })
  it('still rejects structurally-invalid input', () => {
    expect(schema.parse('plainaddr').ok).toBe(false)
    expect(schema.parse('a @b.com').ok).toBe(false)
  })
})

describe('email — rfc5322 tier (server-authoritative)', () => {
  const schema = s.string().email({ precision: 'rfc5322' })
  it('accepts a standard address', () => {
    expect(schema.parse('user@example.com').ok).toBe(true)
  })
  it('enforces RFC 5321 local-part length limit (64)', () => {
    expect(schema.parse('a'.repeat(64) + '@b.co').ok).toBe(true)
    expect(schema.parse('a'.repeat(65) + '@b.co').ok).toBe(false)
  })
  it('enforces total-length limit (254)', () => {
    const long = 'a'.repeat(60) + '@' + 'b'.repeat(200) + '.co' // > 254 total
    expect(long.length).toBeGreaterThan(254)
    expect(schema.parse(long).ok).toBe(false)
  })
  it('still rejects what standard rejects (a@b.c)', () => {
    expect(schema.parse('a@b.c').ok).toBe(false)
  })
})

describe('validateEmail — exported helper', () => {
  it('defaults to standard precision', () => {
    expect(validateEmail('a@b.co')).toBe(true)
    expect(validateEmail('a@b.c')).toBe(false)
  })
  it('honors the precision arg', () => {
    expect(validateEmail('a@b.c', 'html5')).toBe(true)
    expect(validateEmail('a@b.c', 'standard')).toBe(false)
    expect(validateEmail('a'.repeat(65) + '@b.co', 'rfc5322')).toBe(false)
  })
  it('custom message/code opts still flow through', () => {
    const schema = string().email({ message: 'bad email', code: 'EMAIL' })
    const r = schema.parse('nope')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues[0]?.message).toBe('bad email')
      expect((r.issues[0] as { code?: string }).code).toBe('EMAIL')
    }
  })
})

// #4821 — an internationalised domain written in its own letters passes at
// every precision, exactly like its DNS/punycode form; invalid SHAPES are still
// refused with Unicode labels, and the local part stays ASCII.
describe('email — internationalised domains (IDN), every tier', () => {
  const PRECISIONS = ['html5', 'standard', 'rfc5322'] as const
  const accept = [
    'jan@müller.de',
    'jan@xn--mller-kva.de',
    'a@пример.рф',
    'user@例え.jp',
    'x@中国.中国',
    'n1@bü-cher.example.com',
    'a@école.fr', // a combining mark after the first char of a label
    'a@ไทย.ไทย', // Thai: letters + non-spacing marks, also in the TLD
    'a@١٢٣.مصر', // Arabic-Indic digits in a label
  ]
  const reject = [
    'jän@müller.de', // non-ASCII local part
    'jan@-müller.de', // label starts with a hyphen
    'jan@́müller.de', // label starts with a combining mark
    'jan@müller..de', // empty label
    'jan@.müller.de',
    'jan@müller.de.', // trailing dot
    'jan@mü ller.de', // space
    'jan@😀.de', // emoji is not a letter
    'jan@müller.d€', // symbol in the TLD
    'jan@@müller.de',
  ]
  for (const precision of PRECISIONS) {
    const schema = s.string().email({ precision })
    it.each(accept)(`${precision} accepts %s`, (e) => {
      expect(schema.parse(e).ok).toBe(true)
      expect(validateEmail(e, precision)).toBe(true)
    })
    it.each(reject)(`${precision} rejects %s`, (e) => {
      expect(schema.parse(e).ok).toBe(false)
      expect(validateEmail(e, precision)).toBe(false)
    })
  }

  it('standard / rfc5322 keep the 2+ char TLD rule with Unicode letters', () => {
    expect(validateEmail('a@b.ü', 'standard')).toBe(false)
    expect(validateEmail('a@b.ü', 'rfc5322')).toBe(false)
    expect(validateEmail('a@b.ü', 'html5')).toBe(true) // html5 allows a 1-char TLD
    expect(validateEmail('a@b.1ü', 'standard')).toBe(false) // TLD letters only
    expect(validateEmail('jan@müller', 'standard')).toBe(false) // a dot is required
    expect(validateEmail('jan@müller', 'html5')).toBe(true) // html5 admits a dotless host, as for ASCII
  })

  it('rfc5322 still enforces the length limits on an IDN address', () => {
    expect(validateEmail('a'.repeat(65) + '@müller.de', 'rfc5322')).toBe(false)
    const long = 'a@' + 'ü'.repeat(250) + '.de'
    expect(long.length).toBeGreaterThan(254)
    expect(validateEmail(long, 'rfc5322')).toBe(false)
    expect(validateEmail(long, 'standard')).toBe(true)
  })

  it('the mini `email()` action and the main chain agree', async () => {
    const { email, string: miniString } = await import('../mini')
    const mini = miniString().check(email())
    expect(mini.parse('jan@müller.de').ok).toBe(true)
    expect(mini.parse('jän@müller.de').ok).toBe(false)
  })
})
