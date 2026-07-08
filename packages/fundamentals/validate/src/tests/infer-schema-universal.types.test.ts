/**
 * Universality proof for the canonical `@pyreon/validation` `InferSchema` — it
 * must infer a Standard Schema's output via BOTH strategies, so EVERY schema
 * library resolves:
 *   1. `~standard.types.output` — zod/valibot/arktype AND `@pyreon/validate`'s
 *      `s` (whose `~standard` getter DOES expose the `types` phantom). #2131.
 *   2. the `validate` RETURN's `{ value }` — for any spec-compliant schema that
 *      OMITS the optional `types` phantom (the spec allows it). This arm
 *      (`InferFromValidate`) folds in the strategy `@pyreon/state-tree` used to
 *      carry locally, so delegating `InferSchemaState → InferSchema` is a
 *      no-regression.
 *
 * Bisect: replace the `InferFromValidate<S>` arms in
 * `@pyreon/validation/schema.ts:InferSchema` with `Record<string, unknown>` →
 * the no-`types` assertions below fail (resolve to `unknown`); the `s.object`
 * one still passes (it infers via `types.output`).
 */
import type { InferSchema } from '@pyreon/validation'
import { describe, expectTypeOf, it } from 'vitest'
import { s } from '../v1'

describe('InferSchema — universal across strategies', () => {
  it('`@pyreon/validate` s.object infers via the types phantom', () => {
    const schema = s.object({ name: s.string(), age: s.number() })
    type R = InferSchema<typeof schema>
    expectTypeOf<R['name']>().toEqualTypeOf<string>()
    expectTypeOf<R['age']>().toEqualTypeOf<number>()
  })

  it('a Standard Schema that OMITS `types` infers from the validate return', () => {
    // Spec-compliant but no `types` phantom — must recover via InferFromValidate.
    interface NoTypesSchema {
      readonly '~standard': {
        readonly version: 1
        readonly vendor: string
        readonly validate: (
          value: unknown,
        ) =>
          | { readonly value: { name: string; age: number }; readonly issues?: undefined }
          | { readonly value?: undefined; readonly issues: readonly [] }
      }
    }
    type R = InferSchema<NoTypesSchema>
    expectTypeOf<R['name']>().toEqualTypeOf<string>()
    expectTypeOf<R['age']>().toEqualTypeOf<number>()
  })
})
