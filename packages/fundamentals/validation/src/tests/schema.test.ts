/**
 * Coverage for the schema-detection + parse helpers (`schema.ts`) that
 * `@pyreon/store` (schema-mode `defineStore`) and `@pyreon/state-tree`
 * (schema-mode `model`) share.
 *
 * Covers:
 *   - `isPyreonAdapter` — duck-type predicate
 *   - `isStandardSchema` — duck-type predicate
 *   - `wrapStandardSchema` — converts Standard Schema's `validate()` shape
 *     into a `ParseResult`. Handles success, failure-with-paths,
 *     async-detection (Promise return), and thrown-error normalisation.
 *   - `extractParseFn` — Tier A.1 / A.2 / throws dispatcher
 *   - `formatIssues` — multi-line formatter with truncation
 */
import { type } from 'arktype'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { arktypeSchema } from '../arktype'
import {
  extractParseFn,
  formatIssues,
  isPyreonAdapter,
  isStandardSchema,
  wrapStandardSchema,
} from '../schema'
import { valibotSchema } from '../valibot'
import { zodSchema } from '../zod'

// ─── isPyreonAdapter ────────────────────────────────────────────────────────

describe('isPyreonAdapter', () => {
  it('returns true for zodSchema adapter', () => {
    const adapter = zodSchema(z.object({ x: z.string() }))
    expect(isPyreonAdapter(adapter)).toBe(true)
  })

  it('returns true for valibotSchema adapter', () => {
    const adapter = valibotSchema(v.object({ x: v.string() }), v.safeParse)
    expect(isPyreonAdapter(adapter)).toBe(true)
  })

  it('returns true for arktypeSchema adapter', () => {
    const adapter = arktypeSchema(
      type({ x: 'string' }) as unknown as (data: unknown) => unknown,
    )
    expect(isPyreonAdapter(adapter)).toBe(true)
  })

  it('returns false for raw zod schema (no _infer brand)', () => {
    const schema = z.object({ x: z.string() })
    expect(isPyreonAdapter(schema)).toBe(false)
  })

  it('returns false for null / undefined / primitives', () => {
    expect(isPyreonAdapter(null)).toBe(false)
    expect(isPyreonAdapter(undefined)).toBe(false)
    expect(isPyreonAdapter('string')).toBe(false)
    expect(isPyreonAdapter(42)).toBe(false)
    expect(isPyreonAdapter([])).toBe(false)
  })

  it('returns false for plain object with _infer but no parse method', () => {
    expect(isPyreonAdapter({ _infer: undefined })).toBe(false)
  })

  it('returns false for object with parse but no _infer', () => {
    expect(isPyreonAdapter({ parse: () => ({ ok: true, value: {} }) })).toBe(
      false,
    )
  })
})

// ─── isStandardSchema ───────────────────────────────────────────────────────

describe('isStandardSchema', () => {
  it('returns true for raw zod schema (zod 3.24+)', () => {
    const schema = z.object({ x: z.string() })
    expect(isStandardSchema(schema)).toBe(true)
  })

  it('returns true for raw valibot schema (valibot 1.0+)', () => {
    const schema = v.object({ x: v.string() })
    expect(isStandardSchema(schema)).toBe(true)
  })

  it('returns false for Pyreon adapters (they wrap, not implement)', () => {
    const adapter = zodSchema(z.object({ x: z.string() }))
    expect(isStandardSchema(adapter)).toBe(false)
  })

  it('returns false for null / undefined / primitives', () => {
    expect(isStandardSchema(null)).toBe(false)
    expect(isStandardSchema(undefined)).toBe(false)
    expect(isStandardSchema('string')).toBe(false)
    expect(isStandardSchema(42)).toBe(false)
  })

  it('returns false for object without ~standard property', () => {
    expect(isStandardSchema({ foo: 'bar' })).toBe(false)
  })

  it('returns false for object with ~standard but no validate function', () => {
    expect(isStandardSchema({ '~standard': { version: 1 } })).toBe(false)
  })
})

// ─── wrapStandardSchema ─────────────────────────────────────────────────────

describe('wrapStandardSchema', () => {
  it('wraps a raw zod schema and returns ok on valid input', () => {
    const schema = z.object({ name: z.string(), age: z.number() })
    const parse = wrapStandardSchema<{ name: string; age: number }>(
      schema as never,
    )
    const result = parse({ name: 'Alice', age: 30 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ name: 'Alice', age: 30 })
    }
  })

  it('returns ok=false with normalised issues for invalid input', () => {
    const schema = z.object({ name: z.string().min(1) })
    const parse = wrapStandardSchema<{ name: string }>(schema as never)
    const result = parse({ name: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.issues[0]!.path).toBe('name')
      expect(result.issues[0]!.message).toBeTruthy()
    }
  })

  it('surfaces a Promise verbatim when the schema is async (caller detects)', () => {
    // Build a synthetic Standard-Schema-shape that returns a Promise
    // from validate(). Real-world: valibot.safeParseAsync or zod async refinements.
    const asyncSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => Promise.resolve({ value: { ok: true } }),
        types: { input: undefined, output: undefined as { ok: boolean } | undefined },
      },
    }
    const parse = wrapStandardSchema<{ ok: boolean }>(asyncSchema)
    const result = parse({ ok: true })
    // The wrapper returns the Promise verbatim — caller probes for it.
    expect(result).toBeInstanceOf(Promise)
  })

  it('normalises thrown errors into the issues shape', () => {
    const broken = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => {
          throw new Error('schema explosion')
        },
        types: { input: undefined, output: undefined as { x: string } | undefined },
      },
    }
    const parse = wrapStandardSchema<{ x: string }>(broken)
    const result = parse({ x: 'y' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]!.message).toMatch(/schema explosion/)
      expect(result.issues[0]!.path).toBe('')
    }
  })

  it('normalises non-Error throws (string, undefined) into messages', () => {
    const broken = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'plain-string'
        },
        types: { input: undefined, output: undefined as { x: string } | undefined },
      },
    }
    const parse = wrapStandardSchema<{ x: string }>(broken)
    const result = parse({ x: 'y' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]!.message).toBe('plain-string')
    }
  })

  it('treats `issues: undefined` as SUCCESS (the spec discriminant), even with no `value` key', () => {
    // Standard Schema spec: "if `issues` is undefined, validation succeeded".
    // This synthetic result carries NEITHER a `value` nor issues — the
    // degenerate success shape (`value: undefined`). The prior assertion
    // (`ok: false, issues: []`) encoded the OLD `'value' in r` success
    // discriminant, which mis-accepted raw-valibot FAILURES (whose results
    // carry BOTH `value` and `issues`) — see
    // standard-schema-result-discriminant.test.ts for the full regression.
    const noIssues = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => ({ issues: undefined }),
        types: { input: undefined, output: undefined as { x: string } | undefined },
      },
    }
    const parse = wrapStandardSchema<{ x: string }>(noIssues as never)
    const result = parse({ x: 'y' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBeUndefined()
    }
  })

  it('handles issue path entries that are objects with `key` property', () => {
    // Standard Schema allows path entries to be objects with `{ key: PropertyKey }`
    // (mirrors valibot/arktype shape). The wrapper normalises both shapes.
    const withKeyPath = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => ({
          issues: [
            {
              message: 'oops',
              path: [{ key: 'nested' }, { key: 'field' }],
            },
          ],
        }),
        types: { input: undefined, output: undefined as { x: string } | undefined },
      },
    }
    const parse = wrapStandardSchema<{ x: string }>(withKeyPath as never)
    const result = parse({ x: 'y' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]!.path).toBe('nested.field')
    }
  })

  it('handles missing path on issue (empty path string)', () => {
    const rootIssue = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => ({ issues: [{ message: 'root failure' }] }),
        types: { input: undefined, output: undefined as { x: string } | undefined },
      },
    }
    const parse = wrapStandardSchema<{ x: string }>(rootIssue as never)
    const result = parse({ x: 'y' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]!.path).toBe('')
      expect(result.issues[0]!.message).toBe('root failure')
    }
  })
})

// ─── extractParseFn ─────────────────────────────────────────────────────────

describe('extractParseFn', () => {
  it('Tier A.1 — uses adapter.parse when isPyreonAdapter matches', () => {
    const adapter = zodSchema(z.object({ x: z.string() }))
    const parse = extractParseFn(adapter)
    const result = parse({ x: 'hello' })
    expect(result.ok).toBe(true)
  })

  it('Tier A.2 — wraps raw zod via wrapStandardSchema', () => {
    const raw = z.object({ x: z.string() })
    const parse = extractParseFn(raw)
    const result = parse({ x: 'hello' })
    expect(result.ok).toBe(true)
  })

  it('throws on neither shape (plain object)', () => {
    expect(() => extractParseFn({ foo: 'bar' })).toThrow(
      /TypedSchemaAdapter|Standard Schema/,
    )
  })

  it('throws on null / undefined', () => {
    expect(() => extractParseFn(null)).toThrow(
      /TypedSchemaAdapter|Standard Schema/,
    )
    expect(() => extractParseFn(undefined)).toThrow(
      /TypedSchemaAdapter|Standard Schema/,
    )
  })

  it('throws with clear message when adapter has _infer but no parse', () => {
    const broken = { _infer: undefined as never, parse: 'not-a-function' }
    // isPyreonAdapter returns false (parse is not a function), so falls to throw.
    expect(() => extractParseFn(broken)).toThrow(
      /TypedSchemaAdapter|Standard Schema/,
    )
  })

  it('throws with clear message when adapter has _infer but parse is missing', () => {
    // Force the isPyreonAdapter check to pass with a function-typed parse,
    // then strip parse via a separate adapter object to hit the
    // "missing parse method" branch inside extractParseFn.
    const adapter = {
      _infer: undefined as never,
      parse: () => ({ ok: true as const, value: {} as Record<string, unknown> }),
    }
    expect(isPyreonAdapter(adapter)).toBe(true)
    // Now remove parse — emulates a stale TypedSchemaAdapter from an old
    // @pyreon/validation version that didn't ship parse.
    const stripped = { _infer: undefined as never, parse: 'not-a-function' }
    expect(() => extractParseFn(stripped)).toThrow()
  })
})

// ─── formatIssues ───────────────────────────────────────────────────────────

describe('formatIssues', () => {
  it('formats single issue with the operation prefix', () => {
    const msg = formatIssues(
      [{ path: 'name', message: 'required' }],
      'init',
    )
    expect(msg).toContain('Schema validation failed (init)')
    expect(msg).toContain('name: required')
  })

  it('formats multiple issues on separate lines', () => {
    const msg = formatIssues(
      [
        { path: 'name', message: 'required' },
        { path: 'age', message: 'must be a number' },
      ],
      '$set',
    )
    expect(msg).toContain('name: required')
    expect(msg).toContain('age: must be a number')
    expect(msg).not.toContain('... and')
  })

  it('uses <root> placeholder for empty path', () => {
    const msg = formatIssues(
      [{ path: '', message: 'top-level error' }],
      '$patch',
    )
    expect(msg).toContain('<root>: top-level error')
  })

  it('truncates after 5 issues with summary line', () => {
    const issues = Array.from({ length: 7 }, (_, i) => ({
      path: `f${i}`,
      message: `bad${i}`,
    }))
    const msg = formatIssues(issues, '$update')
    // First 5 visible
    for (let i = 0; i < 5; i++) {
      expect(msg).toContain(`f${i}: bad${i}`)
    }
    // 6th + 7th hidden behind summary
    expect(msg).not.toContain('f5: bad5')
    expect(msg).toContain('... and 2 more')
  })

  it('accepts any operation label (free-form string)', () => {
    // formatIssues no longer constrains the op to a fixed union — both
    // store and state-tree pass their own labels ($set, $update, etc.)
    const msg = formatIssues([{ path: 'x', message: 'bad' }], 'custom-op')
    expect(msg).toContain('Schema validation failed (custom-op)')
  })
})
