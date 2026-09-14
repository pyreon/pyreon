// Branch matrices for the Swift `@pyreon/validate` / zodSchema emit: the
// field-type table, the per-field default, the scalar constraint guards, and
// the array-element loop.
//
// These are the one place PMTC emits a VALIDATOR rather than a view, so a
// wrong arm is a data-integrity bug: the native app accepts input the web
// rejects (or the reverse) from the same schema. The `.utf16.count` choice is
// the worked example — Swift's `String.count` counts GRAPHEME CLUSTERS while
// JS and Kotlin `.length` count UTF-16 units, so `min(2)` against "👍" passes
// on web/Android and failed on iOS.
//
// Every guard is paired with the field shape that must emit NO guard: a
// boolean field (no scalar constraints exist), an unconstrained array, and an
// array whose elements are OBJECTS (validated by the nested schema's own
// parse, never by an element loop).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' }).code

const V = `import { s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
`
const APP = `
export function App() {
  const r = Sch.safeParse({ flag: true })
  return (<Stack><Text>{String(r.success)}</Text></Stack>)
}`

describe('scalar constraint guards — one arm per rule, per type', () => {
  const out = swift(
    V + `export const Sch = s.object({
  name: s.string().min(2).max(10),
  mail: s.string().email(),
  site: s.string().url(),
  uid: s.string().uuid(),
  age: s.number().min(1).max(99),
  flag: s.boolean(),
})` + APP,
  )

  it('STRING min/max measure UTF-16 units, matching JS and Kotlin `.length`', () => {
    // `.count` would count grapheme clusters and make iOS disagree with both
    // other platforms on the same schema.
    expect(out).toContain('if nameVal.utf16.count < 2 {')
    expect(out).toContain('if nameVal.utf16.count > 10 {')
    expect(out).not.toContain('nameVal.count <')
    expect(out).toContain('rule: "min length 2"')
    expect(out).toContain('rule: "max length 10"')
  })

  it('email / url / uuid each get their own check', () => {
    expect(out).toContain('mailVal.range(of: #"^[A-Z0-9._%+-]+@')
    expect(out).toContain('rule: "email"')
    // `URL(string:)` alone is a PARSER, not a validator — the scheme check
    // is what rejects "x.com" and "/relative" the way zod does.
    expect(out).toContain('if URL(string: siteVal)?.scheme == nil {')
    expect(out).toContain('rule: "url"')
    expect(out).toContain('if UUID(uuidString: uidVal) == nil {')
    expect(out).toContain('rule: "uuid"')
  })

  it('NUMBER min/max are plain comparisons, not the string-length ones', () => {
    expect(out).toContain('if ageVal < 1 {')
    expect(out).toContain('if ageVal > 99 {')
    expect(out).toContain('rule: "min 1"')
    expect(out).toContain('rule: "max 99"')
  })

  it('a BOOLEAN field gets NO constraint guard — the scalar emit bails on it', () => {
    expect(out).toContain('var flag: Bool = false')
    expect(out).not.toContain('field: "flag", rule:')
  })
})

describe('array element constraints — the loop, and the three shapes that skip it', () => {
  it('a CONSTRAINED scalar element array emits the per-element loop with a suffixed rule', () => {
    const out = swift(
      V + `export const Sch = s.object({
  tags: s.array(s.string().min(3)),
  nums: s.array(s.number().max(5)),
})` + APP,
    )
    expect(out).toContain('for tagsElement in tagsVal {')
    expect(out).toContain('rule: "min length 3 (element)"')
    expect(out).toContain('for numsElement in numsVal {')
    expect(out).toContain('rule: "max 5 (element)"')
  })

  it('an UNCONSTRAINED array, a SCALAR field and an OBJECT-element array emit no loop', () => {
    const out = swift(
      `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const Sch = zodSchema(z.object({
  plain: z.array(z.string()),
  flag: z.boolean(),
  many: z.array(z.object({ w: z.number() })),
}))`,
    )
    expect(out).toContain('var plain: [String] = []')
    expect(out).not.toContain('for plainElement in')
    expect(out).not.toContain('for flagElement in')
    // object elements validate through the nested schema's own parse()
    expect(out).not.toContain('for manyElement in')
  })
})

describe('the field-type table and its per-field defaults', () => {
  it('scalars, arrays-of-scalar, nested objects and arrays-of-object each get their own type + seed', () => {
    const out = swift(
      `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const Sch = zodSchema(z.object({
  a: z.string(),
  b: z.number(),
  c: z.boolean(),
  d: z.array(z.string()),
  e: z.array(z.number()),
  f: z.array(z.boolean()),
  nested: z.object({ q: z.string() }),
  many: z.array(z.object({ w: z.number() })),
}))`,
    )
    expect(out).toContain('var a: String = ""')
    expect(out).toContain('var b: Int = 0')
    expect(out).toContain('var c: Bool = false')
    expect(out).toContain('var d: [String] = []')
    expect(out).toContain('var e: [Int] = []')
    expect(out).toContain('var f: [Bool] = []')
    // a nested object names its OWN synthesized schema struct, and seeds with
    // that struct's default init rather than a scalar zero
    expect(out).toContain('var nested: PyreonZodSchema_Sch_Nested = PyreonZodSchema_Sch_Nested()')
    expect(out).toContain('var many: [PyreonZodSchema_Sch_Many_Item] = []')
    expect(out).toContain('struct PyreonZodSchema_Sch_Nested: Codable')
    expect(out).toContain('struct PyreonZodSchema_Sch_Many_Item: Codable')
  })
})

describe('discriminated union — the case name is the discriminator value, lower-first', () => {
  it('a normal variant name lowercases only its first character', () => {
    const out = swift(
      `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const U = zodSchema(z.discriminatedUnion('type', [
  z.object({ type: z.literal('Circle'), r: z.number() }),
  z.object({ type: z.literal('sq_box'), side: z.number() }),
]))`,
    )
    expect(out).toContain('case circle(PyreonZodSchema_U_Circle)')
    // already lower-first → unchanged, underscores and all
    expect(out).toContain('case sq_box(PyreonZodSchema_U_Sq_box)')
  })

  it.fails(
    'KNOWN BUG: an EMPTY discriminator literal emits a NAMELESS enum case — `case (PyreonZodSchema_U_)`, which is not parseable Swift, with no warning. `camelCase("")` returns "" by its own length guard and nothing downstream rejects it. Fix: refuse (or name) a variant whose discriminator literal is empty at the schema recognizer, the way every other unparseable variant shape is already dropped with a warning.',
    () => {
      const r = transform(
        `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const U = zodSchema(z.discriminatedUnion('type', [
  z.object({ type: z.literal(''), n: z.number() }),
]))`,
        { target: 'swift' },
      )
      const nameless = /case \(PyreonZodSchema_U_\)/.test(r.code)
      expect(nameless && r.warnings.length === 0).toBe(false)
    },
  )
})
