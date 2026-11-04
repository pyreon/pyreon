// Standalone `@pyreon/validate` schema validation lowers to native.
//
// Before this, the ONLY lowered form was the top-level declaration
// `const X = s.object({ … })` (used by `@pyreon/form`). An INLINE standalone
// schema — `s.object({ n: s.number() }).safeParse(x).ok`, the shape real
// feature code writes to validate data — WARNED and emitted verbatim
// (`s.object(...)` — "cannot find 's' in scope"). This closes the biggest
// remaining app-runtime LOGIC gap.
//
// The lowering: the inline `s.object({ … })` is SYNTHESIZED into a
// `PyreonZodSchema_Inline<N>` struct (reusing the Gap-4 field walker), and
// `.safeParse(x)` (one method with `.parse(x)` on the web) lowers to
// `pyreonValidateResult { try <Struct>.parse(<x-as-dictionary>) }`, the library's
// OWN `{ ok, value | issues }` — so a wrapping `.ok` / `.value` / `.issues` composes. The argument is emitted as a native
// DICTIONARY (`[String: Any]` / `Map<String, Any?>`), so validation checks a
// runtime map the way the web `safeParse(unknown)` does.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SCALAR = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
export function App() {
  const ok = computed(() => s.object({ n: s.number() }).safeParse({ n: 1 }).ok)
  return <Text>{ok() ? 'valid' : 'invalid'}</Text>
}`

const MULTI = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
export function App() {
  const ok = computed(() => s.object({ name: s.string(), age: s.number(), active: s.boolean() }).safeParse({ name: 'x', age: 3, active: true }).ok)
  return <Text>{ok() ? 'valid' : 'invalid'}</Text>
}`

describe('@pyreon/validate standalone `.safeParse().success` lowering', () => {
  it('synthesizes a schema struct + the library\'s own { ok, value, issues } result (Swift)', () => {
    const { code, warnings } = transform(SCALAR, { target: 'swift' })
    // No stale "has NO native lowering" warning — the chain lowers.
    expect(warnings.filter((w) => w.includes('@pyreon/validate'))).toHaveLength(0)
    // A synthesized struct with the real field + parse type-check.
    expect(code).toContain('struct PyreonZodSchema_Inline0: Codable')
    expect(code).toContain('var n: Int')
    expect(code).toContain('guard let nVal = input["n"] as? Int else {')
    // The web-faithful result shape + the call it lowers to.
    // The result type is the runtime's (`PyreonSchema.swift`), never per file.
    expect(code).not.toMatch(/struct PyreonValidateResult\b/)
    // `@pyreon/validate`'s OWN result — `{ ok, value | issues }`, never thrown — not zod's `{ success, data }`.
    expect(code).toContain(
      'pyreonValidateResult { try PyreonZodSchema_Inline0.parse(["n": 1] as [String: Any]) }.ok',
    )
    expect(code).not.toContain('safeParseResult')
    // An INLINE schema has NO module-scope instance binding.
    expect(code).not.toContain('let Inline0 = PyreonZodSchema_Inline0()')
    // `.ok` infers Bool, not Any.
    expect(code).toContain('private var ok: Bool')
  })

  it('emits an equivalent data class + the same result (Kotlin)', () => {
    const { code, warnings } = transform(SCALAR, { target: 'kotlin' })
    expect(warnings.filter((w) => w.includes('@pyreon/validate'))).toHaveLength(0)
    expect(code).toContain('data class PyreonZodSchema_Inline0')
    expect(code).toContain('var n: Long')
    expect(code).not.toMatch(/class PyreonValidateResult\b/)
    expect(code).toContain(
      'pyreonValidateResult { PyreonZodSchema_Inline0.parse(mapOf<String, Any?>("n" to 1L)) }.ok',
    )
    expect(code).not.toContain('safeParseResult')
    expect(code).not.toContain('val Inline0 = PyreonZodSchema_Inline0()')
  })

  it('lowers through a RENAMED `s` import — the binding, not the spelling', () => {
    const src = `import { computed } from '@pyreon/reactivity'
import { s as v } from '@pyreon/validate'
export function App() {
  const ok = computed(() => v.object({ n: v.number() }).safeParse({ n: 1 }).ok)
  return <Text>{ok() ? 'y' : 'n'}</Text>
}`
    expect(transform(src, { target: 'swift' }).code).toContain(
      'pyreonValidateResult { try PyreonZodSchema_Inline0.parse(',
    )
  })

  it('DEDUPS two byte-identical inline schemas to ONE struct', () => {
    const src = `import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
export function App() {
  const a = computed(() => s.object({ n: s.number() }).safeParse({ n: 1 }).ok)
  const b = computed(() => s.object({ n: s.number() }).safeParse({ n: 2 }).ok)
  return <Text>{a() && b() ? 'y' : 'n'}</Text>
}`
    const { code } = transform(src, { target: 'swift' })
    expect((code.match(/struct PyreonZodSchema_/g) ?? []).length).toBe(1)
  })

  // The named top-level form (used by @pyreon/form) must be UNTOUCHED — no
  // safeParseResult, keeps its instance binding.
  it('leaves the top-level `const X = s.object(…)` form unchanged', () => {
    const src = `import { s } from '@pyreon/validate'
const userSchema = s.object({ name: s.string(), age: s.number() })
export function App() { return null }`
    const { code } = transform(src, { target: 'swift' })
    expect(code).toContain('let userSchema = PyreonZodSchema_userSchema()')
    expect(code).not.toContain('safeParseResult')
    expect(code).not.toContain('struct PyreonParseResult')
  })

  // Suppression must be TIGHT: a `.parse()` inline (out of v1 scope) OR a
  // non-literal object shape still warns — silent suppression of a broken emit
  // would be worse than the warning.
  it('STILL warns for an inline `s` use that does NOT lower', () => {
    const parseInline = `import { s } from '@pyreon/validate'
export function App() { const ok = s.string().parse('x'); return null }`
    expect(
      transform(parseInline, { target: 'swift' }).warnings.some((w) =>
        w.includes('@pyreon/validate'),
      ),
    ).toBe(true)

    const nonLiteral = `import { s } from '@pyreon/validate'
export function App() { const shape = { n: s.number() }; const ok = s.object(shape).safeParse({ n: 1 }).ok; return null }`
    const nl = transform(nonLiteral, { target: 'swift' })
    expect(nl.warnings.some((w) => w.includes('@pyreon/validate'))).toBe(true)
    expect(nl.code).not.toContain('PyreonZodSchema_')
  })

  it("does NOT hijack a user's own `s.object(...).safeParse(...)` binding", () => {
    const src = `const s = { object: (_x: unknown) => ({ safeParse: (_y: unknown) => ({ success: true }) }) }
export function App() { const ok = s.object({ n: 1 }).safeParse({ n: 1 }).success; return null }`
    expect(transform(src, { target: 'swift' }).code).not.toContain('PyreonZodSchema_')
  })
})

// The load-bearing gate: the emitted native actually COMPILES against real
// swiftc 6.x + kotlinc 2.x. Bisect: disabling the `schema-validate` emit (or
// the `tryInlineValidateSafeParse` interception) leaves `s.object(...)` verbatim
// → "cannot find 's' in scope" → FAIL.
describe('standalone `.safeParse().success` type-checks on both real toolchains', () => {
  for (const [name, src] of Object.entries({ scalar: SCALAR, 'multi-field': MULTI })) {
    it.skipIf(!isSwiftcAvailable())(`${name}: emitted Swift type-checks`, () => {
      const res = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(res.ok, res.error).toBe(true)
    })
    it.skipIf(!isKotlincAvailable())(`${name}: emitted Kotlin type-checks`, () => {
      const res = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(res.ok, res.error).toBe(true)
    })
  }
})
