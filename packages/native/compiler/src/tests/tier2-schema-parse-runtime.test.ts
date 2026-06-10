// Gap 4 v2 — runtime parse() / safeParse() methods on emitted
// schema structs. Each schema (Zod / Valibot / ArkType) gets
// type-checking parse + safeParse static methods that return the
// validated struct or PyreonSchemaError on failure.
//
// v1 was shape-only (struct + binding). v2 adds the validation
// runtime so apps can `try schema.parse(jsonDict)` to get a
// typed validated result at network-decode time.

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

describe('Gap 4 v2 — schema parse runtime', () => {
  it('Swift: emits parse() static method on each schema', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('static func parse(_ input: [String: Any]) throws -> Self {')
    expect(r.code).toContain('guard let nameVal = input["name"] as? String else {')
    expect(r.code).toContain('throw PyreonSchemaError.missingOrWrongType(field: "name", expected: "String")')
    expect(r.code).toContain('result.name = nameVal')
    expect(r.code).toContain('return result')
  })

  it('Swift: emits safeParse() that wraps parse() in Result', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('static func safeParse(_ input: [String: Any]) -> Result<Self, PyreonSchemaError>')
    expect(r.code).toContain('do { return .success(try parse(input)) }')
    expect(r.code).toContain('catch let e as PyreonSchemaError { return .failure(e) }')
  })

  it('Swift: emits shared PyreonSchemaError enum ONCE per file', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const a = zodSchema(z.object({ x: z.string() }))
export const b = zodSchema(z.object({ y: z.number() }))
`
    const r = transform(src, { target: 'swift' })
    const matches = r.code.match(/enum PyreonSchemaError: Error/g) ?? []
    expect(matches.length).toBe(1)
    // Both schemas reference it.
    expect(r.code).toContain('PyreonZodSchema_a')
    expect(r.code).toContain('PyreonZodSchema_b')
  })

  it('Kotlin: emits parse() companion method', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('companion object {')
    expect(r.code).toContain('fun parse(input: Map<String, Any?>): PyreonZodSchema_userSchema')
    expect(r.code).toContain('val nameVal = (input["name"] as? String)')
    expect(r.code).toContain('?: throw PyreonSchemaError.MissingOrWrongType("name", "String")')
  })

  it('Kotlin: emits safeParse() companion method using Result<T>', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('fun safeParse(input: Map<String, Any?>): Result<PyreonZodSchema_userSchema>')
    expect(r.code).toContain('Result.success(parse(input))')
    expect(r.code).toContain('Result.failure(e)')
  })

  it('Kotlin: emits shared PyreonSchemaError sealed class ONCE per file', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const a = zodSchema(z.object({ x: z.string() }))
export const b = zodSchema(z.object({ y: z.number() }))
`
    const r = transform(src, { target: 'kotlin' })
    const matches = r.code.match(/sealed class PyreonSchemaError/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('NO schemas → NO PyreonSchemaError emitted (zero-cost)', () => {
    const src = `
import { Stack, Text } from '@pyreon/primitives'
export function App() { return <Stack><Text>x</Text></Stack> }
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.code).not.toContain('PyreonSchemaError')
    }
  })

  it('parse() handles all 3 v1 types (string / number / boolean)', () => {
    const r = transform(SRC, { target: 'swift' })
    // All three field types get their own guard.
    expect(r.code).toContain('as? String')
    expect(r.code).toContain('as? Int')
    expect(r.code).toContain('as? Bool')
  })

  it('Valibot + ArkType schemas get the same parse() runtime', () => {
    const src = `
import { valibotSchema, arktypeSchema } from '@pyreon/validation'
import * as v from 'valibot'
import { type } from 'arktype'
declare const safeParse: any
export const a = valibotSchema(v.object({ x: v.string() }), safeParse)
export const b = arktypeSchema(type({ y: 'number' }))
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      // Both schemas got parse() methods regardless of validator origin.
      if (target === 'swift') {
        const parseFns = r.code.match(/static func parse\(_ input: \[String: Any\]\)/g) ?? []
        expect(parseFns.length).toBe(2)
      } else {
        const parseFns = r.code.match(/fun parse\(input: Map<String, Any\?>\)/g) ?? []
        expect(parseFns.length).toBe(2)
      }
    }
  })
})
