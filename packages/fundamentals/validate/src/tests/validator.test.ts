/**
 * Tests for the Pyreon-validate validator runtime.
 *
 * Covers primitives × checks × modifiers × composition + parse paths
 * (`.parse`, `.parseOrThrow`, `~standard.validate`). The DX layer
 * (`withField`, `parseReactive`, `formatErrors`) is tested separately
 * in `meta.test.ts` / `format.test.ts` / `reactive.test.ts` — those
 * suites continue working unchanged because the validator's schemas
 * implement Standard Schema natively.
 */

import { describe, expect, it } from 'vitest'
import type { Infer } from '../core/infer'
import { ValidationError } from '../core/issue'
import { getMeta } from '../meta'
import { array, boolean, enum_, literal, number, object, s, string } from '../v1'

// ─── Primitives ────────────────────────────────────────────────────────

describe('s.string', () => {
  it('parses valid strings', () => {
    const r = s.string().parse('hello')
    expect(r).toEqual({ ok: true, value: 'hello' })
  })

  it('rejects non-strings with a typed issue', () => {
    const r = s.string().parse(42)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues[0]?.message).toBe('Expected string, received number')
      expect((r.issues[0] as { code?: string }).code).toBe('wrong_type')
      expect((r.issues[0] as { key?: string }).key).toBe('validate.string.required')
    }
  })

  it('chains min + max', () => {
    const schema = s.string().min(2).max(5)
    expect(schema.parse('hi').ok).toBe(true)
    expect(schema.parse('hello').ok).toBe(true)
    expect(schema.parse('h').ok).toBe(false)
    expect(schema.parse('hello!').ok).toBe(false)
  })

  it('email check', () => {
    const schema = s.string().email()
    expect(schema.parse('foo@bar.com').ok).toBe(true)
    expect(schema.parse('not-an-email').ok).toBe(false)
  })

  it('uuid check', () => {
    const schema = s.string().uuid()
    expect(schema.parse('550e8400-e29b-41d4-a716-446655440000').ok).toBe(true)
    expect(schema.parse('not-a-uuid').ok).toBe(false)
  })

  it('iso.date check', () => {
    const schema = s.string().iso.date()
    expect(schema.parse('2026-05-25').ok).toBe(true)
    expect(schema.parse('25 May 2026').ok).toBe(false)
  })

  it('iso.dateTime check', () => {
    const schema = s.string().iso.dateTime()
    expect(schema.parse('2026-05-25T08:30:00Z').ok).toBe(true)
    expect(schema.parse('2026-05-25').ok).toBe(false)
  })

  it('regex check uses custom message', () => {
    const schema = s.string().regex(/^[a-z]+$/, { fallback: 'lowercase only' })
    const r = schema.parse('Hello')
    expect(r.ok).toBe(false)
    if (!r.ok) expect((r.issues[0] as { fallback?: string }).fallback).toBe('lowercase only')
  })

  it('startsWith / endsWith / includes', () => {
    expect(s.string().startsWith('foo').parse('foobar').ok).toBe(true)
    expect(s.string().startsWith('foo').parse('barbaz').ok).toBe(false)
    expect(s.string().endsWith('bar').parse('foobar').ok).toBe(true)
    expect(s.string().includes('oba').parse('foobar').ok).toBe(true)
  })

  it('issues carry i18n key + params for interpolation', () => {
    const r = s.string().min(5).parse('hi')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const issue = r.issues[0] as {
        key?: string
        params?: Record<string, unknown>
        fallback?: string
      }
      expect(issue.key).toBe('validate.string.too-short')
      expect(issue.params).toEqual({ min: 5, actual: 2 })
      expect(issue.fallback).toBe('Must be at least 5 characters')
    }
  })

  it('custom check opts override defaults', () => {
    const schema = s.string().min(2, {
      key: 'profile.name.too-short',
      fallback: 'Name too short',
      params: { hint: 'use a longer name' },
    })
    const r = schema.parse('a')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const issue = r.issues[0] as {
        key?: string
        params?: Record<string, unknown>
        fallback?: string
      }
      expect(issue.key).toBe('profile.name.too-short')
      expect(issue.params).toEqual({ hint: 'use a longer name' })
      expect(issue.fallback).toBe('Name too short')
    }
  })
})

describe('s.number', () => {
  it('parses valid numbers', () => {
    expect(s.number().parse(42).ok).toBe(true)
    expect(s.number().parse(0).ok).toBe(true)
    expect(s.number().parse(-1.5).ok).toBe(true)
  })

  it('rejects NaN', () => {
    expect(s.number().parse(Number.NaN).ok).toBe(false)
  })

  it('rejects strings + bools', () => {
    expect(s.number().parse('42').ok).toBe(false)
    expect(s.number().parse(true).ok).toBe(false)
  })

  it('int check', () => {
    expect(s.number().int().parse(42).ok).toBe(true)
    expect(s.number().int().parse(1.5).ok).toBe(false)
  })

  it('between check', () => {
    const schema = s.number().between(0, 100)
    expect(schema.parse(50).ok).toBe(true)
    expect(schema.parse(0).ok).toBe(true)
    expect(schema.parse(100).ok).toBe(true)
    expect(schema.parse(-1).ok).toBe(false)
    expect(schema.parse(101).ok).toBe(false)
  })

  it('positive / negative', () => {
    expect(s.number().positive().parse(1).ok).toBe(true)
    expect(s.number().positive().parse(0).ok).toBe(false)
    expect(s.number().negative().parse(-1).ok).toBe(true)
    expect(s.number().nonNegative().parse(0).ok).toBe(true)
  })

  it('multipleOf', () => {
    expect(s.number().multipleOf(5).parse(15).ok).toBe(true)
    expect(s.number().multipleOf(5).parse(7).ok).toBe(false)
  })

  it('finite', () => {
    expect(s.number().finite().parse(1).ok).toBe(true)
    expect(s.number().finite().parse(Number.POSITIVE_INFINITY).ok).toBe(false)
  })
})

describe('s.boolean', () => {
  it('parses booleans', () => {
    expect(s.boolean().parse(true).ok).toBe(true)
    expect(s.boolean().parse(false).ok).toBe(true)
  })

  it('rejects non-booleans', () => {
    expect(s.boolean().parse('true').ok).toBe(false)
    expect(s.boolean().parse(1).ok).toBe(false)
    expect(s.boolean().parse(null).ok).toBe(false)
  })
})

describe('s.literal', () => {
  it('matches exact value', () => {
    expect(s.literal('foo').parse('foo').ok).toBe(true)
    expect(s.literal('foo').parse('bar').ok).toBe(false)
    expect(s.literal(42).parse(42).ok).toBe(true)
    expect(s.literal(true).parse(true).ok).toBe(true)
  })
})

describe('s.enum', () => {
  it('matches one of the allowed values', () => {
    const schema = s.enum(['admin', 'user', 'guest'] as const)
    expect(schema.parse('admin').ok).toBe(true)
    expect(schema.parse('user').ok).toBe(true)
    expect(schema.parse('hacker').ok).toBe(false)
  })

  it('infers as a union of literal types', () => {
    const schema = s.enum(['admin', 'user'] as const)
    type Role = Infer<typeof schema>
    const a: Role = 'admin' // typechecks
    expect(a).toBe('admin')
  })
})

// ─── Composition ───────────────────────────────────────────────────────

describe('s.object', () => {
  const userSchema = s.object({
    name: s.string().min(2),
    age: s.number().int().nonNegative(),
  })

  it('parses valid objects', () => {
    const r = userSchema.parse({ name: 'Alice', age: 30 })
    expect(r).toEqual({ ok: true, value: { name: 'Alice', age: 30 } })
  })

  it('rejects when type-check fails on a field', () => {
    const r = userSchema.parse({ name: 'A', age: 'thirty' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const paths = r.issues.map((i) => (Array.isArray(i.path) ? i.path.join('.') : ''))
      expect(paths).toContain('name') // min(2) failed
      expect(paths).toContain('age') // type failed
    }
  })

  it('strips unknown keys', () => {
    const r = userSchema.parse({ name: 'Alice', age: 30, extra: 'ignored' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toEqual({ name: 'Alice', age: 30 })
      expect('extra' in r.value).toBe(false)
    }
  })

  it('rejects non-objects (arrays, null, primitives)', () => {
    expect(userSchema.parse([]).ok).toBe(false)
    expect(userSchema.parse(null).ok).toBe(false)
    expect(userSchema.parse('not an object').ok).toBe(false)
  })

  it('infers shape correctly', () => {
    type User = Infer<typeof userSchema>
    const u: User = { name: 'Alice', age: 30 } // typechecks
    expect(u.name).toBe('Alice')
  })

  it('reports multiple errors in one pass', () => {
    const r = userSchema.parse({ name: '', age: -1 })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      // min(2) on name + nonNegative on age → 2 issues
      expect(r.issues.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('handles optional fields', () => {
    const schema = s.object({
      name: s.string(),
      bio: s.string().optional(),
    })
    expect(schema.parse({ name: 'A' }).ok).toBe(true)
    expect(schema.parse({ name: 'A', bio: 'hi' }).ok).toBe(true)
  })
})

describe('s.array', () => {
  it('parses arrays with valid elements', () => {
    const schema = s.array(s.string())
    const r = schema.parse(['a', 'b', 'c'])
    expect(r).toEqual({ ok: true, value: ['a', 'b', 'c'] })
  })

  it('rejects array with invalid element + reports correct path', () => {
    const schema = s.array(s.number())
    const r = schema.parse([1, 2, 'three'])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const paths = r.issues.map((i) => (Array.isArray(i.path) ? i.path.join('.') : ''))
      expect(paths).toContain('2') // index 2
    }
  })

  it('rejects non-arrays', () => {
    expect(s.array(s.string()).parse({}).ok).toBe(false)
    expect(s.array(s.string()).parse('hello').ok).toBe(false)
  })

  it('array min/max checks', () => {
    expect(s.array(s.string()).min(2).parse(['a']).ok).toBe(false)
    expect(s.array(s.string()).min(2).parse(['a', 'b']).ok).toBe(true)
    expect(s.array(s.string()).max(2).parse(['a', 'b', 'c']).ok).toBe(false)
  })
})

// ─── Modifiers ─────────────────────────────────────────────────────────

describe('modifiers', () => {
  it('optional accepts undefined', () => {
    const schema = s.string().optional()
    expect(schema.parse(undefined).ok).toBe(true)
    expect(schema.parse('hello').ok).toBe(true)
    expect(schema.parse(42).ok).toBe(false) // still type-checks
  })

  it('nullable accepts null', () => {
    const schema = s.string().nullable()
    expect(schema.parse(null).ok).toBe(true)
    expect(schema.parse('hello').ok).toBe(true)
    expect(schema.parse(undefined).ok).toBe(false)
  })

  it('nullish accepts both null and undefined', () => {
    const schema = s.string().nullish()
    expect(schema.parse(null).ok).toBe(true)
    expect(schema.parse(undefined).ok).toBe(true)
    expect(schema.parse('hello').ok).toBe(true)
  })

  it('default fills in undefined', () => {
    const schema = s.string().default('fallback')
    const r = schema.parse(undefined)
    expect(r).toEqual({ ok: true, value: 'fallback' })
  })

  it('default works with a function', () => {
    let counter = 0
    const schema = s.string().default(() => `value-${counter++}`)
    expect(schema.parse(undefined)).toEqual({ ok: true, value: 'value-0' })
    expect(schema.parse(undefined)).toEqual({ ok: true, value: 'value-1' })
  })

  it('transform maps the value', () => {
    const schema = s.string().transform((str) => str.length)
    const r = schema.parse('hello')
    expect(r).toEqual({ ok: true, value: 5 })
  })

  it('refine validates additional conditions', () => {
    const schema = s.string().refine((str) => str === str.toLowerCase(), {
      message: 'Must be lowercase',
      code: 'custom',
      key: 'common.lowercase',
    })
    expect(schema.parse('hello').ok).toBe(true)
    const r = schema.parse('Hello')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues[0]?.message).toBe('Must be lowercase')
      expect((r.issues[0] as { key?: string }).key).toBe('common.lowercase')
    }
  })

  it('describe attaches hint metadata', () => {
    const schema = s.string().describe('User name')
    expect(getMeta(schema)?.hint).toBe('User name')
  })

  it('field attaches metadata', () => {
    const schema = s.string().field({ label: 'Email', i18nLabel: 'auth.email' })
    expect(getMeta(schema)).toEqual({ label: 'Email', i18nLabel: 'auth.email' })
  })
})

// ─── Parse entry points ───────────────────────────────────────────────

describe('parse entry points', () => {
  it('.parse returns Result discriminated union (no throw)', () => {
    const schema = s.string()
    const ok = schema.parse('hello')
    const fail = schema.parse(42)
    expect(ok.ok).toBe(true)
    expect(fail.ok).toBe(false)
  })

  it('.parseOrThrow throws ValidationError on failure', () => {
    expect(() => s.number().parseOrThrow('not a number')).toThrow(ValidationError)
    expect(s.number().parseOrThrow(42)).toBe(42)
  })

  it('.safeParse aliases .parse (Zod-compat)', () => {
    const schema = s.string()
    expect(schema.safeParse('hello')).toEqual(schema.parse('hello'))
  })

  it('~standard.validate returns the StdSchema-spec shape', () => {
    const schema = s.string().email()
    const ok = schema['~standard'].validate('foo@bar.com')
    expect(ok).toEqual({ value: 'foo@bar.com' })
    const fail = schema['~standard'].validate('bad')
    expect('issues' in fail).toBe(true)
  })
})

// ─── Standard Schema compliance ───────────────────────────────────────

describe('Standard Schema v1 compliance', () => {
  it('every schema has ~standard with vendor + version + validate', () => {
    const schema = s.string()
    const std = schema['~standard']
    expect(std.vendor).toBe('pyreon-validate')
    expect(std.version).toBe(1)
    expect(typeof std.validate).toBe('function')
  })

  it('plugs into bindSchema from @pyreon/validation', async () => {
    // Lazy-load to avoid circular issues if @pyreon/validation isn't installed.
    const { isStandardSchema, wrapStandardSchema } = await import('@pyreon/validation')
    const schema = s.object({ name: s.string() })
    expect(isStandardSchema(schema)).toBe(true)
    // Cast: @pyreon/validation's StandardSchemaShape uses a looser
    // `{ value } | { issues }` shape (no mutual-undefined discriminator);
    // our schema uses the strict discriminator. Runtime is identical;
    // the cast resolves the typecheck-only mismatch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = wrapStandardSchema<{ name: string }>(schema as any)
    const r = parser({ name: 'Alice' })
    expect(r).toEqual({ ok: true, value: { name: 'Alice' } })
  })
})

// ─── Named function exports (hybrid API) ──────────────────────────────

describe('named function exports', () => {
  it('string() === s.string() (same constructor)', () => {
    const a = string()
    const b = s.string()
    expect(a).toBeInstanceOf(Object)
    expect(b).toBeInstanceOf(Object)
    expect(a.constructor).toBe(b.constructor)
  })

  it('number() chain produces identical schema to s.number() chain', () => {
    const a = number().int().min(0).parse(5)
    const b = s.number().int().min(0).parse(5)
    expect(a).toEqual(b)
  })

  it('object({ name: string() }) parses like s.object({ name: s.string() })', () => {
    const a = object({ name: string() }).parse({ name: 'Alice' })
    const b = s.object({ name: s.string() }).parse({ name: 'Alice' })
    expect(a).toEqual(b)
  })

  it('enum_ is exported under s.enum', () => {
    expect(enum_(['a', 'b']).parse('a').ok).toBe(true)
    expect(s.enum(['a', 'b']).parse('a').ok).toBe(true)
  })

  it('boolean / literal / array all match across chainable + function forms', () => {
    expect(boolean().parse(true).ok).toBe(true)
    expect(literal('x').parse('x').ok).toBe(true)
    expect(array(string()).parse(['a']).ok).toBe(true)
  })
})

// ─── Op-compiler memoization (perf contract) ──────────────────────────

describe('op-compiler memoization', () => {
  it('compiles once per schema instance', () => {
    const schema = s.string().min(2).max(10).email()
    // Parse 100 times — first call compiles, subsequent ones reuse.
    for (let i = 0; i < 100; i++) {
      schema.parse('foo@bar.com')
    }
    // Internal: the compiled closure should be cached.
    expect((schema as unknown as { _compiled?: unknown })._compiled).toBeDefined()
  })

  it('invalidates the cache when ops change post-first-parse', () => {
    const schema = s.string()
    schema.parse('hello') // compiles
    expect((schema as unknown as { _compiled?: unknown })._compiled).toBeDefined()
    schema.min(2) // mutates — should invalidate
    expect((schema as unknown as { _compiled?: unknown })._compiled).toBeUndefined()
  })
})
