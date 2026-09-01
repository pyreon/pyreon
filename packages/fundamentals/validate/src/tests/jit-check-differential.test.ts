/**
 * Verdict-JIT differential — `schema.is(x)` MUST equal `schema.parse(x).ok`
 * for every schema and every input.
 *
 * `.is()` is now served by a SECOND emission (`tryCompileJitCheck`) that
 * builds no output value, allocates no issues and never touches a ctx — so
 * it is a genuinely different code path from `parse()`, and the only thing
 * keeping the two in agreement is this suite. Every failure site in the
 * verdict emitter is a bare `return false`; a single mis-emitted condition
 * would make `.is()` silently disagree with `.parse()`, which is the exact
 * class of bug a boolean API hides best.
 *
 * COVERAGE IS ASSERTED, not assumed. The verdict emitter returns `null` for
 * shapes it refuses (a `_runInto` fallback, a closure-only check), and `.is()`
 * then falls back to the parse path — where this suite compares a thing to
 * itself and passes vacuously. So every describe block counts how many of its
 * schemas actually compiled a verdict validator and fails if that count is
 * zero, and the fuzz asserts a floor. Without that, deleting the whole
 * feature would leave this file green.
 */
import { describe, expect, it } from 'vitest'
import { tryCompileJitCheck } from '../core/jit'
import type { Schema } from '../core/schema'
import { s } from '../v1'

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function safe(v: unknown): string {
  try {
    return JSON.stringify(v)?.slice(0, 120) ?? String(v)
  } catch {
    return Object.prototype.toString.call(v)
  }
}

/** Is this schema actually served by the verdict emitter? */
const hasVerdict = (sc: Schema<unknown>): boolean => tryCompileJitCheck(sc) !== null

/**
 * The whole contract. Returns whether the verdict path was exercised, so the
 * caller can assert real coverage rather than trusting it.
 */
function agree(sc: Schema<unknown>, input: unknown, label: string): boolean {
  const covered = hasVerdict(sc)
  const parsed = sc.parse(input).ok
  expect(sc.is(input), `${label} :: is() != parse().ok :: input=${safe(input)}`).toBe(parsed)
  return covered
}

const BADS: unknown[] = [
  undefined, null, 42, 'str', true, NaN, {}, [], { a: 1 }, [1, 2],
  Symbol.for('x'), 0, '', -1, 1.5,
]

function* primInputs(): Generator<unknown> {
  yield* ['hello', '', 'a', 'abcdef', 'ada@example.com', 'not-an-email', '12345']
  yield* ['https://example.com/x', 'ftp://no', '550e8400-e29b-41d4-a716-446655440000', 'not-a-uuid']
  yield* ['2026-06-22', '2026-13-99', '2026-06-22T10:00:00Z', 'abmidyz', 'ab', 'yz', 'mid', 'on', 'off']
  yield* [0, 1, -1, 42, 999, 1.5, 150, 151, NaN, Infinity, -Infinity, -0, 3, 9, 10, 2 ** 53]
  yield* [true, false, 42n, 0n, -3n, new Date('2026-06-22'), new Date('invalid')]
  yield* BADS
}

describe('verdict JIT — primitive roots', () => {
  const schemas: Array<[string, Schema<unknown>]> = [
    ['string', s.string()],
    ['string.min2.max5', s.string().min(2).max(5)],
    ['string.length3', s.string().length(3)],
    ['string.email', s.string().email()],
    ['string.regex', s.string().regex(/^[a-z]+$/)],
    ['string.url', s.string().url()],
    ['string.uuid', s.string().uuid()],
    ['string.nonEmpty', s.string().nonEmpty()],
    ['string.startsWith', s.string().startsWith('ab')],
    ['string.endsWith', s.string().endsWith('yz')],
    ['string.includes', s.string().includes('mid')],
    ['number', s.number()],
    ['number.int', s.number().int()],
    ['number.int.min0.max150', s.number().int().min(0).max(150)],
    ['number.between', s.number().between(0, 150)],
    ['number.positive', s.number().positive()],
    ['number.gt.lt', s.number().gt(0).lt(100)],
    ['number.multipleOf3', s.number().multipleOf(3)],
    ['boolean', s.boolean()],
    ['literal42', s.literal(42)],
    ['literalStr', s.literal('on')],
    ['bigint', s.bigint()],
    ['date', s.date()],
    ['null', s.null()],
    ['undefined', s.undefined()],
  ]
  let covered = 0
  for (const [name, sc] of schemas) {
    it(name, () => {
      for (const input of primInputs()) if (agree(sc, input, name)) covered = 1
    })
  }
  it('the verdict emitter actually served these schemas', () => {
    // EXACT, not a floor: a regression that refuses a subset would pass a loose
    // floor. Ratchet it deliberately if a shape legitimately becomes unservable.
    expect(schemas.filter(([, sc]) => hasVerdict(sc)).length).toBe(25)
    expect(covered).toBe(1)
  })
})

describe('verdict JIT — objects, arrays, discriminated unions', () => {
  const flat = s.object({ name: s.string().min(2), age: s.number().int().min(0).max(150), active: s.boolean() })
  const nested = s.object({
    id: s.number().int(),
    user: s.object({ name: s.string().min(2), addr: s.object({ city: s.string().min(1), zip: s.string().length(5) }) }),
  })
  const withArr = s.object({
    page: s.number().int().min(0),
    tags: s.array(s.string().min(1)),
    items: s.array(s.object({ id: s.number().int(), title: s.string().min(1) })),
  })
  const withEmail = s.object({ email: s.string().email(), nick: s.string().min(2) })
  const arrPrim = s.array(s.number().int())
  const arrObj = s.array(s.object({ id: s.number().int(), name: s.string().min(2) }))
  const arrBounded = s.array(s.string().min(1)).min(2).max(4)
  const du = s.discriminatedUnion('kind', [
    s.object({ kind: s.literal('circle'), radius: s.number() }),
    s.object({ kind: s.literal('rect'), w: s.number(), h: s.number() }),
    s.object({ kind: s.literal('label'), text: s.string(), size: s.number() }),
  ])
  const nestedDu = s.object({ shape: du, id: s.number().int() })

  function* inputs(): Generator<unknown> {
    yield { name: 'Ada', age: 36, active: true }
    yield { name: 'A', age: 999, active: 'no' }
    yield { name: 'Ada', age: 36 }
    yield { id: 1, user: { name: 'Ada', addr: { city: 'Paris', zip: '75001' } } }
    yield { id: 1.5, user: { name: 'A', addr: { city: '', zip: '7' } } }
    yield { id: 1, user: { name: 'Ada', addr: null } }
    yield { page: 0, tags: ['a', 'b'], items: [{ id: 1, title: 'x' }] }
    yield { page: 0, tags: ['a', ''], items: [{ id: 1, title: '' }, { id: 'no', title: 'y' }] }
    yield { page: -1, tags: 'notarray', items: 5 }
    yield { email: 'ada@example.com', nick: 'ad' }
    yield { email: 'nope', nick: 'a' }
    yield [1, 2, 3]
    yield [1, 2.5, 'x']
    yield [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bob' }]
    yield [{ id: 1, name: 'A' }, { id: 'x', name: 'Bob' }]
    yield ['a', 'b', 'c']
    yield ['a']
    yield ['a', '', 'c']
    yield { kind: 'circle', radius: 1.5 }
    yield { kind: 'rect', w: 3, h: 4 }
    yield { kind: 'label', text: 'hi', size: 12 }
    yield { kind: 'circle', radius: 'x' }
    yield { kind: 'nope', w: 3, h: 4 }
    yield { kind: undefined }
    yield { shape: { kind: 'rect', w: 1, h: 2 }, id: 3 }
    yield { shape: { kind: 'rect', w: 'x', h: 2 }, id: 3 }
    // prototype-pollution shaped keys must not change the verdict
    yield { __proto__: { polluted: true }, name: 'Ada', age: 1, active: true }
    yield* BADS
  }

  const cases: Array<[string, Schema<unknown>]> = [
    ['flat', flat], ['nested', nested], ['withArr', withArr], ['withEmail', withEmail],
    ['arrPrim', arrPrim], ['arrObj', arrObj], ['arrBounded', arrBounded],
    ['du', du], ['nestedDu', nestedDu],
  ]
  for (const [name, sc] of cases) {
    it(name, () => {
      for (const input of inputs()) agree(sc, input, name)
    })
  }
  it('the verdict emitter actually served these schemas', () => {
    expect(cases.filter(([, sc]) => hasVerdict(sc)).length).toBe(9)
  })
})

describe('verdict JIT — shapes the emitter must REFUSE (and still be correct)', () => {
  // Each of these has a `_runInto` fallback or a closure-only check, so the
  // verdict emitter returns null and `.is()` keeps the parse path. The
  // contract still has to hold — and the refusal itself is asserted, because
  // a verdict emission for these would be a correctness bug, not a win.
  const refused: Array<[string, Schema<unknown>]> = [
    ['optional field', s.object({ a: s.string().optional() })],
    ['default field', s.object({ a: s.string().default('x') })],
    ['nullable field', s.object({ a: s.string().nullable() })],
    ['refine', s.object({ a: s.string() }).refine((v) => (v as { a: string }).a !== 'no', { message: 'nope' })],
    ['transform', s.object({ a: s.string().transform((x) => x.length) })],
    ['record root', s.record(s.string(), s.number())],
    ['plain union', s.union([s.string(), s.number()])],
    ['tuple', s.tuple([s.string(), s.number()])],
  ]
  for (const [name, sc] of refused) {
    it(`${name} — refused by the verdict emitter, is() still agrees`, () => {
      expect(tryCompileJitCheck(sc), `${name} must be refused`).toBeNull()
      for (const input of [
        {}, { a: 'x' }, { a: 1 }, { a: 'no' }, { a: null }, { a: undefined },
        'str', 42, null, undefined, [], ['x', 1], ['x'], { k: 1 },
      ]) {
        agree(sc, input, name)
      }
    })
  }
})

describe('verdict JIT — randomized fuzz (seeded)', () => {
  it('2000 random schema × input pairs: is() ≡ parse().ok', () => {
    const r = rng(0x51ed270b)
    const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!
    const leaf = (): Schema<unknown> =>
      pick([
        s.string(), s.string().min(2), s.string().max(8), s.string().length(4),
        s.string().regex(/^x/), s.string().nonEmpty(), s.string().email(),
        s.number(), s.number().int(), s.number().min(0), s.number().max(100),
        s.number().between(0, 50), s.number().multipleOf(3), s.number().positive(),
        s.boolean(), s.literal('on'), s.literal(42), s.bigint(), s.date(),
      ] as Array<Schema<unknown>>)
    const build = (depth: number): Schema<unknown> => {
      const k = pick(depth >= 2 ? ['leaf'] : ['leaf', 'leaf', 'obj', 'arr'])
      if (k === 'leaf') return leaf()
      if (k === 'arr') return s.array(build(depth + 1)) as unknown as Schema<unknown>
      const n = 1 + Math.floor(r() * 3)
      const shape: Record<string, Schema<unknown>> = {}
      for (let i = 0; i < n; i++) shape[`f${i}`] = build(depth + 1)
      return s.object(shape) as unknown as Schema<unknown>
    }
    const values = (): unknown =>
      pick([
        'x', 'xx', 'xxxx', '', 'ada@example.com', 'nope', 0, 1, 3, 42, 101, 1.5, -1,
        NaN, true, false, 42n, new Date('2026-01-01'), null, undefined, {}, [],
        { f0: 'x' }, { f0: 1 }, { f0: { f0: 'x' } }, [1, 2], ['x'], [{ f0: 'x' }],
        'on', Infinity,
      ])

    let covered = 0
    for (let i = 0; i < 2000; i++) {
      const sc = build(0)
      const input = values()
      if (agree(sc, input, `fuzz#${i}`)) covered++
    }
    // A fuzz that never reaches the verdict emitter proves nothing about it.
    expect(covered, 'fuzz never exercised the verdict emitter').toBeGreaterThan(1000)
  })
})

describe('verdict JIT — cache invalidation', () => {
  it('a chained op after `.is()` has already compiled a verdict is honoured', () => {
    // `_getCheck()` memoizes, including a `null` refusal, so a chained op must
    // clear it. Without that, `.is()` would keep answering with the verdict
    // built for the PREVIOUS op list — a stale-true that `parse()` disagrees
    // with, and the one bug a memoized boolean can hide completely.
    const sc = s.string()
    expect(sc.is('a')).toBe(true)
    const narrowed = sc.min(3)
    expect(narrowed.is('a')).toBe(sc.parse('a').ok)
    expect(narrowed.is('abc')).toBe(true)
    expect(narrowed.is('a')).toBe(false)
  })

  it('a mutated SHARED CHILD cannot desync `.is()` from `.parse()`', () => {
    // `_compiled` and `_jitCheck` are two artifacts of ONE verdict, and a
    // chained method mutates in place while invalidating only the schema it
    // was called on — never its ancestors. If the two are built at different
    // moments, an object over a shared leaf can answer `.is()` from a
    // pre-mutation snapshot and `.parse()` from a post-mutation one.
    //
    // The ancestor staleness itself is PRE-EXISTING and not what this locks:
    // both readers may legitimately be stale. What must never happen is that
    // they are stale DIFFERENTLY. Asserting `is === parse.ok` (rather than a
    // fixed verdict) is deliberate — it holds whichever snapshot wins.
    const leaf = s.string()
    const parent = s.object({ e: leaf })
    expect(parent.is({ e: 'x' })).toBe(parent.parse({ e: 'x' }).ok)
    s.object({ e: leaf.email() }) // in-place chain mutates the SHARED leaf
    expect(parent.is({ e: 'x' })).toBe(parent.parse({ e: 'x' }).ok)
    expect(parent.is({ e: 'a@b.com' })).toBe(parent.parse({ e: 'a@b.com' }).ok)
  })

  it('… and in the reverse order (parse observed first)', () => {
    const leaf = s.string()
    const parent = s.object({ e: leaf })
    expect(parent.parse({ e: 'x' }).ok).toBe(true)
    s.object({ e: leaf.email() })
    expect(parent.is({ e: 'x' })).toBe(parent.parse({ e: 'x' }).ok)
  })

  it('a refine chained after a compiled verdict makes `.is()` fall back, still agreeing', () => {
    const sc = s.object({ a: s.string() })
    expect(sc.is({ a: 'x' })).toBe(true)
    const refined = sc.refine((v) => (v as { a: string }).a !== 'no', { message: 'nope' })
    expect(tryCompileJitCheck(refined)).toBeNull()
    for (const input of [{ a: 'x' }, { a: 'no' }, { a: 1 }, null]) {
      agree(refined, input, 'refined-after-compile')
    }
  })
})
