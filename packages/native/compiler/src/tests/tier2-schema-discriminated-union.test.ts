// Gap 4 v3.3 — discriminated unions. Tests verify:
//   1. `z.discriminatedUnion('field', [z.object(...), ...])` emits as
//      a Swift enum with associated values / Kotlin sealed class.
//   2. Each variant is emitted as its own aux struct/data class.
//   3. parse() dispatches on the discriminator value.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Gap 4 v3.3 — discriminated unions', () => {
  // ─────────────────── Swift ───────────────────

  it('Swift: z.discriminatedUnion emits as enum with per-variant case', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const animalSchema = zodSchema(z.discriminatedUnion('type', [
  z.object({ type: z.literal('cat'), meows: z.boolean() }),
  z.object({ type: z.literal('dog'), barks: z.boolean() }),
]))
`
    const r = transform(src, { target: 'swift' })
    // Enum shape
    expect(r.code).toContain('enum PyreonZodSchema_animalSchema {')
    expect(r.code).toContain('case cat(PyreonZodSchema_animalSchema_Cat)')
    expect(r.code).toContain('case dog(PyreonZodSchema_animalSchema_Dog)')
    // Each variant emitted as its own struct
    expect(r.code).toContain('struct PyreonZodSchema_animalSchema_Cat')
    expect(r.code).toContain('struct PyreonZodSchema_animalSchema_Dog')
    expect(r.code).toContain('var meows: Bool')
    expect(r.code).toContain('var barks: Bool')
  })

  it('Swift: parse() dispatches on discriminator via switch', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('a'), x: z.string() }),
  z.object({ kind: z.literal('b'), y: z.number() }),
]))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('input["kind"] as? String')
    expect(r.code).toContain('switch discr {')
    expect(r.code).toContain('case "a":')
    expect(r.code).toContain('return .a(try PyreonZodSchema_s_A.parse(input))')
    expect(r.code).toContain('case "b":')
    expect(r.code).toContain('return .b(try PyreonZodSchema_s_B.parse(input))')
    expect(r.code).toContain('default:')
    expect(r.code).toContain('"unknown discriminator value"')
  })

  it('Swift: variants emit their own struct fields correctly', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const eventSchema = zodSchema(z.discriminatedUnion('event', [
  z.object({ event: z.literal('click'), x: z.number(), y: z.number() }),
  z.object({ event: z.literal('focus'), targetId: z.string() }),
]))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('struct PyreonZodSchema_eventSchema_Click')
    // Click variant fields
    expect(r.code).toContain('var x: Int')
    expect(r.code).toContain('var y: Int')
    // Focus variant
    expect(r.code).toContain('struct PyreonZodSchema_eventSchema_Focus')
    expect(r.code).toContain('var targetId: String')
  })

  it('Swift: 3-variant union emits 3 cases + 3 structs', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('a'), x: z.string() }),
  z.object({ kind: z.literal('b'), y: z.number() }),
  z.object({ kind: z.literal('c'), z: z.boolean() }),
]))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('case a(PyreonZodSchema_s_A)')
    expect(r.code).toContain('case b(PyreonZodSchema_s_B)')
    expect(r.code).toContain('case c(PyreonZodSchema_s_C)')
    expect(r.code).toContain('struct PyreonZodSchema_s_A')
    expect(r.code).toContain('struct PyreonZodSchema_s_B')
    expect(r.code).toContain('struct PyreonZodSchema_s_C')
  })

  // ─────────────────── Kotlin ───────────────────

  it('Kotlin: z.discriminatedUnion emits as sealed class with per-variant data class', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const animalSchema = zodSchema(z.discriminatedUnion('type', [
  z.object({ type: z.literal('cat'), meows: z.boolean() }),
  z.object({ type: z.literal('dog'), barks: z.boolean() }),
]))
`
    const r = transform(src, { target: 'kotlin' })
    // Sealed class shape
    expect(r.code).toContain('sealed class PyreonZodSchema_animalSchema {')
    expect(r.code).toContain(
      'data class Cat(val variant: PyreonZodSchema_animalSchema_Cat) : PyreonZodSchema_animalSchema()',
    )
    expect(r.code).toContain(
      'data class Dog(val variant: PyreonZodSchema_animalSchema_Dog) : PyreonZodSchema_animalSchema()',
    )
    // Each variant emitted as its own data class
    expect(r.code).toContain('data class PyreonZodSchema_animalSchema_Cat')
    expect(r.code).toContain('data class PyreonZodSchema_animalSchema_Dog')
    expect(r.code).toContain('var meows: Boolean')
    expect(r.code).toContain('var barks: Boolean')
  })

  it('Kotlin: parse() dispatches on discriminator via when', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('a'), x: z.string() }),
  z.object({ kind: z.literal('b'), y: z.number() }),
]))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('input["kind"] as? String')
    expect(r.code).toContain('when (discr) {')
    expect(r.code).toContain('"a" -> A(PyreonZodSchema_s_A.parse(input))')
    expect(r.code).toContain('"b" -> B(PyreonZodSchema_s_B.parse(input))')
    expect(r.code).toContain('else -> throw PyreonSchemaError.ConstraintViolation')
    expect(r.code).toContain('"unknown discriminator value"')
  })

  it('Kotlin: 3-variant union emits 3 data-class subtypes', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const s = zodSchema(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('a'), x: z.string() }),
  z.object({ kind: z.literal('b'), y: z.number() }),
  z.object({ kind: z.literal('c'), z: z.boolean() }),
]))
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('data class A(val variant: PyreonZodSchema_s_A)')
    expect(r.code).toContain('data class B(val variant: PyreonZodSchema_s_B)')
    expect(r.code).toContain('data class C(val variant: PyreonZodSchema_s_C)')
  })

  // ─────────────────── error cases ───────────────────

  it('drops discriminated union when discriminator literal is non-string and warns', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const bad = zodSchema(z.discriminatedUnion(42, [
  z.object({ type: z.literal('a'), x: z.string() }),
]))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).not.toContain('PyreonZodSchema_bad')
    expect(r.warnings.some((w) => w.includes('first arg must be a string literal'))).toBe(true)
  })

  it('drops discriminated union when variant lacks discriminator literal', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const bad = zodSchema(z.discriminatedUnion('type', [
  z.object({ x: z.string() }),
]))
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).not.toContain('PyreonZodSchema_bad')
    expect(
      r.warnings.some(
        (w) => w.includes('variant 0') && w.includes('discriminator field'),
      ) ||
        r.warnings.some(
          (w) => w.includes('doesn\'t expose') && w.includes('literal'),
        ),
    ).toBe(true)
  })

  // ─────────────────── cross-cutting ───────────────────

  it('both targets: variants can contain optional + array fields', () => {
    const src = `
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'

export const eventSchema = zodSchema(z.discriminatedUnion('event', [
  z.object({
    event: z.literal('post'),
    title: z.string().min(2),
    tags: z.array(z.string()),
  }),
  z.object({
    event: z.literal('like'),
    targetId: z.string(),
    note: z.string().optional(),
  }),
]))
`
    const swift = transform(src, { target: 'swift' })
    expect(swift.code).toContain('enum PyreonZodSchema_eventSchema {')
    expect(swift.code).toContain('var title: String')
    expect(swift.code).toContain('titleVal.count < 2')
    expect(swift.code).toContain('var tags: [String]')
    expect(swift.code).toContain('var note: String? = nil')

    const kotlin = transform(src, { target: 'kotlin' })
    expect(kotlin.code).toContain('sealed class PyreonZodSchema_eventSchema')
    expect(kotlin.code).toContain('var title: String')
    expect(kotlin.code).toContain('nameVal'.replace('name', 'title') + '.length < 2')
    expect(kotlin.code).toContain('var tags: List<String>')
    expect(kotlin.code).toContain('var note: String? = null')
  })
})
