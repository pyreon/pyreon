/**
 * Universality lock for the canonical `InferSchema` at the RAW Standard Schema
 * boundary — a bare `z.object` / `v.object` / arktype `type(...)` (no Pyreon
 * `zodSchema()`/`valibotSchema()` adapter, no cast) must infer its field types
 * directly (via either inference arm — see the bisect note).
 *
 * This was the one shape the consumer suites did NOT cover at the type level:
 * `@pyreon/store` proves raw zod + adapter-wrapped valibot/arktype;
 * `@pyreon/state-tree` proves raw zod + `s` (the no-`types` arm). Raw valibot /
 * raw arktype fell in the gap between them — locked here so a raw schema from
 * any single library can't silently regress to the untyped fallback.
 *
 * Bisect (verified): raw zod/valibot/arktype each carry BOTH a `types` phantom
 * AND a well-typed `validate` return, so EITHER arm recovers them — breaking
 * just the `types.output` arm still typechecks (`InferFromValidate` catches
 * them). The assertions collapse to `Record<string, unknown>` and fail only
 * when BOTH arms are replaced by the fallback. That redundancy is by design;
 * this test fails the moment neither strategy remains.
 */
import type { InferSchema } from '../schema'
import { type } from 'arktype'
import * as v from 'valibot'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

describe('InferSchema — raw Standard Schema (no adapter) infers strictly', () => {
  it('raw zod', () => {
    const s = z.object({ name: z.string(), age: z.number() })
    type R = InferSchema<typeof s>
    expectTypeOf<R['name']>().toEqualTypeOf<string>()
    expectTypeOf<R['age']>().toEqualTypeOf<number>()
  })

  it('raw valibot', () => {
    const s = v.object({ name: v.string(), age: v.number() })
    type R = InferSchema<typeof s>
    expectTypeOf<R['name']>().toEqualTypeOf<string>()
    expectTypeOf<R['age']>().toEqualTypeOf<number>()
  })

  it('raw arktype', () => {
    const s = type({ name: 'string', age: 'number' })
    type R = InferSchema<typeof s>
    expectTypeOf<R['name']>().toEqualTypeOf<string>()
    expectTypeOf<R['age']>().toEqualTypeOf<number>()
  })
})
