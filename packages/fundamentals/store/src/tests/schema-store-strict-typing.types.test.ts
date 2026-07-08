/**
 * Type-level contract for the SCHEMA-DRIVEN store's strict typing.
 *
 * The schema store infers every field type from the schema (`InferSchema<S>`)
 * and threads it through the CONSUMER-facing API — `state`, `set`, `patch`,
 * `deepPatch`, and `update` are all checked against the real field types at
 * compile time, with zero manual annotations. This locks that contract:
 * correct writes typecheck; wrong-typed values, unknown fields, and `update`
 * on a non-field key all FAIL typecheck (the `@ts-expect-error` lines below —
 * if any stops erroring, the typing regressed and this file fails to compile).
 *
 * Everything that MUTATES lives in `_strictTypingContract` — a function that is
 * type-checked but NEVER CALLED, so the invalid negative-case calls don't
 * execute the (throwing) schema validator at runtime. The `it` block only runs
 * `expectTypeOf` (a runtime no-op) so vitest has something to green.
 */
import { computed, defineStore } from '../index'
import { zodSchema } from '@pyreon/validation/zod'
import { z } from 'zod'
import { describe, expectTypeOf, it } from 'vitest'

const UserSchema = zodSchema(
  z.object({
    name: z.string(),
    age: z.number(),
    tags: z.array(z.string()),
    prefs: z.object({ theme: z.string(), compact: z.boolean() }),
  }),
)

const useUser = defineStore('types-user', {
  schema: UserSchema,
  initial: { name: '', age: 0, tags: [], prefs: { theme: 'light', compact: false } },
  setup: ({ state }) => ({
    greeting: computed(() => `Hi ${state.name()}`),
  }),
})

// Type-checked, never invoked — so the negative-case mutations below are
// compile-time-only and never hit the throwing runtime validator.
// oxlint-disable-next-line no-unused-vars
function _strictTypingContract() {
  const u = useUser()

  // ── state is the schema field VALUES (not Record<string, unknown>) ──
  expectTypeOf(u.state.name).toEqualTypeOf<string>()
  expectTypeOf(u.state.age).toEqualTypeOf<number>()
  expectTypeOf(u.state.tags).toEqualTypeOf<string[]>()
  expectTypeOf(u.state.prefs).toEqualTypeOf<{ theme: string; compact: boolean }>()

  // ── store exposes per-field Signals + the setup computed ──
  expectTypeOf(u.store.name()).toEqualTypeOf<string>()
  expectTypeOf(u.store.age()).toEqualTypeOf<number>()
  expectTypeOf(u.store.greeting()).toEqualTypeOf<string>()

  // ── set requires the full schema shape ──
  u.set({ name: 'A', age: 1, tags: ['x'], prefs: { theme: 'dark', compact: true } })
  // @ts-expect-error — age must be a number
  u.set({ name: 'A', age: 'nope', tags: [], prefs: { theme: 'd', compact: true } })
  // @ts-expect-error — missing fields
  u.set({ name: 'A' })

  // ── patch accepts a typed Partial ──
  u.patch({ age: 2 })
  u.patch({ name: 'B', tags: ['y'] })
  // @ts-expect-error — wrong type for a known field
  u.patch({ age: 'nope' })
  // @ts-expect-error — unknown field rejected
  u.patch({ nope: 1 })

  // ── deepPatch accepts a typed DeepPartial (nested optional) ──
  u.deepPatch({ prefs: { theme: 'dark' } })
  // @ts-expect-error — nested field wrong type
  u.deepPatch({ prefs: { compact: 'yes' } })

  // ── update: key constrained to FIELD names; transformer gets the field type ──
  u.update('age', (n) => {
    expectTypeOf(n).toEqualTypeOf<number>()
    return n + 1
  })
  u.update('tags', (t) => {
    expectTypeOf(t).toEqualTypeOf<string[]>()
    return [...t, 'z']
  })
  // @ts-expect-error — transformer must return the field's type
  u.update('age', (n) => `${n}`)
  // @ts-expect-error — 'greeting' is a setup computed, NOT a writable field
  u.update('greeting', (g) => g)
  // @ts-expect-error — unknown field
  u.update('nope', (x) => x)
}

describe('schema store — strict typing from the schema', () => {
  it('compiles the strict-typing contract (assertions above; this file fails to typecheck on regression)', () => {
    // The real assertions are the compile-time ones in `_strictTypingContract`.
    // This keeps vitest happy and documents that the file is a type gate.
    expectTypeOf(useUser).toBeFunction()
  })
})
