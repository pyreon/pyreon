// Compiled validator verdicts — the build-only `pyreon({ compileValidators })`
// pass that appends `X._attachCompiledVerdict(…)` to every module-level,
// fully-emittable `const X = s.<schema>` so the runtime `X.is(v)` runs an
// inlined validator instead of `X.parse(v).ok`. The emitted verdict is
// byte-equivalent to the runtime (locked by the compiler's emit-equivalence
// gate) — these tests drive the REAL plugin transform end-to-end (the emit
// helper is module-internal, not exported) and cover the WIRING: which schemas
// get a tail, and that the eval'd verdict is correct.
import { describe, expect, it } from 'vitest'
import pyreon from '../index'

type Ctx = { warn: (m: string) => void; info: (m: string) => void; resolve: () => Promise<null> }
const ctx: Ctx = { warn: () => {}, info: () => {}, resolve: async () => null }
type Plugin = ReturnType<typeof pyreon>

/** A build-mode `pyreon({ compileValidators: true })` plugin. */
function buildPlugin(): Plugin {
  const plugin = pyreon({ compileValidators: true })
  ;(plugin.config as unknown as (u: Record<string, unknown>, e: { command: string }) => void)(
    { root: '/tmp' },
    { command: 'build' },
  )
  return plugin
}

/** Run a `.ts` schema source through the transform; returns the emitted code (or undefined). */
async function transformTs(src: string, plugin: Plugin = buildPlugin()): Promise<string | undefined> {
  const hook = plugin.transform as unknown as (
    this: Ctx,
    c: string,
    i: string,
    o?: { ssr?: boolean },
  ) => Promise<{ code: string } | undefined>
  const out = await hook.call(ctx, src, '/app/schema.ts', { ssr: false })
  return out?.code
}

const IMPORT = `import { s } from '@pyreon/validate'\n`

describe('pyreon({ compileValidators }) — verdict emission via the transform', () => {
  it('emits a guarded boolean attach-call for a top-level emittable schema', async () => {
    const out = await transformTs(`${IMPORT}const Email = s.string().email()`)
    expect(out).toContain('Email._attachCompiledVerdict(')
    expect(out).toContain('.length === 0') // issues-array → boolean verdict
    expect(out).toContain('catch { return false }') // never throws on bad input
  })

  it('skips function/block-scoped schemas (module-end attach would ReferenceError)', async () => {
    expect(await transformTs(`${IMPORT}function f(){ const Local = s.string() }`)).toBeUndefined()
    expect(await transformTs(`${IMPORT}const f = () => { const L = s.number() }`)).toBeUndefined()
    expect(await transformTs(`${IMPORT}{ const B = s.boolean() }`)).toBeUndefined()
  })

  it('skips non-emittable (unsupported IR) schemas — falls back to runtime .is()', async () => {
    expect(await transformTs(`${IMPORT}const X = s.string().refine(v => true)`)).toBeUndefined()
    expect(await transformTs(`${IMPORT}const X = s.record(s.number())`)).toBeUndefined()
  })

  it('skips anonymous (destructured) bindings — no name to attach to', async () => {
    expect(await transformTs(`${IMPORT}const { X } = s.object({})`)).toBeUndefined()
  })

  it('does nothing without the @pyreon/validate import (cheap gate)', async () => {
    expect(await transformTs(`const Email = s.string().email()`)).toBeUndefined()
  })

  it('emits one attach-call per top-level schema', async () => {
    const out = await transformTs(`${IMPORT}const A = s.string()\nconst B = s.number().int()`)
    expect(out).toContain('A._attachCompiledVerdict(')
    expect(out).toContain('B._attachCompiledVerdict(')
  })

  it("the eval'd verdict computes the correct boolean (and never throws on bad input)", async () => {
    const out = await transformTs(`${IMPORT}const Age = s.number().int().min(18)`)
    const verdict = evalVerdict(out, 'Age')
    expect(verdict(25)).toBe(true) // int ≥ 18
    expect(verdict(17)).toBe(false) // < 18
    expect(verdict(3.5)).toBe(false) // not int
    expect(verdict('x')).toBe(false) // wrong type — must NOT throw
    expect(verdict(null)).toBe(false)
  })

  it("the eval'd object verdict matches runtime parse semantics on null/wrong-type", async () => {
    const out = await transformTs(`${IMPORT}const U = s.object({ email: s.string().email() })`)
    const verdict = evalVerdict(out, 'U')
    expect(verdict({ email: 'a@b.co' })).toBe(true)
    expect(verdict({ email: 'nope' })).toBe(false)
    expect(verdict(null)).toBe(false) // object schema on null → false, never throws
  })
})

/** Slice the appended verdict tail out of the transform output and eval it. */
function evalVerdict(code: string | undefined, name: string): (v: unknown) => boolean {
  if (!code) throw new Error('transform returned no code')
  const marker = '/* @pyreon/vite-plugin: compiled validator verdicts'
  const tail = code.slice(code.indexOf(marker))
  let captured: ((v: unknown) => boolean) | null = null
  const stub = {
    _attachCompiledVerdict(fn: (v: unknown) => boolean) {
      captured = fn
      return this
    },
  }
  // oxlint-disable-next-line no-new-func
  new Function(name, tail)(stub)
  if (!captured) throw new Error('no verdict captured')
  return captured
}
