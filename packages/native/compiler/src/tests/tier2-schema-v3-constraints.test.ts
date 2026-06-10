// Gap 4 v3 — per-element array constraints + constraints on optional
// fields. Tests verify the emitted parse() applies constraints to
// array elements (z.array(z.string().min(2))) and to optional fields
// when present (z.string().email().optional()).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Gap 4 v3 — per-element array constraints + constraints on optionals', () => {
  // ─────────────────── per-element array constraints (Swift) ───────────────────

  it('Swift: z.array(z.string().min(2)) emits per-element length guard', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  tags: z.array(z.string().min(2)),
}))
`
    const r = transform(src, { target: 'swift' })
    // Field type still List of String
    expect(r.code).toContain('var tags: [String]')
    // For-each loop walks the array and applies the element constraint
    expect(r.code).toContain('for tagsElement in tagsVal')
    expect(r.code).toContain('tagsElement.count < 2')
    expect(r.code).toContain('rule: "min length 2 (element)"')
  })

  it('Swift: z.array(z.string().email()) emits per-element email guard', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  emails: z.array(z.string().email()),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('for emailsElement in emailsVal')
    expect(r.code).toContain('emailsElement.range(of: ')
    expect(r.code).toContain('rule: "email (element)"')
  })

  it('Swift: z.array(z.number().min(0).max(100)) emits per-element numeric guards', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  scores: z.array(z.number().min(0).max(100)),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('for scoresElement in scoresVal')
    expect(r.code).toContain('scoresElement < 0')
    expect(r.code).toContain('scoresElement > 100')
    expect(r.code).toContain('rule: "min 0 (element)"')
    expect(r.code).toContain('rule: "max 100 (element)"')
  })

  it('Swift: array WITHOUT element constraints does NOT emit a for-loop', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  tags: z.array(z.string()),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).not.toContain('for tagsElement')
  })

  // ─────────────────── per-element array constraints (Kotlin) ───────────────────

  it('Kotlin: z.array(z.string().min(2)) emits per-element length guard', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  tags: z.array(z.string().min(2)),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('var tags: List<String>')
    expect(r.code).toContain('for (tagsElement in tagsVal)')
    expect(r.code).toContain('tagsElement.length < 2')
    expect(r.code).toContain('"min length 2 (element)"')
  })

  it('Kotlin: z.array(z.string().email()) emits per-element email guard', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  emails: z.array(z.string().email()),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('for (emailsElement in emailsVal)')
    expect(r.code).toContain('Regex(')
    expect(r.code).toContain('"email (element)"')
  })

  it('Kotlin: z.array(z.number().min(0).max(100)) emits per-element numeric guards', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  scores: z.array(z.number().min(0).max(100)),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('for (scoresElement in scoresVal)')
    expect(r.code).toContain('scoresElement < 0')
    expect(r.code).toContain('scoresElement > 100')
    expect(r.code).toContain('"min 0 (element)"')
    expect(r.code).toContain('"max 100 (element)"')
  })

  it('Kotlin: array WITHOUT element constraints does NOT emit a for-loop', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  tags: z.array(z.string()),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).not.toContain('for (tagsElement')
  })

  // ──────────────────── constraints on optional fields (Swift) ────────────────────

  it('Swift: z.string().min(2).optional() applies constraint inside present-checked block', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  nickname: z.string().min(2).optional(),
}))
`
    const r = transform(src, { target: 'swift' })
    // Field is optional
    expect(r.code).toContain('var nickname: String? = nil')
    // The constraint check is emitted inside the if-let block (deeper indent)
    expect(r.code).toContain('if let raw = input["nickname"]')
    expect(r.code).toContain('nicknameVal.count < 2')
    expect(r.code).toContain('rule: "min length 2"')
  })

  it('Swift: z.string().email().optional() applies email check inside present-checked block', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  contact: z.string().email().optional(),
}))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('var contact: String? = nil')
    expect(r.code).toContain('if let raw = input["contact"]')
    expect(r.code).toContain('contactVal.range(of: ')
    expect(r.code).toContain('rule: "email"')
  })

  it('Swift: z.array(z.string().min(2)).optional() applies element constraint inside present-checked block', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  tags: z.array(z.string().min(2)).optional(),
}))
`
    const r = transform(src, { target: 'swift' })
    // Optional array
    expect(r.code).toContain('var tags: [String]? = nil')
    // Element loop is INSIDE the if-let block
    expect(r.code).toContain('if let raw = input["tags"]')
    expect(r.code).toContain('for tagsElement in tagsVal')
    expect(r.code).toContain('tagsElement.count < 2')
    expect(r.code).toContain('rule: "min length 2 (element)"')
  })

  // ──────────────────── constraints on optional fields (Kotlin) ────────────────────

  it('Kotlin: z.string().min(2).optional() applies constraint with null-guard', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  nickname: z.string().min(2).optional(),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('var nickname: String? = null')
    // Null-guarded constraint check
    expect(r.code).toContain('nicknameVal != null')
    expect(r.code).toContain('"min length 2"')
  })

  it('Kotlin: z.string().email().optional() applies email check with null-guard', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  contact: z.string().email().optional(),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('var contact: String? = null')
    expect(r.code).toContain('contactVal != null')
    expect(r.code).toContain('Regex(')
    expect(r.code).toContain('"email"')
  })

  it('Kotlin: z.array(z.string().min(2)).optional() applies element constraint inside null-guard', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.object({
  tags: z.array(z.string().min(2)).optional(),
}))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('var tags: List<String>? = null')
    // Element loop wrapped in null guard
    expect(r.code).toContain('if (tagsVal != null)')
    expect(r.code).toContain('for (tagsElement in tagsVal)')
    expect(r.code).toContain('tagsElement.length < 2')
  })

  // ──────────────────── cross-cutting ────────────────────

  it('both targets: complex schema with required+optional+arrays+per-element constraints all compose', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const userSchema = zodSchema(z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(50),
  age: z.number().min(0).max(120).optional(),
  emails: z.array(z.string().email()),
  tags: z.array(z.string().min(1)).optional(),
}))
`
    const swift = transform(src, { target: 'swift' })
    // Required scalar with constraint
    expect(swift.code).toContain('idVal')
    expect(swift.code).toContain('UUID(uuidString: idVal)')
    expect(swift.code).toContain('nameVal.count < 2')
    expect(swift.code).toContain('nameVal.count > 50')
    // Optional scalar with constraint inside present-check
    expect(swift.code).toContain('var age: Int? = nil')
    expect(swift.code).toContain('ageVal < 0')
    expect(swift.code).toContain('ageVal > 120')
    // Required array with per-element constraint
    expect(swift.code).toContain('var emails: [String]')
    expect(swift.code).toContain('for emailsElement in emailsVal')
    expect(swift.code).toContain('rule: "email (element)"')
    // Optional array with per-element constraint
    expect(swift.code).toContain('var tags: [String]? = nil')
    expect(swift.code).toContain('for tagsElement in tagsVal')
    expect(swift.code).toContain('rule: "min length 1 (element)"')

    const kotlin = transform(src, { target: 'kotlin' })
    expect(kotlin.code).toContain('idVal')
    expect(kotlin.code).toContain('java.util.UUID.fromString(idVal)')
    expect(kotlin.code).toContain('nameVal.length < 2')
    expect(kotlin.code).toContain('nameVal.length > 50')
    expect(kotlin.code).toContain('var age: Int? = null')
    expect(kotlin.code).toContain('ageVal != null')
    expect(kotlin.code).toContain('var emails: List<String>')
    expect(kotlin.code).toContain('for (emailsElement in emailsVal)')
    expect(kotlin.code).toContain('"email (element)"')
    expect(kotlin.code).toContain('var tags: List<String>? = null')
    expect(kotlin.code).toContain('if (tagsVal != null)')
    expect(kotlin.code).toContain('for (tagsElement in tagsVal)')
    expect(kotlin.code).toContain('"min length 1 (element)"')
  })
})
