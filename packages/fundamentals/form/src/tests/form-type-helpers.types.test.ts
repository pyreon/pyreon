/**
 * Compile-time type tests for the `@pyreon/form` inference helpers
 * (`FormValues` / `FieldNames` / `FieldValue` / `NestValues`).
 *
 * `NestValues` is the STANDALONE opt-in companion of the runtime
 * `nestValues()` — deliberately NOT threaded through `useForm`'s signature
 * (the type cascade would break generic wrappers like `@pyreon/feature`,
 * per the documented CLAUDE.md decision). These specs lock the standalone
 * contract only.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type {
  FieldNames,
  FieldValue,
  FormValues,
  NestValues,
  UseFormOptions,
} from '../index'
import { nestValues, useForm } from '../index'

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeForm() {
  return useForm({
    initialValues: { email: '', age: 0, admin: false },
    onSubmit: () => {},
  })
}
type Form = ReturnType<typeof makeForm>

describe('FormValues — derive TValues from the form or its options', () => {
  it('derives from the useForm RETURN (FormState)', () => {
    expectTypeOf<FormValues<Form>>().toEqualTypeOf<{
      email: string
      age: number
      admin: boolean
    }>()
  })

  it('derives from UseFormOptions too', () => {
    type Opts = UseFormOptions<{ q: string }>
    expectTypeOf<FormValues<Opts>>().toEqualTypeOf<{ q: string }>()
  })

  it('resolves to never for non-form inputs (negative)', () => {
    expectTypeOf<FormValues<{ email: string }>>().toEqualTypeOf<never>()
    expectTypeOf<FormValues<string>>().toEqualTypeOf<never>()
  })
})

describe('FieldNames / FieldValue', () => {
  it('FieldNames is the exact field-name union', () => {
    expectTypeOf<FieldNames<Form>>().toEqualTypeOf<'email' | 'age' | 'admin'>()
  })

  it('FieldValue picks a single field value type', () => {
    expectTypeOf<FieldValue<Form, 'age'>>().toEqualTypeOf<number>()
    expectTypeOf<FieldValue<Form, 'admin'>>().toEqualTypeOf<boolean>()
  })

  it('FieldValue rejects a non-existent field name (negative)', () => {
    // @ts-expect-error — 'nope' is not a field of this form
    type _Bad = FieldValue<Form, 'nope'>
  })

  it('dot-path leaf fields keep their FLAT keys (the form value model)', () => {
    type Opts = UseFormOptions<{ name: string; 'address.city': string }>
    expectTypeOf<FieldNames<Opts>>().toEqualTypeOf<'name' | 'address.city'>()
    expectTypeOf<FieldValue<Opts, 'address.city'>>().toEqualTypeOf<string>()
  })
})

describe('NestValues — flat dot-path shape → nested payload shape', () => {
  it('nests single-level dot paths and groups siblings', () => {
    type Flat = { name: string; 'address.city': string; 'address.zip': number }
    expectTypeOf<NestValues<Flat>>().toEqualTypeOf<{
      name: string
      address: { city: string; zip: number }
    }>()
  })

  it('handles deep paths (5 segments — inside the practical cap)', () => {
    type Flat = { 'a.b.c.d.e': 1 }
    expectTypeOf<NestValues<Flat>>().toEqualTypeOf<{ a: { b: { c: { d: { e: 1 } } } } }>()
  })

  it('handles a WIDE flat shape without blowing instantiation limits', () => {
    type Wide = {
      f1: string
      f2: string
      f3: string
      f4: string
      f5: string
      'g.a': number
      'g.b': number
      'g.c': number
      'h.x.y': boolean
      'h.x.z': boolean
    }
    type Nested = NestValues<Wide>
    expectTypeOf<Nested['g']>().toEqualTypeOf<{ a: number; b: number; c: number }>()
    expectTypeOf<Nested['h']>().toEqualTypeOf<{ x: { y: boolean; z: boolean } }>()
    expectTypeOf<Nested['f1']>().toEqualTypeOf<string>()
  })

  it('a shape with no dot paths passes through unchanged', () => {
    type Flat = { a: string; b: number }
    expectTypeOf<NestValues<Flat>>().toEqualTypeOf<{ a: string; b: number }>()
  })

  it('rejects assigning the FLAT shape where the nested one is required (negative)', () => {
    type Flat = { 'address.city': string }
    const takesNested = (_v: NestValues<Flat>) => {}
    takesNested({ address: { city: 'Brno' } })
    // @ts-expect-error — the flat key is not the nested shape
    takesNested({ 'address.city': 'Brno' })
  })
})

// Runtime smoke — the type mirrors what runtime nestValues() actually builds.
describe('NestValues matches the runtime nestValues() output shape', () => {
  it('runtime output is assignable to the derived type', () => {
    const flat = { name: 'Ada', 'address.city': 'Brno', 'address.zip': 60200 }
    const nested = nestValues(flat) as NestValues<typeof flat>
    expect(nested.address.city).toBe('Brno')
    expect(nested.address.zip).toBe(60200)
    expect(nested.name).toBe('Ada')
  })
})
