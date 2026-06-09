// Gap 4 v2.2 — compound array element types (z.array(z.X())) and
// optional/nullable fields (.optional(), .nullable()). Tests verify
// emitted Swift/Kotlin types and parse() behavior for these shapes.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Gap 4 v2.2 — schema arrays + optional/nullable', () => {
  // ───────────────────────────────── Swift ─────────────────────────────────

  it('Swift: z.array(z.string()) emits [String]', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  tags: z.array(z.string()),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('var tags: [String]')
    // parse() casts the input to [String] with the same MissingOrWrongType throw
    expect(r.code).toContain('input["tags"] as? [String]')
    expect(r.code).toContain('field: "tags"')
  })

  it('Swift: z.array(z.number()) emits [Int]', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  scores: z.array(z.number()),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('var scores: [Int]')
    expect(r.code).toContain('input["scores"] as? [Int]')
  })

  it('Swift: z.array(z.boolean()) emits [Bool]', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  flags: z.array(z.boolean()),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('var flags: [Bool]')
    expect(r.code).toContain('input["flags"] as? [Bool]')
  })

  it('Swift: .optional() field emits optional Swift type with nil default', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  nickname: z.string().optional(),
}))
`
    const r = transform(src, { target: 'swift' })
    // Field declaration: optional type with nil default
    expect(r.code).toContain('var nickname: String? = nil')
    // parse() uses present-checked branch (not the required-or-throw shape)
    expect(r.code).toContain('if let raw = input["nickname"]')
  })

  it('Swift: .nullable() field is treated as optional', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  bio: z.string().nullable(),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('var bio: String? = nil')
    expect(r.code).toContain('if let raw = input["bio"]')
  })

  it('Swift: mixed optional + required fields generate both shapes', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  email: z.string(),
  nickname: z.string().optional(),
}))
`
    const r = transform(src, { target: 'swift' })
    // Required field: non-optional + required-or-throw shape
    expect(r.code).toContain('var email: String = ""')
    expect(r.code).toContain(
      'guard let emailVal = input["email"] as? String else',
    )
    // Optional field: nullable + present-checked shape
    expect(r.code).toContain('var nickname: String? = nil')
    expect(r.code).toContain('if let raw = input["nickname"]')
  })

  // ───────────────────────────────── Kotlin ────────────────────────────────

  it('Kotlin: z.array(z.string()) emits List<String>', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  tags: z.array(z.string()),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('var tags: List<String>')
    expect(r.code).toContain('input["tags"] as? List<String>')
  })

  it('Kotlin: z.array(z.number()) emits List<Int>', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  scores: z.array(z.number()),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('var scores: List<Int>')
    expect(r.code).toContain('input["scores"] as? List<Int>')
  })

  it('Kotlin: z.array(z.boolean()) emits List<Boolean>', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  flags: z.array(z.boolean()),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('var flags: List<Boolean>')
    expect(r.code).toContain('input["flags"] as? List<Boolean>')
  })

  it('Kotlin: .optional() field emits nullable type with null default', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  nickname: z.string().optional(),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('var nickname: String? = null')
    // parse() uses containsKey-gated branch (not the unconditional cast-or-throw)
    expect(r.code).toContain('input.containsKey("nickname")')
  })

  it('Kotlin: .nullable() field is treated as optional', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  bio: z.string().nullable(),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('var bio: String? = null')
    expect(r.code).toContain('input.containsKey("bio")')
  })

  it('Kotlin: mixed optional + required fields generate both shapes', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  email: z.string(),
  nickname: z.string().optional(),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('var email: String = ""')
    expect(r.code).toContain('input["email"] as? String')
    expect(r.code).toContain('var nickname: String? = null')
    expect(r.code).toContain('input.containsKey("nickname")')
  })

  // ───────────────────────────── Cross-target ─────────────────────────────

  it('both targets: array field bypasses string/number constraint checks', () => {
    // Constraint emission is guarded on f.type === 'string' || 'number';
    // array types must not trigger constraint-violation throws for the
    // ARRAY itself. (Per-element constraints are a v3 enhancement.)
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  tags: z.array(z.string()),
}))
`
    const swift = transform(src, { target: 'swift' })
    const kotlin = transform(src, { target: 'kotlin' })
    // No constraint-violation throw on the array itself in either emit
    expect(swift.code).not.toContain('tagsVal.count < ')
    expect(swift.code).not.toContain('tagsVal.count > ')
    expect(kotlin.code).not.toContain('tagsVal.length < ')
    expect(kotlin.code).not.toContain('tagsVal.length > ')
  })

  it('both targets: combined arrays + optionals + scalars compile cleanly', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  id: z.string(),
  name: z.string().min(2),
  age: z.number().optional(),
  tags: z.array(z.string()),
  notes: z.array(z.string()).optional(),
}))
`
    const swift = transform(src, { target: 'swift' })
    expect(swift.code).toContain('var id: String')
    expect(swift.code).toContain('var name: String')
    expect(swift.code).toContain('var age: Int? = nil')
    expect(swift.code).toContain('var tags: [String]')
    expect(swift.code).toContain('var notes: [String]? = nil')
    // The .min(2) on name still emits its constraint
    expect(swift.code).toContain('nameVal.count < 2')

    const kotlin = transform(src, { target: 'kotlin' })
    expect(kotlin.code).toContain('var id: String')
    expect(kotlin.code).toContain('var name: String')
    expect(kotlin.code).toContain('var age: Int? = null')
    expect(kotlin.code).toContain('var tags: List<String>')
    expect(kotlin.code).toContain('var notes: List<String>? = null')
    expect(kotlin.code).toContain('nameVal.length < 2')
  })
})
