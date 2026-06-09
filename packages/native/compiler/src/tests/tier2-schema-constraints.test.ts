// Gap 4 v2.1 — constraint enforcement extracted from Zod modifier
// chains. Tests verify the emitted parse() method enforces .min(),
// .max(), .email(), .url(), .uuid() at runtime.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Gap 4 v2.1 — schema constraint enforcement', () => {
  it('Swift: string .min() and .max() emit length guards', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  name: z.string().min(2).max(50),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('nameVal.count < 2')
    expect(r.code).toContain('nameVal.count > 50')
    expect(r.code).toContain('rule: "min length 2"')
    expect(r.code).toContain('rule: "max length 50"')
  })

  it('Swift: string .email() emits regex check', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const s = zodSchema(z.object({ email: z.string().email() }))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('emailVal.range(of: ')
    expect(r.code).toContain('rule: "email"')
  })

  it('Swift: string .url() emits URL parse check', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const s = zodSchema(z.object({ link: z.string().url() }))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('URL(string: linkVal) == nil')
    expect(r.code).toContain('rule: "url"')
  })

  it('Swift: string .uuid() emits UUID parse check', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const s = zodSchema(z.object({ id: z.string().uuid() }))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('UUID(uuidString: idVal) == nil')
    expect(r.code).toContain('rule: "uuid"')
  })

  it('Swift: number .min() and .max() emit numeric guards', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const s = zodSchema(z.object({ age: z.number().min(0).max(150) }))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('ageVal < 0')
    expect(r.code).toContain('ageVal > 150')
    expect(r.code).toContain('rule: "min 0"')
    expect(r.code).toContain('rule: "max 150"')
  })

  it('Swift: constraintViolation case added to PyreonSchemaError', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const s = zodSchema(z.object({ x: z.string().min(1) }))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('case constraintViolation(field: String, rule: String)')
  })

  it('Kotlin: string .min() and .max() emit length guards', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const s = zodSchema(z.object({ name: z.string().min(2).max(50) }))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('nameVal.length < 2')
    expect(r.code).toContain('nameVal.length > 50')
  })

  it('Kotlin: string .email() emits Regex check', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const s = zodSchema(z.object({ email: z.string().email() }))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('Regex(')
    expect(r.code).toContain('.matches(emailVal)')
  })

  it('Kotlin: ConstraintViolation case added to PyreonSchemaError', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const s = zodSchema(z.object({ x: z.string().min(1) }))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain(
      'data class ConstraintViolation(val field: String, val rule: String)',
    )
  })

  it('No constraints → no runtime constraint throw-sites emitted', () => {
    // (The PyreonSchemaError enum still declares the constraintViolation
    // case — that's harmless. We assert no constraint THROW SITES exist.)
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const s = zodSchema(z.object({
  name: z.string(),
  age: z.number(),
}))
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.code).not.toContain('throw PyreonSchemaError.constraintViolation')
      expect(r.code).not.toContain('throw PyreonSchemaError.ConstraintViolation')
    }
  })

  it('Mixed constrained and unconstrained fields', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const s = zodSchema(z.object({
  required: z.string(),
  email: z.string().email(),
  age: z.number().min(18),
}))
`
    const r = transform(src, { target: 'swift' })
    // The unconstrained `required` field gets no guard
    expect(r.code).toContain('requiredVal')
    expect(r.code).not.toContain('requiredVal.range')
    // The `email` field gets email check
    expect(r.code).toContain('emailVal.range')
    // The `age` field gets min check
    expect(r.code).toContain('ageVal < 18')
  })
})
