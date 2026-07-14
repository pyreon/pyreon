/**
 * Regression coverage for the CALLABLE-Standard-Schema bug.
 *
 * `isStandardSchema` used to bail with `typeof value !== 'object'` — but
 * **ArkType schemas are FUNCTIONS** (`type("string")(input)` validates) that
 * ALSO carry the `~standard` entrypoint. So `isStandardSchema(arkTypeSchema)`
 * returned `false`, and EVERY consumer that routes "is this a Standard Schema?
 * then validate through it" (`@pyreon/form`, `@pyreon/store`,
 * `@pyreon/state-tree`, `@pyreon/validate`, `@pyreon/feature`) silently SKIPPED
 * validation for a raw ArkType schema — reporting VALID while the schema would
 * REJECT.
 *
 * These tests use the REAL `arktype` library (a callable schema) — a mock
 * shape would not exercise the `typeof === 'function'` path. They cover the
 * detection guard, both bridge functions, the shared `extractParseFn`
 * dispatcher that `@pyreon/store` + `@pyreon/state-tree` call verbatim, and a
 * real `@pyreon/store` end-to-end (a store declared with a raw ArkType schema
 * rejects an invalid write only after the fix).
 */
import { defineStore, resetStore } from '@pyreon/store'
import { type } from 'arktype'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractParseFn,
  isStandardSchema,
  standardSchemaToValidator,
  wrapStandardSchema,
} from '../schema'
import type { StandardSchemaLike } from '../types'

// A raw ArkType schema — CALLABLE (`typeof === 'function'`) and carrying
// `~standard`. This is the exact shape a user passes when they do
// `useForm({ schema })` / `defineStore({ schema })` with `type(...)` directly.
const arkUser = type({ name: 'string', age: 'number' })

describe('isStandardSchema — callable schema (ArkType)', () => {
  it('accepts a raw ArkType schema (callable + `~standard`)', () => {
    // Sanity: ArkType schemas really are functions carrying `~standard`.
    expect(typeof arkUser).toBe('function')
    expect('~standard' in arkUser).toBe(true)
    // The bug: this returned `false` before the guard accepted functions.
    expect(isStandardSchema(arkUser)).toBe(true)
  })

  it('still rejects a plain function WITHOUT `~standard` (no over-acceptance)', () => {
    expect(isStandardSchema(() => undefined)).toBe(false)
    expect(isStandardSchema(function noop() {})).toBe(false)
    // A function carrying a `~standard` whose `validate` is not a function
    // is still rejected (well-formed `~standard.validate` is required).
    const fake = Object.assign(() => undefined, { '~standard': { version: 1 } })
    expect(isStandardSchema(fake)).toBe(false)
  })

  it('narrows to StandardSchemaLike so consumers can call `~standard.validate`', () => {
    const value: unknown = arkUser
    if (isStandardSchema(value)) {
      // Reachable ONLY because the guard now accepts callables.
      const std: StandardSchemaLike = value
      expect(typeof std['~standard'].validate).toBe('function')
    } else {
      throw new Error('expected the raw ArkType schema to be a Standard Schema')
    }
  })
})

describe('standardSchemaToValidator — callable schema (ArkType)', () => {
  // This is the bridge `@pyreon/form` uses once detection passes. It must
  // validate through the `~standard` entrypoint (NOT by calling the schema
  // itself, and NOT via a Zod-specific `.safeParse`).
  const validate = standardSchemaToValidator<{ name: string; age: number }>(
    arkUser as unknown as StandardSchemaLike,
  )

  it('returns {} for valid input', async () => {
    expect(await validate({ name: 'Alice', age: 30 })).toEqual({})
  })

  it('returns a keyed error record for invalid input', async () => {
    const errors = await validate({
      name: 'Alice',
      age: 'not-a-number' as unknown as number,
    })
    expect(errors.age).toBeTruthy()
    // The message comes from ArkType's own `~standard.validate` output.
    expect(String(errors.age)).toMatch(/number/i)
  })
})

describe('wrapStandardSchema — callable schema (ArkType)', () => {
  const parse = wrapStandardSchema<{ name: string; age: number }>(
    arkUser as unknown as StandardSchemaLike,
  )

  it('returns ok:true with the coerced value for valid input', () => {
    const result = parse({ name: 'Alice', age: 30 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ name: 'Alice', age: 30 })
  })

  it('returns ok:false with issues for invalid input', () => {
    const result = parse({ name: 'Alice', age: 'nope' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0]!.path).toBe('age')
      expect(result.issues[0]!.message).toBeTruthy()
    }
  })
})

describe('extractParseFn — callable schema (ArkType)', () => {
  // `extractParseFn` is the EXACT dispatcher `@pyreon/store` (`index.ts:435`)
  // and `@pyreon/state-tree` (`model.ts:342`) call. Before the fix it THREW on
  // a raw ArkType schema (neither `isPyreonAdapter` nor `isStandardSchema`
  // matched a callable), so raw ArkType was UNUSABLE in schema-driven state.
  it('does not throw and returns a working parser for a raw ArkType schema', () => {
    const parse = extractParseFn<{ name: string; age: number }>(arkUser)
    const ok = parse({ name: 'Alice', age: 30 })
    expect(ok).not.toBeInstanceOf(Promise)
    if (!(ok instanceof Promise)) expect(ok.ok).toBe(true)

    const bad = parse({ name: 'Alice', age: 'nope' })
    if (!(bad instanceof Promise)) {
      expect(bad.ok).toBe(false)
      if (!bad.ok) expect(bad.issues[0]!.path).toBe('age')
    }
  })
})

describe('@pyreon/store end-to-end — raw ArkType schema (framework-wide proof)', () => {
  // Before the fix, `defineStore({ schema: rawArkType, ... })` THREW at
  // definition time (`extractParseFn` rejected the callable), so a raw ArkType
  // schema could not drive a store at all. After the fix the store validates
  // writes through ArkType.
  const ids: string[] = []
  afterEach(() => {
    for (const id of ids.splice(0)) resetStore(id)
  })

  it('creates a store and REJECTS an invalid write with a raw ArkType schema', () => {
    ids.push('ark-raw-store')
    // Pass the raw ArkType schema DIRECTLY (no `arktypeSchema()` adapter) — the
    // store auto-detects it via `~standard` and infers `{ name; age }` from
    // `~standard.types.output`, exactly like the raw-zod Tier A.2 path.
    const useUser = defineStore('ark-raw-store', {
      schema: arkUser,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    expect(u.store.name()).toBe('Alice')
    expect(u.store.age()).toBe(30)

    // Valid write flows through.
    u.set({ name: 'Bob', age: 40 })
    expect(u.store.name()).toBe('Bob')

    // Invalid write is rejected by ArkType — the exact user-facing correctness
    // the bug defeated (pre-fix the store couldn't even be defined).
    expect(() => u.set({ name: 'Bob', age: 'nope' as unknown as number })).toThrow(
      /Schema validation failed/,
    )
  })
})
