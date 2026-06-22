// Phase 4 object algebra: pick / omit / partial / extend / merge / keyof
// + unknown-key policy (strip default / strict / passthrough). Behavior +
// strict Infer.
import { describe, expect, it } from 'vitest'
import { s, type Infer } from '../v1'

const base = s.object({ id: s.number(), name: s.string().min(2), email: s.string().email() })

describe('pick / omit', () => {
  it('pick keeps only named keys', () => {
    const p = base.pick(['id', 'name'])
    expect(p.parse({ id: 1, name: 'Ab' }).ok).toBe(true)
    const r = p.parse({ id: 1, name: 'Ab', email: 'x' })
    expect(r.ok && !('email' in r.value)).toBe(true) // stripped
    const _t: { id: number; name: string } = {} as Infer<typeof p>
    expect(_t).toBeDefined()
  })
  it('omit drops named keys', () => {
    const o = base.omit(['email'])
    expect(o.parse({ id: 1, name: 'Ab' }).ok).toBe(true)
    const _t: { id: number; name: string } = {} as Infer<typeof o>
    expect(_t).toBeDefined()
  })
})

describe('partial', () => {
  const p = base.partial()
  it('makes every field optional', () => {
    expect(p.parse({}).ok).toBe(true)
    expect(p.parse({ name: 'Ab' }).ok).toBe(true)
    expect(p.parse({ id: 1, email: 'a@b.co' }).ok).toBe(true)
  })
  it('still validates provided fields', () => {
    expect(p.parse({ name: 'A' }).ok).toBe(false) // min(2) still applies
  })
  it('infers all-optional keys', () => {
    const _t: { id?: number; name?: string; email?: string } = {}
    const _u: Infer<typeof p> = _t
    expect(_u).toBeDefined()
  })
})

describe('extend / merge', () => {
  it('extend adds required fields', () => {
    const e = base.extend({ age: s.number() })
    expect(e.parse({ id: 1, name: 'Ab', email: 'a@b.co' }).ok).toBe(false) // age missing
    expect(e.parse({ id: 1, name: 'Ab', email: 'a@b.co', age: 5 }).ok).toBe(true)
    const _t: { id: number; name: string; email: string; age: number } = {} as Infer<typeof e>
    expect(_t).toBeDefined()
  })
  it('extend overrides an existing field', () => {
    const e = base.extend({ id: s.string() })
    expect(e.parse({ id: 'x', name: 'Ab', email: 'a@b.co' }).ok).toBe(true)
    expect(e.parse({ id: 1, name: 'Ab', email: 'a@b.co' }).ok).toBe(false)
  })
  it('merge combines two object schemas', () => {
    const m = base.pick(['id']).merge(s.object({ tag: s.string() }))
    expect(m.parse({ id: 1, tag: 'x' }).ok).toBe(true)
    const _t: { id: number; tag: string } = {} as Infer<typeof m>
    expect(_t).toBeDefined()
  })
})

describe('keyof', () => {
  const k = base.keyof()
  it('accepts real keys, rejects others', () => {
    expect(k.parse('id').ok).toBe(true)
    expect(k.parse('email').ok).toBe(true)
    expect(k.parse('nope').ok).toBe(false)
  })
  it('infers the key union', () => {
    const _t: 'id' | 'name' | 'email' = {} as Infer<typeof k>
    expect(_t).toBeDefined()
  })
})

describe('unknown-key policy', () => {
  const valid = { id: 1, name: 'Ab', email: 'a@b.co' }
  it('strips unknown keys by default', () => {
    const r = base.parse({ ...valid, extra: 9 })
    expect(r.ok && !('extra' in r.value)).toBe(true)
  })
  it('strict() rejects unknown keys', () => {
    const r = base.strict().parse({ ...valid, extra: 9 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect((r.issues[0] as { code?: string }).code).toBe('unrecognized_keys')
  })
  it('passthrough() keeps unknown keys', () => {
    const r = base.passthrough().parse({ ...valid, extra: 9 })
    expect(r.ok && (r.value as Record<string, unknown>).extra).toBe(9)
  })
  it('passthrough is prototype-pollution-safe', () => {
    const before = (Object.prototype as Record<string, unknown>).polluted
    base.passthrough().parse(JSON.parse(`{"id":1,"name":"Ab","email":"a@b.co","__proto__":{"polluted":1}}`))
    expect((Object.prototype as Record<string, unknown>).polluted).toBe(before)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
