/**
 * Coverage for the optional `parse` method on `TypedSchemaAdapter` —
 * used by `@pyreon/store`'s schema-driven `defineStore` overload to get
 * the coerced/parsed output (not just errors).
 *
 * Tests run against each first-party adapter (zod / valibot / arktype)
 * to confirm:
 *   - Successful parse returns `{ ok: true, value }`
 *   - Failed parse returns `{ ok: false, issues: [...] }` with normalized paths
 *   - Schema defaults / transforms apply (coerced value, not raw input)
 *   - Sync-only contract: async parsers either return Promise (caller
 *     detects) or work synchronously
 *   - Thrown errors are normalized to `{ ok: false, issues: [{ path: '', ... }] }`
 */
import { type } from 'arktype'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { arktypeSchema } from '../arktype'
import { valibotSchema } from '../valibot'
import { zodSchema } from '../zod'

// ─── zod ────────────────────────────────────────────────────────────────────

describe('zodSchema.parse', () => {
  const adapter = zodSchema(
    z.object({
      name: z.string().min(1),
      age: z.number(),
    }),
  )

  it('returns { ok: true, value } on valid input', () => {
    const result = adapter.parse!({ name: 'Alice', age: 30 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ name: 'Alice', age: 30 })
    }
  })

  it('returns { ok: false, issues } on invalid input', () => {
    const result = adapter.parse!({ name: '', age: 30 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0]!.path).toBe('name')
      expect(result.issues[0]!.message).toBeTruthy()
    }
  })

  it('applies zod defaults via parse', () => {
    const withDefault = zodSchema(
      z.object({
        name: z.string().default('Default Name'),
      }),
    )
    const result = withDefault.parse!({})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ name: 'Default Name' })
    }
  })

  it('applies zod transforms via parse', () => {
    const withTransform = zodSchema(
      z.object({
        name: z.string().transform((s) => s.toUpperCase()),
      }),
    )
    const result = withTransform.parse!({ name: 'alice' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ name: 'ALICE' })
    }
  })

  it('normalizes thrown errors into the issues shape', () => {
    // Construct a schema that throws inside safeParse via a refinement
    // that calls a method on null. Wrapping in zod's `z.preprocess` makes
    // the throw escape safeParse's normal error path.
    const bad = {
      safeParse() {
        throw new Error('boom')
      },
      safeParseAsync() {
        return Promise.reject(new Error('boom'))
      },
    } as unknown as Parameters<typeof zodSchema<{ x: string }>>[0]
    const adapter = zodSchema<{ x: string }>(bad)
    const result = adapter.parse!({ x: 'y' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]!.message).toMatch(/boom/)
    }
  })

  it('handles missing issues array gracefully', () => {
    const stub = {
      safeParse() {
        return { success: false } // no `error` field
      },
      safeParseAsync() {
        return Promise.resolve({ success: false })
      },
    } as unknown as Parameters<typeof zodSchema<{ x: string }>>[0]
    const adapter = zodSchema<{ x: string }>(stub)
    const result = adapter.parse!({ x: 'y' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Array.isArray(result.issues)).toBe(true)
    }
  })
})

// ─── valibot ────────────────────────────────────────────────────────────────

describe('valibotSchema.parse', () => {
  const adapter = valibotSchema<{ name: string; age: number }>(
    v.object({
      name: v.pipe(v.string(), v.minLength(1)),
      age: v.number(),
    }),
    v.safeParse,
  )

  it('returns { ok: true, value } on valid input', () => {
    const result = adapter.parse!({ name: 'Alice', age: 30 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ name: 'Alice', age: 30 })
    }
  })

  it('returns { ok: false, issues } on invalid input', () => {
    const result = adapter.parse!({ name: '', age: 30 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0)
    }
  })

  it('returns the Promise sentinel when async safeParseAsync was passed (caller detects)', () => {
    const asyncAdapter = valibotSchema<{ name: string }>(
      v.object({ name: v.string() }),
      v.safeParseAsync,
    )
    const result = asyncAdapter.parse!({ name: 'A' })
    expect(result).toBeInstanceOf(Promise)
  })

  it('normalizes thrown errors into the issues shape', () => {
    const broken = (() => {
      throw new Error('valibot boom')
    }) as unknown as typeof v.safeParse
    const adapter = valibotSchema<{ x: string }>(v.object({ x: v.string() }), broken)
    const result = adapter.parse!({ x: 'y' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]!.message).toMatch(/valibot boom/)
    }
  })
})

// ─── arktype ────────────────────────────────────────────────────────────────

describe('arktypeSchema.parse', () => {
  const UserType = type({
    name: 'string > 0',
    age: 'number',
  })
  const adapter = arktypeSchema<{ name: string; age: number }>(
    UserType as unknown as (data: unknown) => unknown,
  )

  it('returns { ok: true, value } on valid input', () => {
    const result = adapter.parse!({ name: 'Alice', age: 30 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ name: 'Alice', age: 30 })
    }
  })

  it('returns { ok: false, issues } on invalid input', () => {
    const result = adapter.parse!({ name: '', age: 30 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0)
    }
  })

  it('normalizes thrown errors into the issues shape', () => {
    const broken = (() => {
      throw new Error('arktype boom')
    }) as unknown as (data: unknown) => unknown
    const adapter = arktypeSchema<{ x: string }>(broken)
    const result = adapter.parse!({ x: 'y' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]!.message).toMatch(/arktype boom/)
    }
  })
})
