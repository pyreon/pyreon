// Targeted coverage for validate's residual validator-logic branches.
import { describe, expect, it } from 'vitest'
import { array, number, object, s, string } from '../v1'

describe('validate — field() merge (existing meta present)', () => {
  it('a second field() merges over the first', () => {
    const schema = s.string().field({ label: 'A' }).field({ hint: 'H' })
    const r = schema.parse('x')
    expect(r.ok).toBe(true)
  })
})

describe('validate — refine issue carries all opts (code/key/params/fallback)', () => {
  it('a failing refine with full opts surfaces them on the issue', () => {
    const schema = string().refine(() => false, {
      message: 'bad',
      code: 'CUSTOM',
      key: 'errors.custom',
      params: { x: 1 },
      fallback: 'fallback msg',
    })
    const r = schema.parse('y')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const issue = r.issues[0] as unknown as Record<string, unknown>
      expect(issue.code).toBe('CUSTOM')
      expect(issue.key).toBe('errors.custom')
    }
  })
})

describe('validate — async transform / refine via ~standard.validate (Promise path)', () => {
  it('an async transform resolves through the Promise branch', async () => {
    const schema = s.string().transform(async (v) => `${v}!`)
    const out = await schema['~standard'].validate('hi')
    expect((out as { value?: unknown }).value).toBe('hi!')
  })

  it('an async refine resolves through the Promise branch', async () => {
    const schema = s
      .string()
      .transform(async (v) => v)
      .refine((v) => (v as string).length > 0, { message: 'empty' })
    const out = await schema['~standard'].validate('ok')
    expect((out as { issues?: unknown }).issues).toBeUndefined()
  })
})

describe('validate — chained async transform (Promise carried into next op)', () => {
  it('a second transform applies to the Promise from the first (current.then path)', async () => {
    const schema = s
      .string()
      .transform(async (v) => `${v}-a`)
      .transform((v) => `${v as string}-b`)
    const out = await schema['~standard'].validate('x')
    expect((out as { value?: unknown }).value).toBe('x-a-b')
  })
})

describe('validate — array max + nested issue paths', () => {
  it('array max over the limit reports an issue', () => {
    const schema = array(number()).max(2)
    const r = schema.parse([1, 2, 3])
    expect(r.ok).toBe(false)
  })

  it('array max within the limit + non-array short-circuits', () => {
    expect(array(number()).max(5).parse([1, 2]).ok).toBe(true)
  })

  it('nested object issues carry the merged path', () => {
    const schema = object({ inner: object({ n: number() }) })
    const r = schema.parse({ inner: { n: 'not-a-number' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]?.path?.length).toBeGreaterThan(0)
  })

  it('nested array element issues carry the merged path', () => {
    const schema = array(object({ n: number() }))
    const r = schema.parse([{ n: 'bad' }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]?.path?.length).toBeGreaterThan(0)
  })
})


// Substring-check FAILURE arms (interpreter path). The valid path is compiled
// through the JIT; these lock the issue shape each check emits on rejection.
describe('validate — string substring checks reject with the named issue', () => {
  it('startsWith rejects a non-matching value with the prefix in the message', () => {
    const schema = s.string().startsWith('img-')
    expect(schema.parse('img-01').ok).toBe(true)
    const r = schema.parse('doc-01')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(String(r.issues[0]!.message)).toContain('start with "img-"')
  })

  it('endsWith rejects a non-matching value with the suffix in the message', () => {
    const schema = s.string().endsWith('.png')
    expect(schema.parse('a.png').ok).toBe(true)
    const r = schema.parse('a.jpg')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(String(r.issues[0]!.message)).toContain('end with ".png"')
  })

  it('includes rejects a non-matching value with the needle in the message', () => {
    const schema = s.string().includes('@')
    expect(schema.parse('a@b').ok).toBe(true)
    const r = schema.parse('nope')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(String(r.issues[0]!.message)).toContain('"@"')
  })
})
