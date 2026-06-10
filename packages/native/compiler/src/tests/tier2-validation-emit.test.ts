// Gap 4 follow-up — @pyreon/validation v1 emit tests (Zod-schema).
//
// v1 ports `const X = zodSchema(z.object({ ... }))` at top level
// with the simplest field shapes (z.string / z.number / z.boolean).
// Schema modifier chains (.min/.max/.email/...) accepted at AST
// level; constraints NOT enforced in v1 (shape only).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

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
