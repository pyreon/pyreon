// `@pyreon/validation`'s schema lowering accepted data the web rejects, and
// told you it did not lower at all while visibly lowering.
//
// 1. `.regex()` was SILENTLY DROPPED. The constraint walker recognised
//    min/max/email/url/uuid and had no `regex` arm, so the modifier fell
//    through its `else if` chain: the field emitted with only a type guard,
//    no check and no diagnostic. A schema that rejects "Not A Slug!" on the
//    web ACCEPTED it on device.
//
// 2. `.url()` used `URL(string:)` / `java.net.URI(...)`, which PARSE rather
//    than validate. Measured against zod, four of six cases diverged and
//    every one of them in the accepting direction — "not a url", "x.com"
//    and "/relative" all passed on device. Requiring a scheme reproduces
//    zod's rule while still accepting "mailto:…" and "ftp://…" as zod does.
//
// 3. The blanket "zodSchema has NO native lowering … the native build fails
//    with cannot find 'zodSchema' in scope" warning printed directly ABOVE
//    the native struct it was denying, and its advice sent the author to a
//    `<Web>` escape hatch for code that works.
//
// The regex arm is deliberately conservative: JS, NSRegularExpression and
// java.util.regex agree on the common syntax and diverge on the rest, so
// anything carrying a non-portable flag or construct declines BY NAME. A
// declined field is no worse off than before — it is just no longer silent.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const schema = (fields: string) => `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { Text } from '@pyreon/primitives'
const User = zodSchema(z.object({ ${fields} }))
export function App() { return <Text>x</Text> }`

const APP = schema(
  "site: z.string().url(), slug: z.string().regex(/^[a-z0-9-]+$/), code: z.string().regex(/^[A-Z]{3}$/i)",
)

describe('.regex() reaches the emit instead of vanishing', () => {
  it('Swift emits a partial-match test, raw-stringed', () => {
    const out = transform(APP, { target: 'swift' }).code
    // Partial match is what `RegExp.test()` does on the web; an anchored
    // pattern still anchors.
    expect(out).toContain('slugVal.range(of: #"^[a-z0-9-]+$"#, options: [.regularExpression])')
    expect(out).toContain('rule: "regex"')
  })

  it('Kotlin emits containsMatchIn, not matches', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    // `matches` requires a FULL match and would reject strings the web accepts.
    expect(out).toContain('Regex("^[a-z0-9-]+$").containsMatchIn(slugVal)')
    expect(out).not.toContain('Regex("^[a-z0-9-]+$").matches(')
  })

  it('the `i` flag carries to both engines', () => {
    expect(transform(APP, { target: 'swift' }).code).toContain(
      '[.regularExpression, .caseInsensitive]',
    )
    expect(transform(APP, { target: 'kotlin' }).code).toContain('RegexOption.IGNORE_CASE')
  })
})

describe('a pattern that would not port declines by name', () => {
  const declines = (fields: string) =>
    transform(schema(fields), { target: 'swift' }).warnings.join('\n')

  it('names a non-portable flag', () => {
    const w = declines('x: z.string().regex(/a/g)')
    expect(w).toContain('`g`')
    expect(w).toContain('NOT validated on device')
  })

  it('names lookbehind / named groups / Unicode property escapes', () => {
    expect(declines('x: z.string().regex(/(?<=b)c/)')).toContain('lookbehind')
    expect(declines(String.raw`x: z.string().regex(/\p{L}/)`)).toContain('lookbehind')
  })

  it('names a non-literal argument', () => {
    expect(declines('x: z.string().regex(SOME_RE)')).toContain('regular-expression literal')
  })

  // The whole point of declining: a dropped constraint must not be silent.
  it('a declined pattern emits NO check rather than a wrong one', () => {
    const out = transform(schema('x: z.string().regex(/a/g)'), { target: 'swift' }).code
    expect(out).not.toContain('rule: "regex"')
  })
})

describe('.url() requires a scheme, as zod does', () => {
  // Measured against zod: "not a url" / "x.com" / "/relative" are rejected;
  // "mailto:a@b.co" / "ftp://x.com" / "https://x.com" are accepted. A bare
  // parse accepted all six.
  it('Swift checks the scheme, not merely that it parses', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('URL(string: siteVal)?.scheme == nil')
    expect(out).not.toContain('if URL(string: siteVal) == nil')
  })

  it('Kotlin checks the scheme, not merely that it parses', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('.scheme')
    expect(out).toContain('"url"')
  })
})

describe('a schema that lowers does not claim it does not', () => {
  it('a top-level zodSchema() declaration emits no unlowered-module warning', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(APP, { target })
      expect(r.warnings).toEqual([])
      // …and the thing the warning used to deny is right there.
      expect(r.code).toContain('PyreonZodSchema_User')
    }
  })

  it('the advice no longer sends a working schema to a <Web> escape hatch', () => {
    // An IMPORT with no lowering declaration still warns — the suppression
    // is keyed on a schema actually being declared, not on the import.
    const w = transform(
      `import { standardSchemaToValidator } from '@pyreon/validation'
       export function App() { return <Text>{String(standardSchemaToValidator)}</Text> }`,
      { target: 'swift' },
    ).warnings.join('\n')
    expect(w).toContain('@pyreon/validation')
  })
})

describe('the emitted schema survives the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin compiles on kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
