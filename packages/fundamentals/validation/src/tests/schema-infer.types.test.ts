/**
 * Type-level contract for `InferSchema<S>` — the "universal" schema-to-type
 * bridge that `@pyreon/store` and `@pyreon/state-tree` build their strict
 * typing on.
 *
 * It must resolve the field-value type from BOTH adapter shapes:
 *   - Tier A.1 — a Pyreon `TypedSchemaAdapter` (the `zodSchema()` wrapper) via `_infer`
 *   - Tier A.2 — ANY raw Standard Schema (zod / valibot / arktype passed directly)
 *     via `~standard.types.output`
 *
 * The Tier A.2 arm regressed for the whole life of the type because Standard
 * Schema's `types` phantom is OPTIONAL (`types?: { input; output }`) — matching
 * a REQUIRED `types` never hit, so every raw-schema consumer silently collapsed
 * to the `Record<string, unknown>` fallback. This file locks the fix: raw
 * zod/valibot/arktype all infer their exact field types. Bisect: revert the
 * `types?`-optional form in `schema.ts` → the raw-schema assertions below fail
 * (they resolve to `Record<string, unknown>`), while the wrapped-adapter one
 * still passes.
 */
import type { InferSchema } from '../schema'
import { zodSchema } from '../zod'
import { z } from 'zod'
import * as v from 'valibot'
import { type } from 'arktype'
import { describe, expectTypeOf, it } from 'vitest'

type Target = { name: string; age: number }

describe('InferSchema — universal field-type inference', () => {
  it('Tier A.1: zodSchema() wrapper infers via _infer', () => {
    type Wrapped = ReturnType<typeof zodSchema<Target>>
    expectTypeOf<InferSchema<Wrapped>>().toEqualTypeOf<Target>()
  })

  it('Tier A.2: RAW zod (Standard Schema) infers via ~standard.types.output', () => {
    const RawZod = z.object({ name: z.string(), age: z.number() })
    expectTypeOf<InferSchema<typeof RawZod>>().toEqualTypeOf<Target>()
  })

  it('Tier A.2: RAW valibot infers via ~standard.types.output', () => {
    const RawValibot = v.object({ name: v.string(), age: v.number() })
    expectTypeOf<InferSchema<typeof RawValibot>>().toEqualTypeOf<Target>()
  })

  it('Tier A.2: RAW arktype infers via ~standard.types.output', () => {
    const RawArk = type({ name: 'string', age: 'number' })
    expectTypeOf<InferSchema<typeof RawArk>>().toEqualTypeOf<Target>()
  })

  it('unknown shape falls back to Record<string, unknown> (never collapses to never)', () => {
    expectTypeOf<InferSchema<{ not: 'a schema' }>>().toEqualTypeOf<Record<string, unknown>>()
  })
})
