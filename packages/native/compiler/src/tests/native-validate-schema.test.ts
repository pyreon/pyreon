// `@pyreon/validate`'s `s` DSL lowers to native validators.
//
// This is a Category-C crossing: before it, a native app could not validate
// data at all, and `@pyreon/validate` was one of the four packages whose
// schema DSL emitted verbatim.
//
// It reuses the Gap-4 schema pipeline wholesale (recognizer → ZodSchemaDefnIR
// → Swift struct / Kotlin data class with parse + constraints). The ONE
// structural difference from zod/valibot/arktype is that `s.object({ … })`
// arrives with NO wrapper call — it is already a Standard Schema — which is
// why `tryNamespacedSchemaDefnFromTopLevel` takes a nullable `schemaFn`
// rather than growing a second copy of the field walker.
//
// The 1:1 property is the point: ONE source declaration produces an
// equivalent validator on both targets, so shared source stays shared.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SCHEMA = `import { s } from '@pyreon/validate'
const userSchema = s.object({ name: s.string().min(2), age: s.number(), active: s.boolean() })
export function App() { return null }`

describe('@pyreon/validate `s` DSL lowering', () => {
  it('emits a Codable struct with parse + constraint enforcement (Swift)', () => {
    const { code } = transform(SCHEMA, { target: 'swift' })
    expect(code).toContain('struct PyreonZodSchema_userSchema: Codable')
    expect(code).toContain('var name: String')
    expect(code).toContain('var age: Int')
    expect(code).toContain('var active: Bool')
    // The constraint must survive the modifier chain, not just the base type.
    expect(code).toContain('min length 2')
    expect(code).toContain('static func safeParse')
  })

  it('emits an equivalent data class with parse + constraints (Kotlin)', () => {
    const { code } = transform(SCHEMA, { target: 'kotlin' })
    expect(code).toContain('data class PyreonZodSchema_userSchema')
    expect(code).toContain('var name: String')
    expect(code).toContain('var age: Int')
    expect(code).toContain('var active: Boolean')
    expect(code).toContain('min length 2')
    expect(code).toContain('fun parse(')
  })

  it('lowers through a RENAMED import — the binding, not the spelling', () => {
    const src = `import { s as v } from '@pyreon/validate'
const userSchema = v.object({ name: v.string() })
export function App() { return null }`
    expect(transform(src, { target: 'swift' }).code).toContain('PyreonZodSchema_userSchema')
  })

  // The reason this recognizer gates on the IMPORT rather than the bare name.
  // `zodSchema(...)` is a distinctive wrapper; a lone `s` is not, and claiming
  // it would silently rewrite someone else's code.
  it("does NOT hijack a user's own `s` binding", () => {
    const src = `const s = { object: (x: unknown) => x }
const userSchema = s.object({ name: 1 })
export function App() { return null }`
    const { code } = transform(src, { target: 'swift' })
    expect(code).not.toContain('PyreonZodSchema_userSchema')
  })

  // The stale-entry direction: a warning that fires on code which compiles
  // correctly on both targets is worse than no warning, because it tells the
  // author a working API is unusable.
  it('does NOT warn about `s` when the declaration lowers', () => {
    const { warnings } = transform(SCHEMA, { target: 'swift' })
    expect(warnings.filter((w) => w.includes('@pyreon/validate'))).toHaveLength(0)
  })

  // …but the warning must survive for the forms that genuinely do not lower,
  // or suppressing it would just be a different silent break.
  it('STILL warns for an `s` use that does not lower', () => {
    const src = `import { s } from '@pyreon/validate'
export function App() { const ok = s.string().parse('x'); return null }`
    const { warnings } = transform(src, { target: 'swift' })
    expect(warnings.some((w) => w.includes('@pyreon/validate'))).toBe(true)
  })

  it('produces the same field set on both targets (1:1)', () => {
    const swift = transform(SCHEMA, { target: 'swift' }).code
    const kotlin = transform(SCHEMA, { target: 'kotlin' }).code
    for (const field of ['name', 'age', 'active']) {
      expect(swift).toContain(`var ${field}:`)
      expect(kotlin).toContain(`var ${field}:`)
    }
  })
})

// String LENGTH is not the same operation on the three targets, and the
// difference is not academic:
//
//   JS      "👍".length      === 2   (UTF-16 code units)
//   Kotlin  "👍".length      === 2   (UTF-16 code units)
//   Swift   "👍".count       === 1   (GRAPHEME CLUSTERS)
//
// The emit used Swift's `.count`, so `s.string().min(2)` REJECTED on iOS what
// web and Android accepted — for emoji, combining accents, ZWJ sequences,
// flags, and most non-BMP text. A validator that disagrees per platform is a
// data-integrity bug, not a rounding difference.
//
// The web is the reference implementation: `@pyreon/validate` checks
// `value.length`. So Swift emits `.utf16.count`, which is the same count.
describe('validate string-length constraints are 1:1 across targets', () => {
  const SCHEMA = `import { s } from '@pyreon/validate'
const userSchema = s.object({ name: s.string().min(2).max(5) })
export function App() { return null }`

  it('Swift counts UTF-16 units, matching JS and Kotlin — not graphemes', () => {
    const { code } = transform(SCHEMA, { target: 'swift' })
    expect(code).toContain('.utf16.count < 2')
    expect(code).toContain('.utf16.count > 5')
    // The grapheme form is the bug; it must not come back.
    expect(code).not.toMatch(/\bnameVal\.count [<>]/)
  })

  it('Kotlin already counts UTF-16 units', () => {
    const { code } = transform(SCHEMA, { target: 'kotlin' })
    expect(code).toContain('.length < 2')
    expect(code).toContain('.length > 5')
  })
})
