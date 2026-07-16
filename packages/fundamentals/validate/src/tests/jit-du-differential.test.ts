/**
 * JIT ↔ interpreter differential for DISCRIMINATED-UNION ROOTS — the shape
 * `tryCompileJit` compiles to a `Map.get`-fed small-int switch (PR: DU-root
 * JIT). Every observable surface must be byte-identical to the interpreter
 * (`DiscriminatedUnionSchema._compileType` + compileSchema):
 *
 *   - dispatch semantics: `Map.get` SameValueZero (a NaN tag FINDS its
 *     member — a raw `===` switch would not — and the member's literal
 *     check then rejects it, both backends alike)
 *   - the two issue shapes (`invalid_type` "Expected an object",
 *     `invalid_union_discriminator` with `expected: [...tags]`, path
 *     `[...path, discriminant]`) incl. params
 *   - member strip-clone output, prototype-pollution-safe `__proto__`
 *     assigns, enum (multi-tag) discriminants
 *   - non-inlinable members (strict / refined / catchall) falling back to
 *     their `_runInto` closures
 *   - async members: a sync parse returns a Promise both sides (root
 *     async-in-sync contract); awaited states agree
 *   - nested DUs (object field / array element) inline through the same
 *     branch with correct issue paths
 *
 * Deterministic matrix + seeded fuzz (mulberry32) → failures reproduce.
 */
import { describe, expect, it } from 'vitest'
import { compileSchema } from '../core/schema'
import { tryCompileJit } from '../core/jit'
import type { ParseCtx } from '../core/ops'
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

// Full-surface run result — issues keep code/key/message/path AND params so
// the discriminator issue's `expected`/`received` are compared too.
function run(fn: (i: unknown, c: ParseCtx) => unknown, input: unknown) {
  const ctx: ParseCtx = { issues: [], path: [] }
  let value: unknown
  let threw: string | undefined
  try {
    value = fn(input, ctx)
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }
  const isPromise = value instanceof Promise
  const ok = !threw && !isPromise && ctx.issues.length === 0
  return {
    threw,
    isPromise,
    ok,
    // A failed parse's value is discarded by `.parse()` — unobservable.
    value: ok ? value : '<failed>',
    issues: (ctx.issues as Array<{ code?: string; key?: string; message?: string; path?: unknown[]; params?: unknown }>).map(
      (i) => ({ code: i.code, key: i.key, message: i.message, path: i.path, params: i.params }),
    ),
  }
}

function diff(schema: Schema<unknown>, input: unknown, label: string) {
  const jit = tryCompileJit(schema)
  expect(jit, `${label} :: DU root must JIT-compile`).not.toBeNull()
  const interp = compileSchema(schema)
  const a = run(jit!, input)
  const b = run(interp, input)
  expect(a, `${label} :: input=${safe(input)}`).toEqual(b)
}

function safe(v: unknown): string {
  try {
    return JSON.stringify(v)?.slice(0, 120) ?? String(v)
  } catch {
    return Object.prototype.toString.call(v)
  }
}

const BADS: unknown[] = [undefined, null, 42, 'str', true, NaN, [], [1, 2], Symbol.for('x'), 0, '', new Date(0), new Map()]

describe('JIT differential — discriminated-union roots', () => {
  it('a plain DU root JIT-compiles (feature lock — reverts to null disqualify the whole PR)', () => {
    const du = s.discriminatedUnion('kind', [
      s.object({ kind: s.literal('circle'), radius: s.number() }),
      s.object({ kind: s.literal('rect'), w: s.number(), h: s.number() }),
    ])
    expect(tryCompileJit(du as never)).not.toBeNull()
    // a DU with its OWN ops must NOT inline (compileSchema's pipeline owns them)
    const refined = s
      .discriminatedUnion('kind', [
        s.object({ kind: s.literal('a'), v: s.string() }),
        s.object({ kind: s.literal('b'), n: s.number() }),
      ])
      .refine(() => true, { message: 'noop' })
    expect(tryCompileJit(refined as never)).toBeNull()
  })

  it('string/number/boolean literal tags — all dispatch + failure surfaces agree', () => {
    const du = s.discriminatedUnion('kind', [
      s.object({ kind: s.literal('circle'), radius: s.number() }),
      s.object({ kind: s.literal('rect'), w: s.number(), h: s.number() }),
      s.object({ kind: s.literal(3), label: s.string().min(1) }),
      s.object({ kind: s.literal(true), flag: s.boolean() }),
    ]) as unknown as Schema<unknown>
    const inputs: unknown[] = [
      { kind: 'circle', radius: 1.5 },
      { kind: 'circle', radius: 'x' },
      { kind: 'rect', w: 3, h: 4 },
      { kind: 'rect', w: 3, h: 4, extra: 'stripped' },
      { kind: 'rect', w: 'x' }, // field fail + missing field
      { kind: 3, label: 'ok' },
      { kind: 3, label: '' },
      { kind: true, flag: false },
      { kind: false, flag: false }, // unregistered tag
      { kind: 'nope' },
      { kind: undefined },
      {}, // missing tag
      ...BADS,
    ]
    for (const input of inputs) diff(du, input, 'literal-tags')
  })

  it('NaN tag — Map.get SameValueZero parity (a === switch would diverge)', () => {
    const du = s.discriminatedUnion('t', [
      s.object({ t: s.literal(NaN), v: s.string() }),
      s.object({ t: s.literal('a'), n: s.number() }),
    ]) as unknown as Schema<unknown>
    // NaN FINDS its member via SameValueZero, then the member's own literal
    // field check (`NaN !== NaN`) rejects — identical on both backends. The
    // load-bearing lock: the issue must be the member's `invalid_literal`,
    // NOT `invalid_union_discriminator` (which a `===`-based dispatch would
    // produce by missing the NaN key).
    for (const input of [{ t: NaN, v: 'x' }, { t: 'a', n: 1 }, { t: 'b' }, ...BADS]) diff(du, input, 'nan-tag')
    const jit = tryCompileJit(du)!
    const ctx: ParseCtx = { issues: [], path: [] }
    jit({ t: NaN, v: 'x' }, ctx)
    expect((ctx.issues[0] as { code?: string }).code).toBe('invalid_literal')
  })

  it('enum discriminant — several tags dispatch to ONE member', () => {
    const du = s.discriminatedUnion('t', [
      s.object({ t: s.enum(['a', 'b']), v: s.string().min(1) }),
      s.object({ t: s.literal('c'), n: s.number().int() }),
    ]) as unknown as Schema<unknown>
    const inputs: unknown[] = [
      { t: 'a', v: 'x' },
      { t: 'b', v: 'x' },
      { t: 'b', v: '' },
      { t: 'c', n: 2 },
      { t: 'c', n: 2.5 },
      { t: 'd' },
      ...BADS,
    ]
    for (const input of inputs) diff(du, input, 'enum-tag')
  })

  it('non-inlinable members (strict / refine / catchall / optional fields) fall back per case', () => {
    const du = s.discriminatedUnion('t', [
      s.object({ t: s.literal('strict'), v: s.string() }).strict(),
      s.object({ t: s.literal('refined'), n: s.number() }).refine((o: { n: number }) => o.n > 0, { message: 'must be positive' }),
      s.object({ t: s.literal('catch') }).catchall(s.number()),
      s.object({ t: s.literal('opt'), maybe: s.string().optional() }),
      s.object({ t: s.literal('plain'), v: s.number() }),
    ]) as unknown as Schema<unknown>
    const inputs: unknown[] = [
      { t: 'strict', v: 'x' },
      { t: 'strict', v: 'x', extra: 1 }, // strict rejects unknown key
      { t: 'refined', n: 5 },
      { t: 'refined', n: -5 }, // refine fails
      { t: 'catch', anything: 42 },
      { t: 'catch', anything: 'not-a-number' }, // catchall rejects
      { t: 'opt' },
      { t: 'opt', maybe: 'x' },
      { t: 'opt', maybe: 42 },
      { t: 'plain', v: 1 },
      { t: 'zzz' },
      ...BADS,
    ]
    for (const input of inputs) diff(du, input, 'fallback-members')
  })

  it('__proto__ discriminant + __proto__ member field — pollution-safe, byte-identical', () => {
    const duProtoField = s.discriminatedUnion('t', [
      s.object({ t: s.literal('a'), ['__proto__']: s.string() }),
      s.object({ t: s.literal('b'), n: s.number() }),
    ]) as unknown as Schema<unknown>
    for (const input of [
      JSON.parse('{"t":"a","__proto__":"evil"}'),
      JSON.parse('{"t":"a","__proto__":{"polluted":1}}'),
      { t: 'b', n: 1 },
      ...BADS,
    ]) {
      diff(duProtoField, input, 'proto-field')
    }
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
    // strip-clone writes __proto__ as an OWN property, never the prototype
    const jit = tryCompileJit(duProtoField)!
    const ctx: ParseCtx = { issues: [], path: [] }
    const out = jit(JSON.parse('{"t":"a","__proto__":"evil"}'), ctx) as Record<string, unknown>
    expect(ctx.issues).toEqual([])
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(Object.getOwnPropertyDescriptor(out, '__proto__')?.value).toBe('evil')
  })

  it('nested DU — as an object field and as an array element (inlined at depth ≥ 1, paths correct)', () => {
    const inner = s.discriminatedUnion('t', [
      s.object({ t: s.literal('a'), v: s.string().min(1) }),
      s.object({ t: s.literal('b'), n: s.number().int() }),
    ])
    const asField = s.object({ id: s.number().int(), shape: inner as never }) as unknown as Schema<unknown>
    const asElement = s.array(inner as never) as unknown as Schema<unknown>
    const fieldInputs: unknown[] = [
      { id: 1, shape: { t: 'a', v: 'x' } },
      { id: 1, shape: { t: 'a', v: '' } }, // nested member field fail → path ['shape','v']
      { id: 1, shape: { t: 'zzz' } }, // nested bad tag → path ['shape','t']
      { id: 1, shape: 42 }, // nested not-object → path ['shape']
      { id: 1 },
      { id: 1.5, shape: { t: 'b', n: 1 } },
      ...BADS,
    ]
    for (const input of fieldInputs) diff(asField, input, 'nested-du-field')
    const elementInputs: unknown[] = [
      [{ t: 'a', v: 'x' }, { t: 'b', n: 2 }],
      [{ t: 'a', v: '' }], // element member fail → path [0,'v']
      [{ t: 'zzz' }], // element bad tag → path [0,'t']
      [42],
      [],
      ...BADS,
    ]
    for (const input of elementInputs) diff(asElement, input, 'nested-du-element')
  })

  it('async members — sync parse returns a Promise both sides; awaited states agree', async () => {
    const du = s.discriminatedUnion('t', [
      s.object({ t: s.literal('a'), v: s.string().refine(async (x: string) => x.length > 1, { message: 'async-min2' }) }),
      s.object({ t: s.literal('b'), n: s.number().transform(async (x: number) => x * 2) }),
      s.object({ t: s.literal('c'), plain: s.boolean() }),
    ]) as unknown as Schema<unknown>
    const jit = tryCompileJit(du)!
    const interp = compileSchema(du)
    for (const input of [
      { t: 'a', v: 'xy' },
      { t: 'a', v: 'x' }, // async refine fails
      { t: 'b', n: 3 }, // async transform
      { t: 'c', plain: true }, // sync member of an async-capable DU
      { t: 'zzz' },
      42,
    ]) {
      const a = await runAwaited(jit, input)
      const b = await runAwaited(interp, input)
      expect(a, `async-du :: input=${safe(input)}`).toEqual(b)
    }
  })

  it('600 seeded random DU roots × inputs agree JIT ≡ interpreter', () => {
    const r = rng(0xd15c0)
    const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!
    const fieldSchema = (): Schema<unknown> =>
      pick<Schema<unknown>>([
        s.string(),
        s.string().min(1),
        s.number().int(),
        s.number().between(0, 9),
        s.boolean(),
        s.string().optional() as Schema<unknown>,
        s.number().default(7) as Schema<unknown>,
        s.array(s.number().int()),
        s.object({ inner: s.string().min(1) }),
      ])
    const tags = ['a', 'b', 'c', 'd']
    for (let n = 0; n < 600; n++) {
      const memberCount = 2 + Math.floor(r() * 3)
      const members: unknown[] = []
      for (let m = 0; m < memberCount; m++) {
        const shape: Record<string, Schema<unknown>> = { t: s.literal(tags[m]!) as Schema<unknown> }
        const fields = Math.floor(r() * 3)
        const names = ['x', 'y', '__proto__']
        for (let f = 0; f < fields; f++) shape[names[f]!] = fieldSchema()
        let member = s.object(shape as never)
        const roll = r()
        if (roll < 0.12) member = member.strict() as typeof member
        else if (roll < 0.2) member = member.passthrough() as typeof member
        members.push(member)
      }
      const schema = s.discriminatedUnion('t', members as never) as unknown as Schema<unknown>
      let input: unknown
      const roll = r()
      if (roll < 0.2) input = pick(BADS)
      else {
        const obj: Record<string, unknown> = {}
        if (r() < 0.9) obj.t = pick([...tags, 'zzz', 42, undefined, NaN])
        for (const k of ['x', 'y']) {
          if (r() > 0.4) obj[k] = pick([1, 2.5, 'q', '', true, null, undefined, [1], { inner: 'ok' }, { inner: '' }, {}])
        }
        if (r() > 0.7) obj.extra = 1
        input = obj
      }
      diff(schema, input, `dufuzz#${n}`)
    }
  })
})

async function runAwaited(fn: (i: unknown, c: ParseCtx) => unknown, input: unknown) {
  const ctx: ParseCtx = { issues: [], path: [] }
  let value: unknown
  let threw: string | undefined
  let wasPromise = false
  try {
    value = fn(input, ctx)
    if (value instanceof Promise) {
      wasPromise = true
      value = await value
    }
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e)
  }
  const ok = !threw && ctx.issues.length === 0
  return {
    threw,
    wasPromise,
    ok,
    value: ok ? value : '<failed>',
    issues: (ctx.issues as Array<{ code?: string; message?: string; path?: unknown[] }>).map((i) => ({
      code: i.code,
      message: i.message,
      path: i.path,
    })),
  }
}
