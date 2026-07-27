/**
 * The three validation tiers, and the traps in Tier 2.
 *
 * NOTHING in this file casts a schema. That is deliberate and load-bearing:
 * the earlier version of these tests wrote `.json(Schema as never)`, and the
 * cast hid a real defect — an ArkType schema is CALLABLE, so it matched the
 * `ParseFn` branch of the validator union and inferred `ArkErrors | Output`
 * instead of `Output`. A cast in a test is a place a type bug can hide.
 *
 * The raw-library MATRIX (zod + valibot + arktype) is likewise deliberate:
 * each library's Standard Schema result has a DIFFERENT shape on failure,
 * and a consumer tested against only one of them ships broken for the
 * others. Two documented instances:
 *
 * - valibot's FAILURE result carries BOTH `value` and `issues`, so a
 *   `'value' in result` success check accepts every valibot failure.
 * - arktype's schemas are CALLABLE and RETURN their errors rather than
 *   throwing, so a `typeof === 'object'` guard skips validation and a
 *   `typeof === 'function'` fast path returns the errors AS data.
 */

import { type } from 'arktype'
import * as v from 'valibot'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import { createHttp, type HttpClient } from '../client'
import { ResponseValidationError } from '../errors'
import { mock } from '../mock'
import { standardSchema } from '../schema'

const routes = [
  { path: '/good', json: { id: '1', name: 'Ada' } },
  { path: '/bad', json: { id: 1, name: 'Ada' } },
  { path: '/list', json: [1, 2, 3] },
  { path: '/scalar', json: 42 },
]

const withSchema = (): HttpClient =>
  createHttp({ use: [mock(routes)], schema: standardSchema })
const noSchema = (): HttpClient => createHttp({ use: [mock(routes)] })

describe('tier 0 — no validation', () => {
  it('returns the body as an unchecked cast', async () => {
    expect(await noSchema().get('/good').json<{ id: string }>()).toEqual({
      id: '1',
      name: 'Ada',
    })
  })

  it('needs no schema resolver at all', async () => {
    expect(await noSchema().get('/bad').json()).toEqual({ id: 1, name: 'Ada' })
  })
})

describe('tier 1 — a plain parse function (zero dependencies)', () => {
  const parse = (raw: unknown): { id: string } => {
    const value = raw as { id: unknown }
    if (typeof value.id !== 'string') throw new Error('id must be a string')
    return value as { id: string }
  }

  it('accepts any (raw: unknown) => T and infers T', async () => {
    const user = await noSchema().get('/good').json(parse)
    expectTypeOf(user).toEqualTypeOf<{ id: string }>()
    expect(user).toEqual({ id: '1', name: 'Ada' })
  })

  it('surfaces a thrown parse failure as ResponseValidationError', async () => {
    await expect(noSchema().get('/bad').json(parse)).rejects.toBeInstanceOf(
      ResponseValidationError,
    )
  })

  it('works with a DETACHED zod .parse, needing no resolver', async () => {
    const Schema = z.object({ id: z.string(), name: z.string() })
    expect(await noSchema().get('/good').json(Schema.parse)).toEqual({ id: '1', name: 'Ada' })
  })

  it('carries the raw body on the error so a reporter can show it', async () => {
    const error = await noSchema()
      .get('/bad')
      .json(() => {
        throw new Error('nope')
      })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ResponseValidationError)
    expect((error as ResponseValidationError).value).toEqual({ id: 1, name: 'Ada' })
  })
})

describe('tier 2 — zod', () => {
  const Schema = z.object({ id: z.string() })

  it('accepts a valid body and infers the output', async () => {
    const user = await withSchema().get('/good').json(Schema)
    expectTypeOf(user).toEqualTypeOf<{ id: string }>()
    expect(user.id).toBe('1')
  })

  it('REJECTS an invalid body', async () => {
    await expect(withSchema().get('/bad').json(Schema)).rejects.toBeInstanceOf(
      ResponseValidationError,
    )
  })
})

describe('tier 2 — valibot', () => {
  const Schema = v.object({ id: v.string() })

  it('accepts a valid body and infers the output', async () => {
    const user = await withSchema().get('/good').json(Schema)
    expectTypeOf(user).toEqualTypeOf<{ id: string }>()
    expect(user.id).toBe('1')
  })

  it('REJECTS an invalid body — its failure result carries `value` too', async () => {
    // valibot failure = `{ typed: false, value: <raw>, issues: [...] }`.
    // Discriminating on `'value' in result` would accept this as success.
    await expect(withSchema().get('/bad').json(Schema)).rejects.toBeInstanceOf(
      ResponseValidationError,
    )
  })
})

describe('tier 2 — arktype (callable schemas)', () => {
  const Schema = type({ id: 'string' })

  it('is a FUNCTION — the property that breaks naive detection', () => {
    expect(typeof Schema).toBe('function')
  })

  it('accepts a valid body and infers the OUTPUT, not ArkErrors | Output', async () => {
    const user = await withSchema().get('/good').json(Schema)
    expectTypeOf(user).toEqualTypeOf<{ id: string }>()
    expect(user.id).toBe('1')
  })

  it('REJECTS an invalid body instead of resolving with ArkErrors as data', async () => {
    // Regression lock, both halves. ArkType RETURNS its errors rather than
    // throwing, so a `typeof === 'function'` fast path ahead of the schema
    // resolver resolves with an `ArkErrors` array masquerading as valid.
    const error = await withSchema().get('/bad').json(Schema).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ResponseValidationError)
    expect((error as ResponseValidationError).message).toContain('id')
  })

  it('still routes a plain function to Tier 1 when a resolver is configured', async () => {
    expect(await withSchema().get('/good').json((raw) => raw as { id: string })).toEqual({
      id: '1',
      name: 'Ada',
    })
  })
})

describe('tier 2 — shapes the Record-constrained helpers cannot express', () => {
  it('validates a top-level ARRAY', async () => {
    const list = await withSchema().get('/list').json(z.array(z.number()))
    expectTypeOf(list).toEqualTypeOf<number[]>()
    expect(list).toEqual([1, 2, 3])

    await expect(withSchema().get('/list').json(z.array(z.string()))).rejects.toBeInstanceOf(
      ResponseValidationError,
    )
  })

  it('validates a top-level SCALAR', async () => {
    const n = await withSchema().get('/scalar').json(z.number())
    expectTypeOf(n).toEqualTypeOf<number>()
    expect(n).toBe(42)
  })

  it('applies a COERCING schema — the value is transformed, not just checked', async () => {
    const api = createHttp({
      use: [mock([{ path: '/n', json: { n: '42' } }])],
      schema: standardSchema,
    })
    const result = await api.get('/n').json(z.object({ n: z.coerce.number() }))
    expectTypeOf(result).toEqualTypeOf<{ n: number }>()
    expect(result.n).toBe(42)
  })
})

describe('tier 2 — diagnostics', () => {
  it('rejects an ASYNC schema loudly rather than returning a Promise as data', async () => {
    const asyncSchema = z.object({ id: z.string() }).refine(async () => true)
    await expect(withSchema().get('/good').json(asyncSchema)).rejects.toThrow(
      /async schemas are not supported/,
    )
  })

  it('explains how to enable Tier 2 when no resolver is configured', async () => {
    await expect(noSchema().get('/good').json(z.object({ id: z.string() }))).rejects.toThrow(
      /no schema resolver is configured/,
    )
  })

  it('returns null for a non-schema so the client can diagnose it', () => {
    expect(standardSchema({})).toBeNull()
    expect(standardSchema(null)).toBeNull()
    expect(standardSchema(() => 1)).toBeNull()
  })

  it('summarises many issues without dumping all of them', async () => {
    const api = createHttp({
      use: [mock([{ path: '/many', json: {} }])],
      schema: standardSchema,
    })
    const Schema = z.object(
      Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`f${i}`, z.string()])),
    )
    const error = await api.get('/many').json(Schema).catch((e: unknown) => e)
    expect((error as ResponseValidationError).message).toContain('and 3 more')
  })
})

describe('validate modes', () => {
  const Schema = z.object({ id: z.string() })

  it("'warn' passes the RAW body through and warns", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = createHttp({ use: [mock(routes)], schema: standardSchema, validate: 'warn' })

    const result = await api.get('/bad').json(Schema)

    expect(result).toEqual({ id: 1, name: 'Ada' })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('did not match its schema')
    warn.mockRestore()
  })

  it("'off' skips validation entirely", async () => {
    const api = createHttp({ use: [mock(routes)], schema: standardSchema, validate: 'off' })
    expect(await api.get('/bad').json(Schema)).toEqual({ id: 1, name: 'Ada' })
  })

  it("'strict' is the default", async () => {
    await expect(withSchema().get('/bad').json(Schema)).rejects.toBeInstanceOf(
      ResponseValidationError,
    )
  })

  it('inherits the mode through extend()', async () => {
    const base = createHttp({ use: [mock(routes)], schema: standardSchema, validate: 'off' })
    expect(await base.extend({ baseUrl: '' }).get('/bad').json(Schema)).toBeTruthy()
  })
})
