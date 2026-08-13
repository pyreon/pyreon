/**
 * The WEB arm of `@pyreon/validation`'s native schema lowering.
 *
 * PMTC turns a top-level `zodSchema(z.object({ … }))` into a Swift struct
 * and a Kotlin data class with real constraint checks. The question those
 * emits have to answer is not "do they compile" but "do they accept and
 * reject exactly what zod does" — and that can only be settled against zod.
 *
 * Two answers here were wrong on device, both in the ACCEPTING direction:
 *
 *   - `.regex()` was dropped entirely (no check, no warning)
 *   - `.url()` used a parser rather than a validator, so "not a url",
 *     "x.com" and "/relative" all passed
 *
 * Native counterpart:
 *   packages/native/compiler/src/tests/native-validation-constraints.test.ts
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

/** Every case the Swift and Kotlin arms are run against. */
const URL_CASES: Array<[string, boolean]> = [
  ['https://x.com', true],
  ['ftp://x.com', true],
  ['mailto:a@b.co', true],
  ['not a url', false],
  ['x.com', false],
  ['/relative', false],
]

describe('.url() is an ABSOLUTE url — a scheme is required', () => {
  const url = z.string().url()

  for (const [input, want] of URL_CASES) {
    it(`${JSON.stringify(input)} → ${want}`, () => {
      expect(url.safeParse(input).success).toBe(want)
    })
  }

  it('the rule is the scheme, which is why mailto: passes and x.com does not', () => {
    // Stated as the invariant rather than a list, because it is what the
    // native emit reproduces: parse succeeds AND a scheme is present.
    expect(url.safeParse('mailto:a@b.co').success).toBe(true)
    expect(url.safeParse('x.com').success).toBe(false)
  })
})

describe('.regex() is a PARTIAL match', () => {
  it('an unanchored pattern matches anywhere in the string', () => {
    // This is why the Kotlin arm uses containsMatchIn rather than matches:
    // `RegExp.test()` does not require the whole string.
    const re = z.string().regex(/abc/)
    expect(re.safeParse('xxabcxx').success).toBe(true)
  })

  it('an anchored pattern still anchors', () => {
    const slug = z.string().regex(/^[a-z0-9-]+$/)
    expect(slug.safeParse('a-valid-slug').success).toBe(true)
    // The case that silently passed on device when the constraint vanished.
    expect(slug.safeParse('Not A Slug!').success).toBe(false)
  })

  it('the `i` flag is case-insensitive matching, nothing more', () => {
    const code = z.string().regex(/^[A-Z]{3}$/i)
    expect(code.safeParse('abc').success).toBe(true)
    expect(code.safeParse('ABCD').success).toBe(false)
  })
})

describe('.email() — the arm that already agreed', () => {
  // Kept because it is the control: the emitted regex was measured against
  // these and matched on all six, so the email path needed no change. A
  // parity suite that only contains failures cannot show that.
  const email = z.string().email()
  const cases: Array<[string, boolean]> = [
    ['a@b.co', true],
    ['UPPER@EXAMPLE.COM', true],
    ['no-at', false],
    ['a@b', false],
    ['a@b.c', false],
    ['a b@c.co', false],
  ]
  for (const [input, want] of cases) {
    it(`${JSON.stringify(input)} → ${want}`, () => {
      expect(email.safeParse(input).success).toBe(want)
    })
  }
})
