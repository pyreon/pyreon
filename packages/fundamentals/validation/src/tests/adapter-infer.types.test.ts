/**
 * `valibotSchema(schema, fn)` and `arktypeSchema(schema)` infer the form's
 * value type from the schema (their JSDoc always promised it; the signatures
 * took `unknown` / a bare callable, so `TValues` defaulted to the constraint).
 * An explicit type argument still works (the second overload).
 */
import { type } from 'arktype'
import * as v from 'valibot'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { arktypeSchema } from '../arktype'
import type { TypedSchemaAdapter } from '../types'
import { valibotSchema } from '../valibot'
import { zodSchema } from '../zod'

type Target = { email: string; age: number }

describe('adapter TValues inference', () => {
  it('valibotSchema infers from the schema', () => {
    const a = valibotSchema(v.object({ email: v.string(), age: v.number() }), v.safeParseAsync)
    expectTypeOf(a).toEqualTypeOf<TypedSchemaAdapter<Target>>()
  })
  it('arktypeSchema infers from the schema', () => {
    const a = arktypeSchema(type({ email: 'string', age: 'number' }))
    expectTypeOf(a).toEqualTypeOf<TypedSchemaAdapter<Target>>()
  })
  it('zodSchema infers from the schema (control)', () => {
    const a = zodSchema(z.object({ email: z.string(), age: z.number() }))
    expectTypeOf(a).toEqualTypeOf<TypedSchemaAdapter<Target>>()
  })
  it('an explicit TValues still binds', () => {
    const a = valibotSchema<Target>(v.object({ email: v.string(), age: v.number() }), v.safeParseAsync)
    expectTypeOf(a).toEqualTypeOf<TypedSchemaAdapter<Target>>()
    const b = arktypeSchema<Target>(type({ email: 'string', age: 'number' }))
    expectTypeOf(b).toEqualTypeOf<TypedSchemaAdapter<Target>>()
  })
})
