// Recursive JIT codegen — the specialized-function fast path now inlines
// nested objects, composite array elements, array ROOTS, and inline-
// primitive roots (not just a flat object-of-primitives). These specs lock
// the new coverage AND two latent correctness bugs the rewrite fixed:
//   1. an array carrying its OWN `.refine()` silently dropped it (the old
//      flat-JIT array branch only ran check ops);
//   2. a number field/root accepted `NaN` (`typeof NaN === 'number'`).
// The JIT is selected automatically by `_getCompiled`; these go through the
// public `.parse()` so they exercise whatever path the schema compiles to.
import { describe, expect, it } from 'vitest'
import { s } from '../v1'

describe('recursive JIT — nested objects', () => {
  const Schema = s.object({
    id: s.number().int(),
    user: s.object({
      name: s.string().min(2),
      address: s.object({ city: s.string().min(1), zip: s.string().length(5) }),
    }),
  })

  it('validates a deeply-nested valid value', () => {
    const r = Schema.parse({ id: 1, user: { name: 'Ada', address: { city: 'Paris', zip: '75001' } } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.user.address.city).toBe('Paris')
  })

  it('reports the FULL nested path on a deep failure', () => {
    const r = Schema.parse({ id: 1, user: { name: 'Ada', address: { city: 'Paris', zip: '7' } } })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const zipIssue = r.issues.find((i) => (i.path ?? []).join('.') === 'user.address.zip')
      expect(zipIssue).toBeDefined()
    }
  })

  it('rejects a non-object at a nested position with the right path', () => {
    const r = Schema.parse({ id: 1, user: { name: 'Ada', address: null } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((i) => (i.path ?? []).join('.') === 'user.address')).toBe(true)
  })
})

describe('recursive JIT — array of objects', () => {
  const Schema = s.object({
    page: s.number().int().min(0),
    items: s.array(s.object({ id: s.number().int(), title: s.string().min(1) })),
  })

  it('validates an array-of-objects field', () => {
    const r = Schema.parse({ page: 1, items: [{ id: 1, title: 'a' }, { id: 2, title: 'b' }] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.items).toHaveLength(2)
  })

  it('reports the element index + nested field on a bad element', () => {
    const r = Schema.parse({ page: 1, items: [{ id: 1, title: 'a' }, { id: 2, title: '' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((i) => (i.path ?? []).join('.') === 'items.1.title')).toBe(true)
  })
})

describe('recursive JIT — array ROOT (previously interpreter)', () => {
  const Schema = s.array(s.object({ id: s.number().int(), name: s.string().min(2) }))

  it('validates an array-of-objects root', () => {
    const r = Schema.parse([{ id: 1, name: 'Ada' }, { id: 2, name: 'Bob' }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toHaveLength(2)
  })

  it('reports index.field path on a bad root element', () => {
    const r = Schema.parse([{ id: 1, name: 'Ada' }, { id: 2, name: 'X' }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((i) => (i.path ?? []).join('.') === '1.name')).toBe(true)
  })

  it('rejects a non-array root', () => {
    const r = Schema.parse({ not: 'an array' })
    expect(r.ok).toBe(false)
  })

  it('honors the array root\'s own length checks', () => {
    const Bounded = s.array(s.number().int()).min(2)
    expect(Bounded.parse([1]).ok).toBe(false)
    expect(Bounded.parse([1, 2]).ok).toBe(true)
  })
})

describe('recursive JIT — inline-primitive root (Stage A)', () => {
  it('validates a number root with checks (no closure calls on the valid path)', () => {
    const N = s.number().int().min(0).max(150)
    expect(N.parse(42).ok).toBe(true)
    expect(N.parse(999).ok).toBe(false)
    expect(N.parse(1.5).ok).toBe(false)
  })

  it('REJECTS NaN at a number root (latent bug: typeof NaN === "number")', () => {
    // Bisect-load-bearing: the old flat JIT used `typeof v !== "number"`
    // which accepted NaN. The interpreter rejected it; now the JIT does too.
    expect(s.number().parse(NaN).ok).toBe(false)
  })

  it('REJECTS NaN at a nested number FIELD (the same latent bug, in an object)', () => {
    expect(s.object({ n: s.number() }).parse({ n: NaN }).ok).toBe(false)
  })

  it('validates a string root with checks', () => {
    const Str = s.string().min(2).max(5)
    expect(Str.parse('abc').ok).toBe(true)
    expect(Str.parse('a').ok).toBe(false)
    expect(Str.parse(42).ok).toBe(false)
  })
})

describe('recursive JIT — correctness guards', () => {
  it('runs an array field\'s OWN .refine() (latent bug: old JIT dropped it)', () => {
    // Bisect-load-bearing: the old array branch only emitted check ops, so a
    // `.refine()` on the array itself was silently skipped → invalid input
    // passed. `isInlineArray` now requires all-check ops, so a refined array
    // falls back to its interpreter (which runs the refine).
    const Schema = s.object({
      tags: s.array(s.string()).refine((arr) => arr.length === new Set(arr).size, {
        message: 'tags must be unique',
      }),
    })
    expect(Schema.parse({ tags: ['a', 'b'] }).ok).toBe(true)
    const dup = Schema.parse({ tags: ['a', 'a'] })
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.issues.some((i) => i.message.includes('unique'))).toBe(true)
  })

  it('still COERCES a coerce schema used as a nested field (the _coerce marker)', () => {
    // A coerce schema overrides _compileType; the JIT must NOT inline it (it
    // would skip coercion). Marker → falls back to the interpreter.
    const Schema = s.object({ age: s.coerce.number().int() })
    const r = Schema.parse({ age: '42' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.age).toBe(42)
  })

  it('safely assigns a __proto__-keyed nested object field (no prototype pollution)', () => {
    const Schema = s.object({ ['__proto__']: s.object({ polluted: s.literal(true) }) })
    const r = Schema.parse({ ['__proto__']: { polluted: true } })
    expect(r.ok).toBe(true)
    // The base Object prototype must be untouched.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('flags an async refine used inside a sync array parse with the ELEMENT wording', () => {
    const asyncEl = s.string().refine(async (v) => v.length > 0, { message: 'x' })
    const r = s.array(asyncEl).parse(['a'])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((i) => i.message.includes('async element schema'))).toBe(true)
  })
})
