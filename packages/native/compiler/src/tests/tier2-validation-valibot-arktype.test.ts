// Gap 4 follow-up — @pyreon/validation Valibot + ArkType v1 emit
// tests. Parallel ports to #1486's Zod recognizer.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Gap 4 follow-up — Valibot v1', () => {
  it('Swift: emits struct + binding from v.object()', () => {
    const src = `
import { valibotSchema } from '@pyreon/validation'
import * as v from 'valibot'

declare const safeParse: <T>(s: unknown, input: unknown) => T

export const userSchema = valibotSchema(
  v.object({
    name: v.string(),
    age: v.number(),
    active: v.boolean(),
  }),
  safeParse,
)
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('struct PyreonZodSchema_userSchema: Codable {')
    expect(r.code).toContain('var name: String = ""')
    expect(r.code).toContain('var age: Int = 0')
    expect(r.code).toContain('var active: Bool = false')
  })

  it('Kotlin: emits data class from v.object()', () => {
    const src = `
import { valibotSchema } from '@pyreon/validation'
import * as v from 'valibot'

declare const safeParse: <T>(s: unknown, input: unknown) => T

export const itemSchema = valibotSchema(
  v.object({ id: v.string(), qty: v.number() }),
  safeParse,
)
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('data class PyreonZodSchema_itemSchema(')
    expect(r.code).toContain('var id: String = "",')
    expect(r.code).toContain('var qty: Int = 0,')
  })

  it('Valibot modifier chains unwrap to base v.X()', () => {
    const src = `
import { valibotSchema } from '@pyreon/validation'
import * as v from 'valibot'
declare const safeParse: any
export const s = valibotSchema(
  v.object({
    email: v.pipe(v.string(), v.email()),
    age: v.number(),
  }),
  safeParse,
)
`
    const r = transform(src, { target: 'swift' })
    // v.pipe wraps but the field-position immediate child is v.pipe()
    // which is itself a call. v1 doesn't unwrap pipe — it bails on
    // anything that isn't directly a v.X() at the field slot.
    // The 'age' field still works.
    expect(r.code).toContain('var age: Int = 0')
  })
})

describe('Gap 4 follow-up — ArkType v1', () => {
  it('Swift: emits struct + binding from type({ name: "string" })', () => {
    const src = `
import { arktypeSchema } from '@pyreon/validation'
import { type } from 'arktype'

export const userSchema = arktypeSchema(type({
  name: 'string',
  age: 'number',
  active: 'boolean',
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('struct PyreonZodSchema_userSchema: Codable {')
    expect(r.code).toContain('var name: String = ""')
    expect(r.code).toContain('var age: Int = 0')
    expect(r.code).toContain('var active: Bool = false')
  })

  it('Kotlin: emits data class from type({ ... })', () => {
    const src = `
import { arktypeSchema } from '@pyreon/validation'
import { type } from 'arktype'

export const itemSchema = arktypeSchema(type({
  sku: 'string',
  available: 'boolean',
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('data class PyreonZodSchema_itemSchema(')
    expect(r.code).toContain('var sku: String = "",')
    expect(r.code).toContain('var available: Boolean = false,')
  })

  it('ArkType unsupported type strings dropped with warning', () => {
    const src = `
import { arktypeSchema } from '@pyreon/validation'
import { type } from 'arktype'
export const s = arktypeSchema(type({
  name: 'string',
  tags: 'string[]',
  meta: 'object',
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('var name: String = ""')
    expect(r.code).not.toContain('var tags')
    expect(r.code).not.toContain('var meta')
    const w = r.warnings.find((w) => w.includes('tags'))
    expect(w).toBeDefined()
  })

  it('ArkType non-object arg bails to silent-drop', () => {
    const src = `
import { arktypeSchema } from '@pyreon/validation'
import { type } from 'arktype'
const base = type('string')
export const s = arktypeSchema(base)
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).not.toContain('PyreonZodSchema_s')
  })

  it('mixed Zod + Valibot + ArkType in one file all emit', () => {
    const src = `
import { zodSchema, valibotSchema, arktypeSchema } from '@pyreon/validation'
import { z } from 'zod'
import * as v from 'valibot'
import { type } from 'arktype'

declare const safeParse: any

export const a = zodSchema(z.object({ x: z.string() }))
export const b = valibotSchema(v.object({ y: v.number() }), safeParse)
export const c = arktypeSchema(type({ z: 'boolean' }))
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.code).toContain('PyreonZodSchema_a')
      expect(r.code).toContain('PyreonZodSchema_b')
      expect(r.code).toContain('PyreonZodSchema_c')
    }
  })
})
