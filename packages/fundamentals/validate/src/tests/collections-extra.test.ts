// map / set / intersection / lazy (recursive) — behavior + strict Infer.
import { describe, expect, it } from 'vitest'
import { s, type Infer, type Schema } from '../v1'

describe('map', () => {
  const m = s.map(s.string(), s.number())
  it('validates a Map of key+value schemas', () => {
    expect(m.parse(new Map([['a', 1], ['b', 2]])).ok).toBe(true)
    expect(m.parse(new Map([['a', 'x' as unknown as number]])).ok).toBe(false)
    expect(m.parse({ a: 1 }).ok).toBe(false) // not a Map
  })
  it('returns a fresh Map of validated entries', () => {
    const r = m.parse(new Map([['a', 1]]))
    expect(r.ok && r.value instanceof Map && r.value.get('a')).toBe(1)
  })
  it('infers Map<K, V>', () => {
    const _t: Map<string, number> = {} as Infer<typeof m>
    expect(_t).toBeDefined()
  })
})

describe('set', () => {
  const st = s.set(s.number())
  it('validates a Set of values', () => {
    expect(st.parse(new Set([1, 2, 3])).ok).toBe(true)
    expect(st.parse(new Set([1, 'x'])).ok).toBe(false)
    expect(st.parse([1, 2]).ok).toBe(false) // not a Set
  })
  it('infers Set<V>', () => {
    const _t: Set<number> = {} as Infer<typeof st>
    expect(_t).toBeDefined()
  })
})

describe('intersection', () => {
  const ix = s.intersection(s.object({ a: s.string() }), s.object({ b: s.number() }))
  it('requires both schemas to pass', () => {
    expect(ix.parse({ a: 'x', b: 1 }).ok).toBe(true)
    expect(ix.parse({ a: 'x' }).ok).toBe(false) // missing b
    expect(ix.parse({ b: 1 }).ok).toBe(false) // missing a
  })
  it('merges object outputs', () => {
    const r = ix.parse({ a: 'x', b: 1 })
    expect(r.ok && r.value).toEqual({ a: 'x', b: 1 })
  })
  it('infers A & B', () => {
    const _t: { a: string } & { b: number } = {} as Infer<typeof ix>
    expect(_t).toBeDefined()
  })
})

describe('lazy (recursive)', () => {
  interface Tree {
    value: number
    children: Tree[]
  }
  const tree: Schema<Tree> = s.lazy(() =>
    s.object({ value: s.number(), children: s.array(tree) }),
  )
  it('validates a recursive structure', () => {
    expect(tree.parse({ value: 1, children: [] }).ok).toBe(true)
    expect(tree.parse({ value: 1, children: [{ value: 2, children: [{ value: 3, children: [] }] }] }).ok).toBe(true)
  })
  it('rejects a malformed nested node', () => {
    const r = tree.parse({ value: 1, children: [{ value: 'no', children: [] }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]?.path).toEqual(['children', 0, 'value'])
  })
})
