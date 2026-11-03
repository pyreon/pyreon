// `defineFeature({ schema: z.object({ … }) })` — the feature's validator crosses to native.
//
// The declaration alone holds field TYPES, so the constraints the web enforces (`.min()`, `.email()`, …) were reported as
// lost. The validator now ALSO lowers to the schema struct `@pyreon/validation` emits, so `Todo.schema.safeParse(x)`
// enforces them on device and returns the web's `{ success, data }`.
//
// Bisect-verified: removing the `methodCalls` recognizer in the feature plugin leaves `Todo.schema.safeParse` emitted
// verbatim (no `safeParseResult`); removing the schema item removes the struct; reverting `finishModule` drops
// `safeParseResult`; each fails the matching spec below.

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const SRC = `
import { defineFeature } from '@pyreon/feature'
import { signal } from '@pyreon/reactivity'
import { z } from 'zod'

export const Todo = defineFeature({
  name: 'todo',
  schema: z.object({ title: z.string().min(3).max(20), email: z.string().email(), done: z.boolean(), age: z.number().int().min(0) }),
})

export function Form() {
  const ok = signal(false)
  const check = () => {
    ok.set(Todo.schema.safeParse({ title: 'ab', email: 'x', done: true, age: 3 }).success)
  }
  return (
    <Button onPress={check}>
      <Text>go</Text>
    </Button>
  )
}
`

describe('@pyreon/feature — Todo.schema.safeParse crosses to native', () => {
  it('Swift: the validator lowers to a schema struct that enforces its constraints, called with no warnings', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('struct PyreonZodSchema_Todo_schema')
    expect(r.code).toContain('rule: "min length 3"')
    expect(r.code).toContain('rule: "email"')
    expect(r.code).toContain('rule: "min 0"')
    expect(r.code).toContain('PyreonZodSchema_Todo_schema.safeParseResult(')
    // The method that call lands on must exist: the call string alone reads the same without it.
    expect(r.code).toContain('static func safeParseResult(')
    // The feature's own declaration is untouched.
    expect(r.code).toContain('struct PyreonFeatureSchema_Todo: Codable')
    expect(r.code).toContain('let Todo = PyreonFeature_Todo.self')
  })

  it('Kotlin: the same, with the constraints as ConstraintViolation checks', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('data class PyreonZodSchema_Todo_schema(')
    expect(r.code).toContain('ConstraintViolation("title", "min length 3")')
    expect(r.code).toContain('ConstraintViolation("email", "email")')
    expect(r.code).toContain('PyreonZodSchema_Todo_schema.safeParseResult(')
  })

  it('a feature whose schema is never safeParse-d does not grow a safeParseResult', () => {
    const r = transform(SRC.replace(/export function Form[\s\S]*$/, ''), { target: 'swift' })
    expect(r.code).toContain('struct PyreonZodSchema_Todo_schema')
    expect(r.code).not.toContain('safeParseResult')
  })

  it('`.parse()` throws, so it is reported by name and points at safeParse', () => {
    const src = SRC.replace('Todo.schema.safeParse(', 'Todo.schema.parse(').replace('.success', '.done')
    const r = transform(src, { target: 'swift' })
    expect(r.warnings.some((w) => w.includes('Todo.schema.parse') && w.includes('safeParse'))).toBe(true)
  })

  it('a receiver that is not a feature schema falls through untouched', () => {
    const src = `
import { defineFeature } from '@pyreon/feature'
import { z } from 'zod'
export const Todo = defineFeature({ name: 'todo', schema: z.object({ title: z.string() }) })
export function C() {
  const other = { schema: { safeParse: (x: number) => x } }
  const n = other.schema.safeParse(1)
  return <Text>{n}</Text>
}
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).not.toContain('PyreonZodSchema_Todo_schema.safeParseResult')
  })
})

// A warning count is not a compile: both toolchains must accept the emitted struct AND the call into it.
describe.runIf(isSwiftcAvailable())('@pyreon/feature schema — Swift compiles', () => {
  it('type-checks against the stub runtime', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe.runIf(isKotlincAvailable())('@pyreon/feature schema — Kotlin compiles', () => {
  it('compiles against the stub runtime', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
