// .pipe() / .superRefine() / .preprocess() / .nonoptional() — schema
// transform/refine completeness (Zod parity), all implemented as wrapper schemas.
import { describe, expect, it } from 'vitest'
import { preprocess, s } from '../v1'

describe('.pipe(target)', () => {
  it('feeds the transformed output into the target schema', () => {
    const schema = s.string().transform((v) => v.length).pipe(s.number().gte(2))
    expect(schema.parse('ab').ok).toBe(true)
    const ok = schema.parse('abc')
    expect(ok.ok && ok.value).toBe(3)
    expect(schema.parse('a').ok).toBe(false) // length 1 < 2
  })
  it('short-circuits if the source fails (target not run)', () => {
    const schema = s.string().pipe(s.string().min(2))
    expect(schema.parse(123).ok).toBe(false) // source type-check fails
  })
  it('async source chains into target (parseAsync)', async () => {
    const schema = s
      .string()
      .refine(async () => true, { message: 'x' })
      .transform((v) => v.length)
      .pipe(s.number().gt(0))
    const r = await schema.parseAsync('hello')
    expect(r.ok && r.value).toBe(5)
  })
})

describe('.superRefine(fn)', () => {
  it('adds zero issues on a valid value', () => {
    const schema = s.number().superRefine(() => {})
    expect(schema.parse(5).ok).toBe(true)
  })
  it('can add multiple issues', () => {
    const schema = s.string().superRefine((v, ctx) => {
      if (!/[A-Z]/.test(v)) ctx.addIssue({ message: 'needs uppercase' })
      if (!/[0-9]/.test(v)) ctx.addIssue({ message: 'needs digit' })
    })
    const r = schema.parse('abc')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues.map((i) => i.message)).toEqual(['needs uppercase', 'needs digit'])
  })
  it('appends path for cross-field issues', () => {
    const schema = s
      .object({ pw: s.string(), confirm: s.string() })
      .superRefine((v, ctx) => {
        if (v.pw !== v.confirm) ctx.addIssue({ message: 'Mismatch', path: ['confirm'] })
      })
    const r = schema.parse({ pw: 'a', confirm: 'b' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.path).toEqual(['confirm'])
    expect(!r.ok && r.issues[0]?.message).toBe('Mismatch')
  })
  it('does not run if the source already failed', () => {
    let ran = false
    const schema = s.string().superRefine(() => {
      ran = true
    })
    schema.parse(123) // type fails → superRefine skipped
    expect(ran).toBe(false)
  })
})

describe('s.preprocess(fn, schema)', () => {
  it('transforms the raw input before the schema validates', () => {
    const schema = preprocess((v) => String(v).trim(), s.string().min(1))
    const r = schema.parse('  hi  ')
    expect(r.ok && r.value).toBe('hi')
  })
  it('can change the type before the type-check (string → number)', () => {
    const schema = preprocess((v) => Number(v), s.number().int())
    const r = schema.parse('42')
    expect(r.ok && r.value).toBe(42)
    expect(preprocess((v) => Number(v), s.number()).parse('nope').ok).toBe(false) // NaN
  })
  it('is also on the s namespace', () => {
    const schema = s.preprocess((v) => Number(v), s.number())
    expect(schema.parse('7').ok).toBe(true)
  })
})

describe('.nonoptional(message?)', () => {
  it('rejects undefined where the optional would have accepted it', () => {
    const opt = s.string().optional()
    expect(opt.parse(undefined).ok).toBe(true)
    const req = s.string().optional().nonoptional()
    expect(req.parse(undefined).ok).toBe(false)
    expect(req.parse('x').ok).toBe(true)
  })
  it('uses a custom message', () => {
    const r = s.string().optional().nonoptional('required!').parse(undefined)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.message).toBe('required!')
  })
})
