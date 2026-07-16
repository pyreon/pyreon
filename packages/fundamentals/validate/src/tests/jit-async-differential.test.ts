/**
 * JIT ↔ interpreter differential for ASYNC trees — the grammar gap that let
 * the "JIT hard-errors on any Promise from a fallback subtree" bug ship: the
 * two existing differentials never generated async `.refine`/`.transform`/
 * `.serverCheck` fields, so the JIT's old field-level async-in-sync issue
 * (vs the interpreter's root-level Promise) was invisible.
 *
 * Here every generated container carries at least one ASYNC-CAPABLE field
 * (async refine / async transform / registered-async serverCheck /
 * unregistered serverCheck → pending contract), and the harness AWAITS both
 * backends, comparing the RESOLVED { ok, value, issues, pending } states.
 * Sync-parse behavior is compared too: both backends must return a Promise
 * (root async-in-sync), never a member/field-level hard issue.
 *
 * Seeded (mulberry32) → deterministic.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compileSchema } from '../core/schema'
import { tryCompileJit } from '../core/jit'
import type { ParseCtx } from '../core/ops'
import type { Schema } from '../core/schema'
import { registerServerCheck, uninstallServerCheck } from '../server'
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
    issues: (ctx.issues as Array<{ message?: string; path?: unknown[] }>)
      .map((i) => ({ message: i.message, path: JSON.stringify(i.path ?? []) }))
      .sort((a, b) => (a.path! + a.message!).localeCompare(b.path! + b.message!)),
    pending: (ctx.pending ?? [])
      .map((p) => ({ key: p.key, path: JSON.stringify(p.path) }))
      .sort((a, b) => (a.path + a.key).localeCompare(b.path + b.key)),
  }
}

// Async-capable field builders. The async fns are DETERMINISTIC per value so
// both backends observe identical verdicts.
function asyncField(r: () => number): Schema<unknown> {
  switch (Math.floor(r() * 6)) {
    case 0:
      return s.string().refine(async (v: string) => v.length > 1, { message: 'async-min2' }) as Schema<unknown>
    case 1:
      return s.number().refine(async (v: number) => v >= 0, { message: 'async-nonneg' }) as Schema<unknown>
    case 2:
      return s.string().transform(async (v: string) => v.toUpperCase()) as Schema<unknown>
    case 3:
      return s.string().serverCheck('jit-async-diff-ok') as Schema<unknown> // registered async → runs
    case 4:
      return s.string().serverCheck('jit-async-diff-unregistered') as Schema<unknown> // pending contract
    default:
      return s.number().transform(async (v: number) => v * 3).catch(-1) as Schema<unknown>
  }
}

function syncField(r: () => number): Schema<unknown> {
  switch (Math.floor(r() * 4)) {
    case 0:
      return s.string().min(1) as Schema<unknown>
    case 1:
      return s.number().int() as Schema<unknown>
    case 2:
      return s.boolean() as Schema<unknown>
    default:
      return s.object({ inner: s.string() }) as Schema<unknown>
  }
}

function randValue(r: () => number): unknown {
  const xs: unknown[] = ['x', 'xy', 'xyz', '', 7, 0, -1, 1.5, NaN, true, false, null, undefined, {}, [], { inner: 'ok' }, ['a', 'b'], [1, -2], 42]
  return xs[Math.floor(r() * xs.length)]
}

beforeAll(() => {
  registerServerCheck('jit-async-diff-ok', async (v) => typeof v === 'string' && v.length > 0)
})
afterAll(() => {
  uninstallServerCheck('jit-async-diff-ok')
})

describe('JIT differential — async trees (awaited)', () => {
  it('2000 seeded async-fielded schemas × inputs agree JIT ≡ interpreter after await', async () => {
    const r = rng(0xa51dc0)
    const keyNames = ['a', 'b', 'c', '__proto__']
    const failures: string[] = []

    for (let seed = 1; seed <= 2000; seed++) {
      const rootRoll = r()
      const rootIsArray = rootRoll < 0.25
      // DU root: async-capable fields INSIDE inline members, plus (sometimes)
      // a member-LEVEL async refine — the member then falls back per case and
      // its Promise routes through the DU switch's onAsync arm.
      const rootIsDu = !rootIsArray && rootRoll < 0.45
      let schema: Schema<unknown>
      if (rootIsArray) {
        schema = s.array(asyncField(r) as never) as Schema<unknown>
        if (r() < 0.4) (schema as unknown as { min(n: number): unknown }).min(1)
      } else if (rootIsDu) {
        const memberA = s.object({ t: s.literal('a') as never, v: asyncField(r) as never })
        const memberB0 = s.object({
          t: s.literal('b') as never,
          n: (r() < 0.5 ? asyncField(r) : syncField(r)) as never,
        })
        const memberB =
          r() < 0.3
            ? memberB0.refine(async (o: unknown) => (o as { t: string }).t === 'b', { message: 'async-member-refine' })
            : memberB0
        schema = s.discriminatedUnion('t', [memberA, memberB] as never) as unknown as Schema<unknown>
      } else {
        const shape: Record<string, Schema<unknown>> = {}
        const n = 1 + Math.floor(r() * 3)
        for (let i = 0; i < n; i++) shape[keyNames[i]!] = r() < 0.6 ? asyncField(r) : syncField(r)
        // guarantee ≥1 async-capable field
        shape[keyNames[0]!] = asyncField(r)
        schema = s.object(shape as never) as Schema<unknown>
      }

      const jit = tryCompileJit(schema)
      if (!jit) continue
      const interp = compileSchema(schema)

      let input: unknown
      if (r() < 0.15) input = randValue(r)
      else if (rootIsDu) {
        const obj: Record<string, unknown> = {}
        if (r() < 0.9) obj.t = ['a', 'b', 'zzz'][Math.floor(r() * 3)]
        if (r() > 0.3) obj.v = randValue(r)
        if (r() > 0.3) obj.n = randValue(r)
        input = obj
      } else if (rootIsArray) {
        const len = Math.floor(r() * 4)
        input = Array.from({ length: len }, () => randValue(r))
      } else {
        const obj: Record<string, unknown> = {}
        for (const k of keyNames) if (r() > 0.35) obj[k] = randValue(r)
        input = obj
      }

      const a = await runAwaited(jit, input)
      const b = await runAwaited(interp, input)
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        failures.push(`seed=${seed} :: JIT=${JSON.stringify(a).slice(0, 220)} INTERP=${JSON.stringify(b).slice(0, 220)}`)
        if (failures.length >= 5) break
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })

  it('serverCheck fields no longer disqualify the JIT (the tree compiles + pending flows)', () => {
    const schema = s.object({ email: s.string().serverCheck('email-unique'), name: s.string().min(1) })
    expect(tryCompileJit(schema as never)).not.toBeNull()
    const r = schema.parse({ email: 'a@b.co', name: 'Ada' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.pending).toEqual([{ path: ['email'], key: 'email-unique' }])
  })
})
