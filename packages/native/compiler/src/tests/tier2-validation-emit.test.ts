// Gap 4 follow-up — @pyreon/validation v1 emit tests (Zod-schema).
//
// v1 ports `const X = zodSchema(z.object({ ... }))` at top level
// with the simplest field shapes (z.string / z.number / z.boolean).
// Schema modifier chains (.min/.max/.email/...) accepted at AST
// level; constraints NOT enforced in v1 (shape only).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwiftWithStubs } from '../validate'

const SRC = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  name: z.string(),
  age: z.number(),
  active: z.boolean(),
}))
`

describe('Gap 4 follow-up — @pyreon/validation v1 emit (Zod)', () => {
  it('Swift: emits Codable struct + const binding', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('struct PyreonZodSchema_userSchema: Codable {')
    expect(r.code).toContain('var name: String = ""')
    expect(r.code).toContain('var age: Int = 0')
    expect(r.code).toContain('var active: Bool = false')
    expect(r.code).toContain('let userSchema = PyreonZodSchema_userSchema()')
  })

  it('Kotlin: emits data class + val binding', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('data class PyreonZodSchema_userSchema(')
    expect(r.code).toContain('var name: String = "",')
    expect(r.code).toContain('var age: Int = 0,')
    expect(r.code).toContain('var active: Boolean = false,')
    expect(r.code).toContain('val userSchema = PyreonZodSchema_userSchema()')
  })

  it('Schema modifier chains unwrap to base z.X()', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  email: z.string().email().min(5).max(254),
  age: z.number().min(0).max(150),
  active: z.boolean(),
}))
`
    const r = transform(src, { target: 'swift' })
    // Modifiers are stripped; the base z.X() shape determines the field type.
    expect(r.code).toContain('var email: String = ""')
    expect(r.code).toContain('var age: Int = 0')
    expect(r.code).toContain('var active: Bool = false')
  })

  it('Unsupported z.method() fields are dropped with warning', () => {
    // v2.2: z.array(z.X()) is now SUPPORTED for primitive element types
    // (string/number/boolean) — see tier2-schema-arrays-optional.test.ts.
    // z.record() and other compound shapes remain unsupported and dropped
    // with a warning, asserted here.
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  name: z.string(),
  meta: z.record(z.string()),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('var name: String = ""')
    expect(r.code).not.toContain('var meta')
    const recordW = r.warnings.find(
      (w) => w.includes('meta') && w.includes('z.record'),
    )
    expect(recordW).toBeDefined()
  })

  it('Non-z.object() arg falls back to silent-drop', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

const baseSchema = z.string()
export const userSchema = zodSchema(baseSchema)
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).not.toContain('PyreonZodSchema_userSchema')
  })

  it('Multiple zodSchema sites emit independent structs', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({ name: z.string() }))
export const itemSchema = zodSchema(z.object({ id: z.string(), qty: z.number() }))
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.code).toContain('PyreonZodSchema_userSchema')
      expect(r.code).toContain('PyreonZodSchema_itemSchema')
    }
  })

  it('NO zodSchema sites → no PyreonZodSchema_ emit', () => {
    const src = `
import { Stack, Text } from '@pyreon/primitives'
export function App() { return <Stack><Text>x</Text></Stack> }
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.code).not.toContain('PyreonZodSchema_')
    }
  })
})

/**
 * Declining is right; declining SILENTLY is not.
 *
 * Every schema recognizer keys on the INLINE argument, so the ordinary
 * refactor of lifting a schema to its own const — `const base = z.string()`
 * then `zodSchema(base)` — matches none of them. That part is correct:
 * synthesizing a struct from an unresolved binding would be a guess. But the
 * node then fell through to a VERBATIM emit, and `z` / `type` exist in neither
 * Swift nor Kotlin, so the generated file failed to compile with nothing said
 * at emit time.
 *
 * The spec above ("does not lower an indirect schema reference") asserts the
 * right invariant and is kept unchanged — it was simply silent about what got
 * emitted instead. This is the missing half.
 *
 * Found by compiling all 103 shared-source fixtures across the tier2 emit
 * suites: 4 of 206 compiles failed with NO warning, and they were these two
 * shapes. The suites make almost no toolchain calls, so a string assertion was
 * the only thing standing between this and a user.
 */
describe('@pyreon/validation — an un-lowered adapter call is DECLINED BY NAME', () => {
  const indirect = (adapter: string, lib: string, ctor: string) => `
import { ${adapter} } from '@pyreon/validation'
import { ${lib} } from '${lib === 'z' ? 'zod' : lib === 'v' ? 'valibot' : 'arktype'}'
const base = ${ctor}
export const mySchema = ${adapter}(base)
`

  it.each([
    ['zodSchema', 'z', 'z.string()'],
    ['arktypeSchema', 'type', "type('string')"],
  ])('%s warns naming the binding on both targets', (adapter, lib, ctor) => {
    for (const target of ['swift', 'kotlin'] as const) {
      const w = (transform(indirect(adapter, lib, ctor), { target }).warnings ?? []) as string[]
      expect(w.some((m) => m.includes(adapter) && m.includes('mySchema'))).toBe(true)
    }
  })

  it('the SUPPORTED inline shape stays warning-free', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const userSchema = zodSchema(z.object({ name: z.string() }))
`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).warnings ?? []).toEqual([])
    }
  })

  it.runIf(isSwiftcAvailable())(
    'the warning is accurate: the un-lowered emit really does fail to compile',
    async () => {
      const code = transform(indirect('zodSchema', 'z', 'z.string()'), { target: 'swift' }).code
      const r = await validateSwiftWithStubs(code)
      expect(r.ok).toBe(false)
      expect(r.error ?? '').toContain("cannot find 'z' in scope")
    },
  )
})
