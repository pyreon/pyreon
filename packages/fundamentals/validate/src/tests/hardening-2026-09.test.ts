/**
 * Regression locks for the 2026-09 `@pyreon/validate` audit: string formats
 * (uuid / ipv6 / cidr / url), `withField` isolation, prototype-named error
 * paths, async `toFormValidator`, the jitless switch, `watchValid` on async
 * schemas and subdomain-aware disposable-email detection.
 */
import { signal } from '@pyreon/reactivity'
import { type } from 'arktype'
import * as v from 'valibot'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { configure, s } from '../index'
import { formatErrorsByPath, toFormValidator } from '../format'
import { getMeta, withField } from '../meta'
import { watchValid } from '../reactive'
import { isDisposableEmail } from '../server'
import { validateIp } from '../primitives/string'
import { tryCompileJit } from '../core/jit'

describe('uuid — RFC 9562 versions 1–8 + nil/max', () => {
  const U = s.string().uuid()
  it.each([
    '6ba7b810-9dad-61d1-80b4-00c04fd430c8', // v6
    '017f22e2-79b0-7cc3-98c4-dc0c0c07398f', // v7
    '320c3d4d-cc00-875b-8ec9-32d5f69181c0', // v8
    '00000000-0000-0000-0000-000000000000', // nil
    'ffffffff-ffff-ffff-ffff-ffffffffffff', // max
    'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', // max, upper-case
    '550e8400-e29b-41d4-a716-446655440000', // v4 (control)
  ])('accepts %s', (id) => {
    expect(U.parse(id).ok).toBe(true)
    expect(U.is(id)).toBe(true)
  })
  it.each([
    '550e8400-e29b-01d4-a716-446655440000', // version 0
    '550e8400-e29b-91d4-a716-446655440000', // version 9
    '550e8400-e29b-41d4-c716-446655440000', // wrong variant
    '550e8400e29b41d4a716446655440000', // no dashes
  ])('rejects %s', (id) => {
    expect(U.parse(id).ok).toBe(false)
  })
})

describe('ipv6 — compressed forms and embedded IPv4', () => {
  it.each([
    '2001:db8::1:2',
    'fe80::1:2:3',
    '::ffff:192.0.2.1',
    '::192.0.2.1',
    '64:ff9b::192.0.2.33',
    '2001:db8:0:0:0:0:0:1',
    '1:2:3:4:5:6:7::',
    '::',
    '::1',
    '1::',
    '1:2:3:4:5:6:192.0.2.1',
  ])('accepts %s', (ip) => {
    expect(validateIp(ip)).toBe(true)
    expect(s.string().ip().parse(ip).ok).toBe(true)
  })
  it.each([
    '1:2:3:4:5:6:7:8:9',
    '1::2::3',
    '1:::2',
    ':1::',
    '1:2:3:4:5:6:7:',
    '12345::1',
    'g::1',
    '::ffff:999.0.2.1',
    '1:2:3:4:5:6:7:192.0.2.1',
    ':',
    '',
  ])('rejects %s', (ip) => {
    expect(validateIp(ip)).toBe(false)
  })
  it('cidr uses the same parser', () => {
    expect(s.string().cidr().parse('2001:db8::1:2/64').ok).toBe(true)
    expect(s.string().cidr().parse('::ffff:192.0.2.1/128').ok).toBe(true)
    expect(s.string().cidr().parse('2001:db8::1:2/129').ok).toBe(false)
  })
})

describe('url — single-character hosts', () => {
  it('accepts https://a and http://x.y', () => {
    expect(s.string().url().parse('https://a').ok).toBe(true)
    expect(s.string().url().is('https://a')).toBe(true)
    expect(s.string().url().parse('http://x.y').ok).toBe(true)
  })
  it('still rejects non-http(s) schemes (deliberate — keeps javascript: out of link fields)', () => {
    expect(s.string().url().parse('javascript://x').ok).toBe(false)
    expect(s.string().url().parse('https://').ok).toBe(false)
  })
})

describe('withField — returns an isolated schema', () => {
  it('Pyreon schema: two labels on one base do not overwrite each other', () => {
    const base = s.string()
    const a = withField(base, { label: 'A' })
    const b = withField(base, { label: 'B' })
    expect(getMeta(a)?.label).toBe('A')
    expect(getMeta(b)?.label).toBe('B')
    expect(getMeta(base)).toBeUndefined()
    expect(a.parse('x').ok).toBe(true)
  })

  it('re-wrapping merges', () => {
    const a = withField(withField(s.string(), { label: 'A' }), { hint: 'h' })
    expect(getMeta(a)).toEqual({ label: 'A', hint: 'h' })
  })

  it('foreign schemas (zod / valibot / arktype) stay fully usable and isolated', () => {
    const zBase = z.string().email()
    const za = withField(zBase, { label: 'A' })
    const zb = withField(zBase, { label: 'B' })
    expect(getMeta(za)?.label).toBe('A')
    expect(getMeta(zb)?.label).toBe('B')
    expect(getMeta(zBase)).toBeUndefined()
    expect(za.safeParse('a@b.co').success).toBe(true)
    expect(za['~standard'].validate('nope')).toHaveProperty('issues')

    const vBase = v.pipe(v.string(), v.minLength(2))
    const va = withField(vBase, { label: 'V' })
    expect(getMeta(va)?.label).toBe('V')
    expect(getMeta(vBase)).toBeUndefined()
    expect(v.safeParse(va, 'ab').success).toBe(true)

    const aBase = type('string')
    const aa = withField(aBase, { label: 'K' })
    expect(getMeta(aa)?.label).toBe('K')
    expect(getMeta(aBase)).toBeUndefined()
    expect(aa('x')).toBe('x')
    expect(aa['~standard'].validate(1)).toHaveProperty('issues')
  })

  it('does not throw on a frozen schema', () => {
    const frozen = Object.freeze(v.string())
    const w = withField(frozen, { label: 'F' })
    expect(getMeta(w)?.label).toBe('F')
    expect(v.safeParse(w, 'x').success).toBe(true)
  })
})

describe('formatErrorsByPath — prototype-named paths', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('keeps the error for %s', (key) => {
    const out = formatErrorsByPath([{ message: 'bad', path: [key] }])
    expect(Object.hasOwn(out, key)).toBe(true)
    expect(out[key]).toBe('bad')
  })
  it('joinWith still works on prototype-named keys', () => {
    const out = formatErrorsByPath(
      [
        { message: 'a', path: ['constructor'] },
        { message: 'b', path: ['constructor'] },
      ],
      undefined,
      { joinWith: '; ' },
    )
    expect(out.constructor).toBe('a; b')
  })
})

describe('async refine inside a composite', () => {
  it('files the issue at the FIELD path, not the root', async () => {
    const schema = s.object({
      name: s.string().refine(async (n) => n !== 'taken', { message: 'Taken' }),
    })
    const r = await schema.parseAsync({ name: 'taken' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]!.path).toEqual(['name'])
    const arr = s.array(s.number().refine(async (n) => n > 0, { message: 'pos' }))
    const ra = await arr.parseAsync([1, -1])
    if (!ra.ok) expect(ra.issues[0]!.path).toEqual([1])
    else expect.unreachable()
  })

  it('invokes an async refine ONCE per parse (no duplicate DB round-trip)', async () => {
    let calls = 0
    const schema = s.string().refine(
      async () => {
        calls++
        return true
      },
      { message: 'x' },
    )
    await schema.parseAsync('a')
    expect(calls).toBe(1)
  })
})

describe('toFormValidator — async schemas', () => {
  it('returns a Promise of per-field errors for an async refine', async () => {
    const schema = s.object({
      name: s.string().refine(async (n) => n !== 'taken', { message: 'Taken' }),
    })
    const validate = toFormValidator(schema)
    const bad = validate({ name: 'taken' })
    expect(bad).toBeInstanceOf(Promise)
    expect(await bad).toEqual({ name: 'Taken' })
    expect(await validate({ name: 'free' })).toEqual({})
  })
  it('stays synchronous for a sync schema', () => {
    const validate = toFormValidator(s.object({ a: s.string().min(2) }))
    const r = validate({ a: 'x' })
    expect(r).not.toBeInstanceOf(Promise)
    expect(Object.keys(r as Record<string, string>)).toEqual(['a'])
  })
})

describe('configure({ jit: false }) — jitless mode', () => {
  afterEach(() => configure({ jit: true }))

  it('never compiles with new Function and still validates', () => {
    configure({ jit: false })
    const spy = vi.spyOn(globalThis, 'Function')
    const schema = s.object({ n: s.number().int().min(0) })
    expect(tryCompileJit(schema)).toBeNull()
    expect(schema.parse({ n: 2 }).ok).toBe(true)
    expect(schema.parse({ n: -1 }).ok).toBe(false)
    expect(schema.is({ n: 2 })).toBe(true)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('caches an eval refusal (CSP) after the first failure', () => {
    const Orig = globalThis.Function
    let calls = 0
    const Blocked = function () {
      calls++
      throw new EvalError('Refused to evaluate a string as JavaScript (CSP)')
    } as unknown as FunctionConstructor
    globalThis.Function = Blocked
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const a = s.object({ x: s.string() })
      expect(a.parse({ x: 'y' }).ok).toBe(true)
      const firstCalls = calls
      expect(firstCalls).toBeGreaterThan(0)
      const b = s.object({ y: s.number() })
      expect(b.parse({ y: 1 }).ok).toBe(true)
      expect(b.parse({ y: 'no' }).ok).toBe(false)
      expect(calls).toBe(firstCalls)
      // One actionable dev warning, not one per schema.
      expect(warn.mock.calls.filter((c) => String(c[0]).includes('code generation is blocked'))).toHaveLength(1)
    } finally {
      globalThis.Function = Orig
      warn.mockRestore()
    }
  })
})

describe('watchValid — async schemas', () => {
  it('reports validity once the async validation settles', async () => {
    const $v = signal('taken')
    const schema = s.string().refine(async (x) => x !== 'taken', { message: 'no' })
    const seen: boolean[] = []
    const stop = watchValid(schema, $v, (ok) => seen.push(ok))
    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toEqual([false])
    $v.set('free')
    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toEqual([false, true])
    stop()
  })
})

describe('isDisposableEmail — subdomains', () => {
  it('matches subdomains of a disposable domain', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true)
    expect(isDisposableEmail('a@eu.mailinator.com')).toBe(true)
    expect(isDisposableEmail('a@x.y.MAILINATOR.com')).toBe(true)
    expect(isDisposableEmail('a@notmailinator.com')).toBe(false)
    expect(isDisposableEmail('a@gmail.com')).toBe(false)
  })
})

describe('toJsonSchema — prototype-named properties', () => {
  it('emits a property literally named __proto__', async () => {
    const { toJsonSchema } = await import('../json-schema')
    const out = toJsonSchema(s.object({ ['__proto__']: s.string(), constructor: s.number() })) as {
      properties: Record<string, unknown>
    }
    expect(Object.hasOwn(out.properties, '__proto__')).toBe(true)
    expect(Object.keys(out.properties).sort()).toEqual(['__proto__', 'constructor'])
    expect(JSON.parse(JSON.stringify(out)).properties).toHaveProperty(['__proto__'])
  })
})
