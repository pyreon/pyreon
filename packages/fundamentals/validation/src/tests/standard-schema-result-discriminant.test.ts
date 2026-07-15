/**
 * Regression coverage for the Standard-Schema RESULT-DISCRIMINANT bug.
 *
 * `wrapStandardSchema` used to discriminate SUCCESS on `'value' in r` — but
 * the Standard Schema spec's discriminant is `issues` ("if `issues` is
 * undefined, validation succeeded"), and **valibot's FAILURE result carries
 * BOTH keys**: `{ typed: false, value: <raw input>, issues: [...] }`. So a
 * RAW valibot schema (Tier A.2, no `valibotSchema()` adapter) passed to
 * `defineStore({ schema })` / state-tree `model({ schema })` was a SILENT
 * validation no-op — `extractParseFn(...)({ age: 'nope' })` returned
 * `{ ok: true, value: { age: 'nope' } }` and the invalid RAW input was
 * written into state. zod / arktype raw were unaffected only by accident
 * (their failure results carry no `value` key).
 *
 * These tests use the REAL libraries (valibot / zod / arktype) — a mock
 * `~standard` shape would not exercise valibot's both-keys failure result.
 * They cover the bridge (`wrapStandardSchema` + the `extractParseFn`
 * dispatcher store/state-tree call verbatim) for all three libraries, the
 * valibot SUCCESS shape (`typed: true`), the async-schema rejection contract,
 * and a real `@pyreon/store` end-to-end (invalid `set` / `patch` THROWS and
 * state is unchanged — pre-fix: no throw + corrupted state).
 *
 * Test-design lesson locked here: store/state-tree schema suites exercised
 * raw ARKTYPE + the valibot ADAPTER, never RAW valibot — the "real library,
 * one lib short" trap. Every raw Standard Schema consumer test must run the
 * full raw-library matrix (zod + valibot + arktype).
 */
import { defineStore, resetStore } from '@pyreon/store'
import { type } from 'arktype'
import * as v from 'valibot'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { extractParseFn, wrapStandardSchema } from '../schema'
import type { StandardSchemaLike } from '../types'

// Raw schemas — passed DIRECTLY (Tier A.2), no Pyreon adapter.
const valibotUser = v.object({ name: v.string(), age: v.number() })
const zodUser = z.object({ name: z.string(), age: z.number() })
const arkUser = type({ name: 'string', age: 'number' })

describe('wrapStandardSchema — issues-first discriminant (raw valibot)', () => {
  const parse = wrapStandardSchema<{ name: string; age: number }>(
    valibotUser as unknown as StandardSchemaLike,
  )

  it("valibot's FAILURE result carries BOTH `value` and `issues` (the trap shape)", () => {
    // Lock the library fact the fix depends on: if valibot ever stops
    // carrying `value` on failure, this spec documents why the fix existed.
    const raw = valibotUser['~standard'].validate({ name: 'Alice', age: 'nope' })
    expect(raw).not.toBeInstanceOf(Promise)
    const r = raw as { value?: unknown; issues?: readonly unknown[] }
    expect('value' in r).toBe(true)
    expect(Array.isArray(r.issues) && r.issues.length > 0).toBe(true)
  })

  it('returns ok:false with issues for invalid input (pre-fix: ok:true with the RAW input)', () => {
    const result = parse({ name: 'Alice', age: 'nope' })
    expect(result).not.toBeInstanceOf(Promise)
    if (result instanceof Promise) return
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0]!.path).toBe('age')
      expect(result.issues[0]!.message).toMatch(/number/i)
    }
  })

  it('returns ok:true with the parsed value for valid input (typed:true success shape — no false negatives)', () => {
    const result = parse({ name: 'Alice', age: 30 })
    expect(result).not.toBeInstanceOf(Promise)
    if (result instanceof Promise) return
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ name: 'Alice', age: 30 })
  })
})

describe('extractParseFn — raw-library matrix (valibot / zod / arktype)', () => {
  // `extractParseFn` is the EXACT dispatcher `@pyreon/store` and
  // `@pyreon/state-tree` call. The matrix guards BOTH directions: valibot
  // failures must be rejected (the bug), and zod/arktype must keep working
  // (their failure results carry no `value` — safe pre-fix by accident).
  const cases: Array<[string, unknown]> = [
    ['valibot', valibotUser],
    ['zod', zodUser],
    ['arktype', arkUser],
  ]

  for (const [lib, schema] of cases) {
    it(`${lib}: invalid input → ok:false with issues; valid input → ok:true`, () => {
      const parse = extractParseFn<{ name: string; age: number }>(schema)

      const bad = parse({ name: 'Alice', age: 'nope' })
      expect(bad).not.toBeInstanceOf(Promise)
      if (!(bad instanceof Promise)) {
        expect(bad.ok).toBe(false)
        if (!bad.ok) {
          expect(bad.issues.length).toBeGreaterThan(0)
          expect(bad.issues[0]!.path).toBe('age')
        }
      }

      const ok = parse({ name: 'Alice', age: 30 })
      expect(ok).not.toBeInstanceOf(Promise)
      if (!(ok instanceof Promise)) {
        expect(ok.ok).toBe(true)
        if (ok.ok) expect(ok.value).toEqual({ name: 'Alice', age: 30 })
      }
    })
  }
})

describe('wrapStandardSchema — async valibot schema still surfaces the Promise', () => {
  it('returns the Promise verbatim so callers reject per the async-schema contract', () => {
    const asyncSchema = v.objectAsync({
      name: v.pipeAsync(v.string(), v.checkAsync(async () => true)),
    })
    const parse = wrapStandardSchema<{ name: string }>(
      asyncSchema as unknown as StandardSchemaLike,
    )
    // The wrapper must NOT swallow the Promise into an ok/issues verdict —
    // store/state-tree probe for it and throw "async unsupported".
    expect(parse({ name: 'x' })).toBeInstanceOf(Promise)
  })
})

describe('@pyreon/store end-to-end — raw valibot schema (the corruption repro)', () => {
  const ids: string[] = []
  afterEach(() => {
    for (const id of ids.splice(0)) resetStore(id)
  })

  it('invalid set() THROWS and state is unchanged (pre-fix: silent no-op wrote the raw invalid value)', () => {
    ids.push('valibot-raw-store-set')
    const useUser = defineStore('valibot-raw-store-set', {
      schema: valibotUser,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    expect(u.store.name()).toBe('Alice')
    expect(u.store.age()).toBe(30)

    // Valid write flows through.
    u.set({ name: 'Bob', age: 40 })
    expect(u.store.name()).toBe('Bob')

    // Invalid write is REJECTED — pre-fix this did NOT throw and wrote
    // `age: 'nope'` (the raw string) into the store.
    expect(() =>
      u.set({ name: 'Bob', age: 'nope' as unknown as number }),
    ).toThrow(/Schema validation failed/)
    expect(u.store.age()).toBe(40)
    expect(u.store.name()).toBe('Bob')
  })

  it('invalid patch() THROWS and state is unchanged', () => {
    ids.push('valibot-raw-store-patch')
    const useUser = defineStore('valibot-raw-store-patch', {
      schema: valibotUser,
      initial: { name: 'Alice', age: 30 },
    })
    const u = useUser()
    expect(() =>
      u.patch({ age: 'nope' as unknown as number }),
    ).toThrow(/Schema validation failed/)
    expect(u.store.age()).toBe(30)
    expect(u.store.name()).toBe('Alice')
  })

  it('rejects an ASYNC raw valibot schema at definition time (async contract preserved)', () => {
    const asyncSchema = v.objectAsync({
      name: v.pipeAsync(v.string(), v.checkAsync(async () => true)),
    })
    // A raw async schema returns a Promise from `~standard.validate`, which
    // `extractParseFn` surfaces verbatim → the store throws "async unsupported"
    // at definition time (the same contract the valibot-ADAPTER async test in
    // @pyreon/store locks). Cast the whole options object: a raw async schema
    // has no synchronous `~standard.types.output`, so it doesn't match the
    // schema overload's inference.
    expect(() =>
      defineStore(
        'valibot-raw-store-async',
        { schema: asyncSchema, initial: { name: 'x' } } as never,
      ),
    ).toThrow(/async/)
  })
})
