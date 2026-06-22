// Phase 3 composition: union / discriminatedUnion / record / tuple —
// behavior, nested-path errors, prototype-pollution safety, strict Infer.
import { describe, expect, it } from 'vitest'
import { s, type Infer } from '../v1'

describe('union', () => {
  const u = s.union(s.string(), s.number())
  it('accepts any member type, rejects others', () => {
    expect(u.parse('x').ok).toBe(true)
    expect(u.parse(5).ok).toBe(true)
    expect(u.parse(true).ok).toBe(false)
  })
  it('returns the matched value', () => {
    const r = u.parse(42)
    expect(r.ok && r.value).toBe(42)
  })
  it('emits invalid_union when nothing matches', () => {
    const r = u.parse(true)
    expect(r.ok).toBe(false)
    if (!r.ok) expect((r.issues[0] as { code?: string }).code).toBe('invalid_union')
  })
  it('infers the member union type', () => {
    const _u: string | number = {} as Infer<typeof u>
    expect(_u).toBeDefined()
  })
})

describe('record', () => {
  const r = s.record(s.number())
  it('validates every value', () => {
    expect(r.parse({ a: 1, b: 2 }).ok).toBe(true)
    expect(r.parse({ a: 1, b: 'x' }).ok).toBe(false)
    expect(r.parse({}).ok).toBe(true)
  })
  it('rejects non-objects / arrays', () => {
    expect(r.parse([1, 2]).ok).toBe(false)
    expect(r.parse('x').ok).toBe(false)
    expect(r.parse(null).ok).toBe(false)
  })
  it('reports the offending key in the path', () => {
    const res = r.parse({ good: 1, bad: 'x' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.issues[0]?.path).toEqual(['bad'])
  })
  it('is prototype-pollution-safe', () => {
    const before = (Object.prototype as Record<string, unknown>).polluted
    const res = s.record(s.number()).parse(JSON.parse('{"__proto__":{"polluted":1},"a":1}'))
    // value-level: a __proto__ payload of an object fails the number value-schema,
    // but crucially Object.prototype is never mutated.
    expect((Object.prototype as Record<string, unknown>).polluted).toBe(before)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    void res
  })
  it('infers Record<string, V>', () => {
    const _r: Record<string, number> = {} as Infer<typeof r>
    expect(_r).toBeDefined()
  })
})

describe('tuple', () => {
  const t = s.tuple([s.string(), s.number(), s.boolean()])
  it('validates length + each position', () => {
    expect(t.parse(['x', 1, true]).ok).toBe(true)
    expect(t.parse(['x', 1]).ok).toBe(false) // too short
    expect(t.parse(['x', 1, true, 9]).ok).toBe(false) // too long
    expect(t.parse(['x', 'y', true]).ok).toBe(false) // wrong type at [1]
  })
  it('reports the failing index in the path', () => {
    const r = t.parse(['x', 'y', true])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]?.path).toEqual([1])
  })
  it('infers the positional tuple type', () => {
    const _t: [string, number, boolean] = {} as Infer<typeof t>
    expect(_t).toBeDefined()
  })
})

describe('discriminatedUnion', () => {
  const du = s.discriminatedUnion('kind', [
    s.object({ kind: s.literal('circle'), radius: s.number() }),
    s.object({ kind: s.literal('rect'), w: s.number(), h: s.number() }),
  ])
  it('dispatches to the matching member', () => {
    expect(du.parse({ kind: 'circle', radius: 3 }).ok).toBe(true)
    expect(du.parse({ kind: 'rect', w: 2, h: 4 }).ok).toBe(true)
  })
  it('rejects an unknown discriminator with a precise error', () => {
    const r = du.parse({ kind: 'triangle' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect((r.issues[0] as { code?: string }).code).toBe('invalid_union_discriminator')
      expect(r.issues[0]?.path).toEqual(['kind'])
    }
  })
  it('rejects a matching discriminator with a bad member shape', () => {
    const r = du.parse({ kind: 'circle', radius: 'big' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]?.path).toEqual(['radius'])
  })
  it('infers the discriminated union type', () => {
    type DU = Infer<typeof du>
    const a: DU = { kind: 'circle', radius: 1 }
    const b: DU = { kind: 'rect', w: 1, h: 2 }
    expect([a, b]).toBeDefined()
  })
})
