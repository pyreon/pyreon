/**
 * Targeted coverage tests for branches the main suite leaves uncovered.
 *
 * Grouped by file so the rationale for each block is visible at the
 * source. The main `validator.test.ts` covers the happy paths + the
 * cross-lib StdSchema compat; this file fills in the long tail
 * (error branches, less-common modifiers, async paths, less-common
 * primitive checks, transform shorthand, pipe shape, `~standard`
 * async branch, etc.) so the package can sit at the 90/85/90
 * fundamentals floor without the v1 BELOW_FLOOR_EXEMPTIONS carve-out.
 */

import { describe, expect, it } from 'vitest'
import { ValidationError } from '../core/issue'
import { array, boolean, number, object, pipe, s, string } from '../v1'

// ─── String transforms (toLowerCase / toUpperCase / trim) ─────────────

describe('string transforms — toLowerCase / toUpperCase / trim', () => {
  it('toLowerCase normalises input then continues the chain', () => {
    const schema = s.string().toLowerCase().min(2)
    const r = schema.parse('HI')
    expect(r).toEqual({ ok: true, value: 'hi' })
  })

  it('toUpperCase normalises input then continues the chain', () => {
    const schema = s.string().toUpperCase()
    expect(schema.parse('hello')).toEqual({ ok: true, value: 'HELLO' })
  })

  it('trim removes whitespace before further checks', () => {
    const schema = s.string().trim().min(3)
    expect(schema.parse('   abc   ')).toEqual({ ok: true, value: 'abc' })
  })

  it('transforms are no-op when the input is not a string (type-check fires first)', () => {
    const schema = s.string().toLowerCase()
    const r = schema.parse(42)
    expect(r.ok).toBe(false)
  })

  it('combined transforms apply in declaration order', () => {
    const schema = s.string().trim().toLowerCase()
    expect(schema.parse('  ABC  ')).toEqual({ ok: true, value: 'abc' })
  })
})

// ─── pipe() function-comp helper ──────────────────────────────────────

describe('pipe() function-comp helper', () => {
  it('threads through a chain of step functions', () => {
    const schema = pipe(
      s.string(),
      (s) => s.min(2),
      (s) => s.max(5),
    )
    expect(schema.parse('hi').ok).toBe(true)
    expect(schema.parse('h').ok).toBe(false)
    expect(schema.parse('hello!').ok).toBe(false)
  })

  it('returns the schema unchanged when no actions are passed', () => {
    const schema = s.string()
    const out = pipe(schema)
    expect(out).toBe(schema)
  })

  it('preserves schema identity across step functions', () => {
    const schema = s.string()
    const out = pipe(schema, (s) => s.email())
    // chainable methods mutate `this` and return `this`, so identity holds
    expect(out).toBe(schema)
  })

  it('composes with named function exports', () => {
    const schema = pipe(
      number(),
      (s) => s.int(),
      (s) => s.between(0, 100),
    )
    expect(schema.parse(50).ok).toBe(true)
    expect(schema.parse(101).ok).toBe(false)
  })
})

// ─── String — remaining uncovered branches ────────────────────────────

describe('string — remaining checks', () => {
  it('length(n) rejects wrong length', () => {
    const schema = s.string().length(3)
    expect(schema.parse('abc').ok).toBe(true)
    expect(schema.parse('ab').ok).toBe(false)
    expect(schema.parse('abcd').ok).toBe(false)
  })

  it('nonEmpty rejects empty string', () => {
    const schema = s.string().nonEmpty()
    expect(schema.parse('a').ok).toBe(true)
    expect(schema.parse('').ok).toBe(false)
  })

  it('iso.time accepts HH:MM:SS', () => {
    const schema = s.string().iso.time()
    expect(schema.parse('08:30:00').ok).toBe(true)
    expect(schema.parse('25:00:00').ok).toBe(true) // regex is HH:MM:SS shape only — not range-clamped
    expect(schema.parse('not a time').ok).toBe(false)
  })

  it('endsWith rejects mismatched suffix', () => {
    const schema = s.string().endsWith('bar')
    expect(schema.parse('foobar').ok).toBe(true)
    expect(schema.parse('foobaz').ok).toBe(false)
  })

  it('includes rejects when substring is missing', () => {
    const schema = s.string().includes('xyz')
    expect(schema.parse('abc').ok).toBe(false)
  })

  it('url rejects non-URLs', () => {
    const schema = s.string().url()
    expect(schema.parse('https://example.com').ok).toBe(true)
    expect(schema.parse('not a url').ok).toBe(false)
  })

  it('regex happy path passes through', () => {
    const schema = s.string().regex(/^[a-z]+$/)
    expect(schema.parse('hello').ok).toBe(true)
  })
})

// ─── Number — remaining uncovered branches ────────────────────────────

describe('number — remaining checks', () => {
  it('negative rejects 0 and positives', () => {
    const schema = s.number().negative()
    expect(schema.parse(-1).ok).toBe(true)
    expect(schema.parse(0).ok).toBe(false)
    expect(schema.parse(1).ok).toBe(false)
  })

  it('nonPositive accepts 0 and negatives, rejects positives', () => {
    const schema = s.number().nonPositive()
    expect(schema.parse(0).ok).toBe(true)
    expect(schema.parse(-1).ok).toBe(true)
    expect(schema.parse(1).ok).toBe(false)
  })

  it('finite rejects -Infinity', () => {
    const schema = s.number().finite()
    expect(schema.parse(Number.NEGATIVE_INFINITY).ok).toBe(false)
  })

  it('multipleOf rejects non-multiples (with payload)', () => {
    const r = s.number().multipleOf(3).parse(7)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect((r.issues[0] as { key?: string }).key).toBe('validate.number.not-multiple-of')
      const params = (r.issues[0] as { params?: Record<string, unknown> }).params
      expect(params?.divisor).toBe(3)
    }
  })

  it('max rejects values above the bound', () => {
    expect(s.number().max(10).parse(11).ok).toBe(false)
    expect(s.number().max(10).parse(10).ok).toBe(true)
  })
})

// ─── Boolean — coverage of the rejection path ─────────────────────────

describe('boolean — rejection branches', () => {
  it('rejects undefined when not optional', () => {
    expect(s.boolean().parse(undefined).ok).toBe(false)
  })

  it('rejects object inputs', () => {
    expect(s.boolean().parse({}).ok).toBe(false)
  })
})

// ─── Array — error + length branches ──────────────────────────────────

describe('array — error + length branches', () => {
  it('length(n) rejects wrong-length arrays', () => {
    const schema = s.array(s.string()).length(2)
    expect(schema.parse(['a', 'b']).ok).toBe(true)
    expect(schema.parse(['a']).ok).toBe(false)
    expect(schema.parse(['a', 'b', 'c']).ok).toBe(false)
  })

  it('nonEmpty rejects empty arrays', () => {
    const schema = s.array(s.string()).nonEmpty()
    expect(schema.parse(['a']).ok).toBe(true)
    expect(schema.parse([]).ok).toBe(false)
  })

  it('records issue path with element index for nested errors', () => {
    const schema = s.array(s.object({ id: s.number() }))
    const r = schema.parse([{ id: 1 }, { id: 'bad' }])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const paths = r.issues.map((i) =>
        (i.path ?? [])
          .map((seg) =>
            typeof seg === 'object' && seg !== null && 'key' in seg ? String(seg.key) : String(seg),
          )
          .join('.'),
      )
      expect(paths.some((p) => p.startsWith('1.id'))).toBe(true)
    }
  })

  it('async element schema in sync parse pushes the actionable issue', async () => {
    // An async refine forces the element's compiled validator to
    // return a Promise — array's sync iteration MUST flag this.
    const asyncElement = s.string().refine(async (v) => v.length > 0, {
      message: 'must be non-empty (async)',
    })
    const schema = s.array(asyncElement)
    const r = schema.parse(['a'])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues.some((i) => i.message.includes('async element schema'))).toBe(true)
    }
    // Sanity: the async element itself works through parseAsync directly.
    const asyncResult = await asyncElement.parseAsync('a')
    expect(asyncResult.ok).toBe(true)
  })
})

// ─── Object — async-field branch + optional/key-presence merge ────────

describe('object — async-field branch + optional/key-presence', () => {
  it('async field in sync parse pushes the actionable issue', () => {
    const asyncField = s.string().refine(async (v) => v.length > 0, {
      message: 'must be non-empty (async)',
    })
    const schema = s.object({ name: asyncField })
    const r = schema.parse({ name: 'a' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues.some((i) => i.message.includes('async schema used in sync parse'))).toBe(true)
    }
  })

  it('optional field omitted is NOT copied into the result object', () => {
    const schema = s.object({
      name: s.string(),
      bio: s.string().optional(),
    })
    const r = schema.parse({ name: 'Alice' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect('bio' in r.value).toBe(false)
    }
  })

  it('optional field explicitly set to undefined IS copied (key was in source)', () => {
    const schema = s.object({
      name: s.string(),
      bio: s.string().optional(),
    })
    const r = schema.parse({ name: 'Alice', bio: undefined })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect('bio' in r.value).toBe(true)
      expect(r.value.bio).toBeUndefined()
    }
  })
})

// ─── Schema base — base-class-only branches ───────────────────────────

describe('schema base — modifiers + parseAsync + brand', () => {
  it('parseAsync returns the same Result shape on success', async () => {
    const schema = s.string().transform(async (v) => v.toUpperCase())
    const r = await schema.parseAsync('hello')
    expect(r).toEqual({ ok: true, value: 'HELLO' })
  })

  it('parseAsync surfaces a thrown error as an issue (not a hard throw)', async () => {
    const schema = s.string().transform(async () => {
      throw new Error('boom')
    })
    const r = await schema.parseAsync('hello')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues[0]?.message).toContain('parse threw')
      expect(r.issues[0]?.message).toContain('boom')
    }
  })

  it('parse() returns an actionable issue when transform returns a Promise sync-path', () => {
    const schema = s.string().transform(async (v) => v.toUpperCase())
    const r = schema.parse('hello')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues[0]?.message).toContain('schema is async')
    }
  })

  it('brand() returns a schema with a phantom type marker (runtime identity)', () => {
    const schema = s.string().brand<'UserId'>()
    expect(schema.parse('u_123').ok).toBe(true)
  })

  it('async refine surfaces issue via parseAsync', async () => {
    const schema = s.string().refine(async (v) => v.length > 2, {
      message: 'too short async',
    })
    const ok = await schema.parseAsync('hello')
    expect(ok.ok).toBe(true)
    const bad = await schema.parseAsync('a')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.issues[0]?.message).toBe('too short async')
  })

  it('~standard.validate awaits async transform branch', async () => {
    const schema = s.string().transform(async (v) => v.length)
    const result = schema['~standard'].validate('hello')
    expect(result).toBeInstanceOf(Promise)
    const resolved = await result
    expect(resolved).toEqual({ value: 5 })
  })

  it('~standard.validate async branch surfaces issues from earlier checks', async () => {
    const schema = s
      .string()
      .min(10)
      .transform(async (v) => v.length)
    const result = schema['~standard'].validate('hi')
    expect(result).toBeInstanceOf(Promise)
    const resolved = await result
    expect('issues' in resolved).toBe(true)
  })
})

// ─── Issue + ValidationError ──────────────────────────────────────────

describe('ValidationError + path formatting', () => {
  it('formats the head issue path into the message', () => {
    const schema = s.object({ user: s.object({ name: s.string() }) })
    try {
      schema.parseOrThrow({ user: { name: 42 } })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const ve = err as ValidationError
      expect(ve.message).toMatch(/user\.name/)
      expect(ve.issues.length).toBeGreaterThan(0)
    }
  })

  it('renders correctly when path is empty', () => {
    try {
      s.string().parseOrThrow(42)
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      const ve = err as ValidationError
      // No path prefix when path is empty
      expect(ve.message).toMatch(/^\[Pyreon\] Expected string/)
    }
  })

  it('appends "(and N more)" when multiple issues are present', () => {
    const schema = s.object({ a: s.string(), b: s.string() })
    try {
      schema.parseOrThrow({ a: 1, b: 2 })
      throw new Error('expected throw')
    } catch (err) {
      const ve = err as ValidationError
      expect(ve.message).toContain('(and 1 more)')
    }
  })

  it('handles { key } path segments via Standard Schema interop', () => {
    // Manually construct a ValidationError with a StdSchema-shaped path.
    const ve = new ValidationError([{ message: 'bad', path: [{ key: 'user' }, { key: 'name' }] }])
    expect(ve.message).toMatch(/user\.name/)
  })

  it('renders a sane fallback when issues array is empty', () => {
    const ve = new ValidationError([])
    expect(ve.message).toContain('validation failed')
  })

  it('typeIssue describes complex actuals correctly', () => {
    const schemaArr = s.string().parse([])
    expect(schemaArr.ok).toBe(false)
    if (!schemaArr.ok) {
      expect(schemaArr.issues[0]?.message).toBe('Expected string, received array')
    }
    const schemaNull = s.string().parse(null)
    expect(schemaNull.ok).toBe(false)
    if (!schemaNull.ok) {
      // null falls through modifier prelude — no nullable here — and lands as type error.
      expect(schemaNull.issues[0]?.message).toBe('Expected string, received null')
    }
    const schemaObj = s.string().parse({ foo: 1 })
    expect(schemaObj.ok).toBe(false)
    if (!schemaObj.ok) {
      expect(schemaObj.issues[0]?.message).toBe('Expected string, received object')
    }
  })
})

// ─── Named function-comp exports beyond what validator.test covered ───

describe('named function-comp exports — additional coverage', () => {
  it('array() + object() compose as expected', () => {
    const schema = array(object({ name: string() }))
    expect(schema.parse([{ name: 'Alice' }]).ok).toBe(true)
  })

  it('boolean() rejects mismatched types', () => {
    expect(boolean().parse('true').ok).toBe(false)
  })
})

// ─── watchValid — async-schema branch ─────────────────────────────────

describe('watchValid — async schema is silent (does not fire)', () => {
  it('returns undefined from the tracker when validate() returns a Promise (the caller should use parseReactiveAsync)', async () => {
    const { signal } = await import('@pyreon/reactivity')
    const { watchValid } = await import('../reactive')
    const asyncSchema = s.string().refine(async (v) => v.length > 0, {
      message: 'async refine',
    })
    const $input = signal('hello')
    const calls: boolean[] = []
    const stop = watchValid(asyncSchema, $input, (v) => calls.push(v))
    // Initial run sees the Promise → tracker returns undefined → filter
    // drops it, callback never fires.
    expect(calls).toEqual([])
    stop()
  })
})
