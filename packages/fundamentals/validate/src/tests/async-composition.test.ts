/**
 * Async members inside COMPOSITION schemas — the seam the market-map audit
 * found broken: union / discriminatedUnion / intersection pushed a hard
 * "async member in sync parse" issue from `_compileType` even under
 * `parseAsync` (the hook had no async branch), and Map / Set / Record /
 * Tuple silently DROPPED an async entry with no issue at all.
 *
 * The contract locked here (parity with object fields / array elements):
 *   - `parseAsync` awaits async members everywhere and produces the right
 *     verdict + issues.
 *   - a sync `parse()` of an async schema reports the ONE canonical
 *     async-in-sync issue ("schema is async — use parseAsync") at the root,
 *     never a member-level hard failure.
 *
 * Bisect-verified: reverting any composition's async branch fails its
 * describe block with either the old hard issue or a dropped-entry diff.
 */
import { describe, expect, it } from 'vitest'
import { s } from '../v1'

/** An async-refined string: valid iff it starts with `ok`. */
const asyncString = () =>
  s.string().refine(async (v) => v.startsWith('ok'), { message: 'must start with ok' })

describe('union — async members', () => {
  it('parseAsync resolves through an async first member', async () => {
    const u = s.union([asyncString(), s.number()])
    const r = await u.parseAsync('ok-value')
    expect(r).toEqual({ ok: true, value: 'ok-value' })
  })

  it('parseAsync falls through a failing async member to a later sync member', async () => {
    const u = s.union([asyncString(), s.number()])
    const r = await u.parseAsync(42)
    // 42 fails the string member's TYPE check synchronously; the number
    // member matches. (Also cover the async-fail → sync-match order.)
    expect(r).toEqual({ ok: true, value: 42 })

    const u2 = s.union([asyncString(), s.string().min(1)])
    const r2 = await u2.parseAsync('nope')
    // async refine rejects 'nope'; the plain string member accepts it.
    expect(r2).toEqual({ ok: true, value: 'nope' })
  })

  it('parseAsync emits invalid_union when every member (incl. async) fails', async () => {
    const u = s.union([asyncString(), s.number()])
    const r = await u.parseAsync(true)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues).toHaveLength(1)
      expect((r.issues[0] as { code?: string }).code).toBe('invalid_union')
    }
  })

  it('sync parse of an async-membered union reports the canonical async-in-sync issue', () => {
    const u = s.union([asyncString(), s.number()])
    const r = u.parse('ok-value')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues[0]!.message).toContain('use parseAsync')
      // NOT the old member-level hard failure:
      expect(r.issues[0]!.message).not.toContain('async member in sync union')
    }
  })

  it('a failed member leaves NO residue (issues truncated) — shared-ctx scan', () => {
    const u = s.union([s.object({ a: s.string().min(5) }), s.object({ b: s.number() })])
    const r = u.parse({ b: 1 })
    expect(r).toEqual({ ok: true, value: { b: 1 } })
    const bad = u.parse({ a: 'x', b: 'no' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.issues).toHaveLength(1)
      expect((bad.issues[0] as { code?: string }).code).toBe('invalid_union')
    }
  })

  it("the WINNING member's pending serverCheck entries now propagate", () => {
    const u = s.union([s.string().serverCheck('email-unique'), s.number()])
    const r = u.parse('ada@example.com')
    expect(r.ok).toBe(true)
    if (r.ok) {
      // Pre-fix, the per-member `~standard.validate` internal ctx swallowed
      // the pending entry — the client's "valid so far, pending server"
      // contract silently vanished inside unions.
      expect(r.pending).toEqual([{ path: [], key: 'email-unique' }])
    }
  })

  it("a FAILED member's pending entries are truncated with its issues", () => {
    const u = s.union([s.string().min(50).serverCheck('email-unique'), s.string()])
    const r = u.parse('short')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.pending).toBeUndefined()
  })

  it('nested union under an object field keeps correct paths on failure', async () => {
    const schema = s.object({ v: s.union([asyncString(), s.number()]) })
    const r = await schema.parseAsync({ v: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]!.path).toEqual(['v'])
  })
})

describe('discriminatedUnion — async members + enum discriminants', () => {
  it('parseAsync resolves an async member', async () => {
    const du = s.discriminatedUnion('t', [
      s.object({ t: s.literal('a'), v: asyncString() }),
      s.object({ t: s.literal('b'), n: s.number() }),
    ])
    const good = await du.parseAsync({ t: 'a', v: 'ok-yes' })
    expect(good).toEqual({ ok: true, value: { t: 'a', v: 'ok-yes' } })
    const bad = await du.parseAsync({ t: 'a', v: 'nope' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.issues[0]!.message).toBe('must start with ok')
  })

  it('sync parse of an async member reports the canonical async-in-sync issue', () => {
    const du = s.discriminatedUnion('t', [
      s.object({ t: s.literal('a'), v: asyncString() }),
      s.object({ t: s.literal('b'), n: s.number() }),
    ])
    const r = du.parse({ t: 'a', v: 'ok-yes' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]!.message).toContain('use parseAsync')
  })

  it('an enum-valued discriminant registers every tag value', () => {
    const du = s.discriminatedUnion('kind', [
      s.object({ kind: s.enum(['circle', 'ellipse']), r: s.number() }),
      s.object({ kind: s.literal('square'), side: s.number() }),
    ])
    expect(du.parse({ kind: 'circle', r: 1 }).ok).toBe(true)
    expect(du.parse({ kind: 'ellipse', r: 2 }).ok).toBe(true)
    expect(du.parse({ kind: 'square', side: 3 }).ok).toBe(true)
    const miss = du.parse({ kind: 'triangle' })
    expect(miss.ok).toBe(false)
    if (!miss.ok) {
      expect((miss.issues[0] as { code?: string }).code).toBe('invalid_union_discriminator')
    }
  })

  it('a nativeEnum-valued discriminant registers every tag value', () => {
    enum Kind {
      A = 'a',
      B = 'b',
    }
    const du = s.discriminatedUnion('kind', [
      s.object({ kind: s.nativeEnum(Kind), v: s.string() }),
      s.object({ kind: s.literal('c'), n: s.number() }),
    ])
    expect(du.parse({ kind: 'a', v: 'x' }).ok).toBe(true)
    expect(du.parse({ kind: 'b', v: 'x' }).ok).toBe(true)
    expect(du.parse({ kind: 'c', n: 1 }).ok).toBe(true)
  })

  it('dev guard: a non-literal discriminant field throws at construction', () => {
    expect(() =>
      s.discriminatedUnion('t', [
        s.object({ t: s.string(), v: s.string() }),
        s.object({ t: s.literal('b'), n: s.number() }),
      ]),
    ).toThrow(/not a literal\/enum\/nativeEnum/)
  })

  it('dev guard: duplicate discriminant values throw at construction', () => {
    expect(() =>
      s.discriminatedUnion('t', [
        s.object({ t: s.literal('a'), v: s.string() }),
        s.object({ t: s.literal('a'), n: s.number() }),
      ]),
    ).toThrow(/duplicate discriminant value/)
  })
})

describe('intersection — async sides', () => {
  it('parseAsync merges when an async side passes', async () => {
    const i = s.intersection(
      s.object({ a: asyncString() }).passthrough(),
      s.object({ b: s.number() }).passthrough(),
    )
    const r = await i.parseAsync({ a: 'ok-x', b: 2 })
    expect(r).toEqual({ ok: true, value: { a: 'ok-x', b: 2 } })
  })

  it('parseAsync fails when the async side fails', async () => {
    const i = s.intersection(s.object({ a: asyncString() }), s.object({ b: s.number() }))
    const r = await i.parseAsync({ a: 'nope', b: 2 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.some((x) => x.message === 'must start with ok')).toBe(true)
  })

  it('sync parse reports the canonical async-in-sync issue', () => {
    const i = s.intersection(s.object({ a: asyncString() }), s.object({ b: s.number() }))
    const r = i.parse({ a: 'ok-x', b: 2 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]!.message).toContain('use parseAsync')
  })
})

describe('Map / Set / Record / Tuple — async entries (previously silently dropped)', () => {
  it('map: parseAsync validates async values and keeps every entry', async () => {
    const m = s.map(s.string(), asyncString())
    const good = await m.parseAsync(new Map([['k1', 'ok-1'], ['k2', 'ok-2']]))
    expect(good.ok).toBe(true)
    if (good.ok) {
      expect(good.value).toEqual(new Map([['k1', 'ok-1'], ['k2', 'ok-2']]))
    }
    const bad = await m.parseAsync(new Map([['k1', 'nope']]))
    expect(bad.ok).toBe(false)
  })

  it('set: parseAsync validates async members and keeps every member', async () => {
    const st = s.set(asyncString())
    const good = await st.parseAsync(new Set(['ok-a', 'ok-b']))
    expect(good.ok).toBe(true)
    if (good.ok) expect(good.value).toEqual(new Set(['ok-a', 'ok-b']))
    const bad = await st.parseAsync(new Set(['ok-a', 'no']))
    expect(bad.ok).toBe(false)
  })

  it('record: parseAsync validates async values and keeps every entry', async () => {
    const rec = s.record(asyncString())
    const good = await rec.parseAsync({ a: 'ok-1', b: 'ok-2' })
    expect(good.ok).toBe(true)
    if (good.ok) expect(good.value).toEqual({ a: 'ok-1', b: 'ok-2' })
    const bad = await rec.parseAsync({ a: 'ok-1', b: 'no' })
    expect(bad.ok).toBe(false)
  })

  it('record: prototype-pollution safety holds on the async path', async () => {
    const rec = s.record(asyncString())
    const r = await rec.parseAsync(JSON.parse('{"__proto__": "ok-x", "a": "ok-y"}'))
    expect(r.ok).toBe(true)
    if (r.ok) {
      const out = r.value as Record<string, unknown>
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
      expect(Object.getOwnPropertyDescriptor(out, '__proto__')?.value).toBe('ok-x')
    }
  })

  it('tuple: parseAsync fills async elements at the right POSITIONS', async () => {
    const t = s.tuple([asyncString(), s.number(), asyncString()])
    const r = await t.parseAsync(['ok-first', 42, 'ok-third'])
    expect(r).toEqual({ ok: true, value: ['ok-first', 42, 'ok-third'] })
  })

  it('tuple: rest elements may be async too', async () => {
    const t = s.tuple([s.number()]).rest(asyncString())
    const r = await t.parseAsync([1, 'ok-a', 'ok-b'])
    expect(r).toEqual({ ok: true, value: [1, 'ok-a', 'ok-b'] })
    const bad = await t.parseAsync([1, 'ok-a', 'no'])
    expect(bad.ok).toBe(false)
  })

  it('sync parse of async entries reports async-in-sync at the root (never a silent drop)', () => {
    const cases: Array<{ schema: { parse(i: unknown): { ok: boolean; issues?: readonly { message: string }[] } }; input: unknown }> = [
      { schema: s.map(s.string(), asyncString()), input: new Map([['k', 'ok-1']]) },
      { schema: s.set(asyncString()), input: new Set(['ok-a']) },
      { schema: s.record(asyncString()), input: { a: 'ok-1' } },
      { schema: s.tuple([asyncString()]), input: ['ok-1'] },
    ]
    for (const { schema, input } of cases) {
      const r = schema.parse(input)
      expect(r.ok).toBe(false)
      expect(r.issues![0]!.message).toContain('use parseAsync')
    }
  })
})

describe('~standard memoization', () => {
  it('repeated reads return the SAME object (per-access allocation removed)', () => {
    const schema = s.string().min(2)
    const a = schema['~standard']
    const b = schema['~standard']
    expect(a).toBe(b)
    // still live after chained mutation (the closure re-resolves _getCompiled)
    schema.max(4)
    expect(schema['~standard']).toBe(a)
    expect(schema['~standard'].validate('toolong')).toHaveProperty('issues')
  })
})
