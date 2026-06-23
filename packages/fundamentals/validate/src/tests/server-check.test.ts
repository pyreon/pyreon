// `.serverCheck(key)` — the thin-client / heavy-server primitive.
// Client (key not installed): no-op + records `pending`. Server (installed):
// the registered validator runs, async + context-aware via parseAsync.
import { afterEach, describe, expect, it } from 'vitest'
import { installServerCheck, s, uninstallServerCheck } from '../v1'

afterEach(() => {
  // Test isolation — the registry is process-global.
  uninstallServerCheck('email-unique')
  uninstallServerCheck('not-breached')
})

describe('serverCheck — client (validator not installed)', () => {
  it('is a no-op that records pending; the value passes', () => {
    const sc = s.string().email().serverCheck('email-unique', { message: 'Email taken' })
    const r = sc.parse('a@b.co')
    expect(r.ok).toBe(true)
    expect(r.ok && r.pending?.length).toBe(1)
    expect(r.ok && r.pending?.[0]?.key).toBe('email-unique')
  })

  it('cheap client checks still run first — serverCheck is never reached on a client-invalid value', () => {
    const sc = s.string().email().serverCheck('email-unique', { message: 'Email taken' })
    const r = sc.parse('not-an-email')
    expect(r.ok).toBe(false) // email() fails client-side
  })

  it('pending carries the field path under an object', () => {
    const schema = s.object({ email: s.string().serverCheck('email-unique', { message: 'taken' }) })
    const r = schema.parse({ email: 'x' })
    expect(r.ok && r.pending?.[0]?.path).toEqual(['email'])
  })

  it('a value with no server checks has no pending field', () => {
    const r = s.string().parse('hi')
    expect(r.ok && r.pending).toBeUndefined()
  })
})

describe('serverCheck — server (validator installed)', () => {
  it('sync registered check passes / fails with the schema message', () => {
    installServerCheck('email-unique', (v) => v !== 'taken@b.co')
    const sc = s.string().serverCheck('email-unique', { message: 'Email taken' })
    const okR = sc.parse('free@b.co')
    expect(okR.ok && okR.pending).toBeUndefined() // installed → not pending
    const r = sc.parse('taken@b.co')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.message).toBe('Email taken')
  })

  it('async registered check runs with the threaded context via parseAsync', async () => {
    installServerCheck('email-unique', async (v, ctx) => {
      const taken = (ctx as { taken: string[] }).taken
      return !taken.includes(v as string)
    })
    const sc = s.string().serverCheck('email-unique', { message: 'taken' })
    const ok = await sc.parseAsync('free@b.co', { context: { taken: ['x@b.co'] } })
    expect(ok.ok).toBe(true)
    const bad = await sc.parseAsync('x@b.co', { context: { taken: ['x@b.co'] } })
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.issues[0]?.message).toBe('taken')
  })

  it('async server-check issue carries the correct field path (path-snapshot)', async () => {
    installServerCheck('email-unique', async (v) => v !== 'dup@b.co')
    const schema = s.object({ email: s.string().serverCheck('email-unique', { message: 'taken' }) })
    const r = await schema.parseAsync({ email: 'dup@b.co' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.path).toEqual(['email'])
  })

  it('sync parse() refuses a registered ASYNC server check (directs to parseAsync)', () => {
    installServerCheck('email-unique', async () => true)
    const sc = s.string().serverCheck('email-unique', { message: 'taken' })
    const r = sc.parse('a@b.co')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.message).toMatch(/parseAsync/)
  })

  it('object-level refine runs against the RESOLVED value when a field is async', async () => {
    // The object's `_compileType` returns a Promise (the async email field);
    // the compile pipeline must run the object-level `.refine` against the
    // RESOLVED object, never the Promise (else `o.email`/`o.confirm` read off a
    // Promise — both undefined → equal → never fails → bad case wrongly passes).
    installServerCheck('email-unique', async () => true)
    const schema = s
      .object({
        email: s.string().serverCheck('email-unique', { message: 'taken' }),
        confirm: s.string(),
      })
      .refine((o) => (o as { email: string; confirm: string }).email === (o as { confirm: string }).confirm, {
        message: 'must match',
      })
    const ok = await schema.parseAsync({ email: 'a@b.co', confirm: 'a@b.co' })
    expect(ok.ok).toBe(true)
    const bad = await schema.parseAsync({ email: 'a@b.co', confirm: 'x@b.co' })
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.issues[0]?.message).toBe('must match')
  })

  it('an async FIELD failure skips the object-level pipeline (sync parity)', async () => {
    // Sync parity: a failing field short-circuits the object's own
    // checks/transforms/refines. Under parseAsync the field failure lands AFTER
    // the composite Promise resolves, so the compile pipeline must re-check
    // `ctx.issues` post-await and skip the object refine — else the refine runs
    // spuriously against a value the framework already rejected.
    installServerCheck('email-unique', async (v) => v !== 'taken@b.co')
    let refineRan = false
    const schema = s
      .object({ email: s.string().serverCheck('email-unique', { message: 'taken' }) })
      .refine(() => {
        refineRan = true
        return true
      }, { message: 'never' })
    const r = await schema.parseAsync({ email: 'taken@b.co' }) // field fails
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.message).toBe('taken')
    expect(refineRan).toBe(false) // object refine SKIPPED — the field already failed
  })

  it('async server check on array ELEMENTS validates each item (path carries the index)', async () => {
    installServerCheck('not-breached', async (v) => v !== 'password')
    const schema = s.array(s.string().serverCheck('not-breached', { message: 'breached' }))
    const ok = await schema.parseAsync(['a', 'b', 'c'])
    expect(ok.ok).toBe(true)
    expect(ok.ok && ok.value).toEqual(['a', 'b', 'c'])
    const bad = await schema.parseAsync(['a', 'password', 'c'])
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.issues[0]?.path).toEqual([1])
    expect(!bad.ok && bad.issues[0]?.message).toBe('breached')
  })

  it('JIT-correct: a serverCheck tree falls back to the interpreter (async field is NOT skipped)', async () => {
    installServerCheck('not-breached', async (v) => v !== 'password')
    const schema = s.object({ pw: s.string().min(4).serverCheck('not-breached', { message: 'breached' }) })
    // Warm past the JIT threshold. The root object would normally JIT-compile,
    // but `tryCompileJit` disqualifies any tree containing a serverCheck (its
    // generated sync code can't await) → the async-aware interpreter handles
    // it. Run it many times to prove the disqualification is permanent.
    for (let i = 0; i < 2100; i++) await schema.parseAsync({ pw: 'goodpass' })
    expect((await schema.parseAsync({ pw: 'goodpass' })).ok).toBe(true)
    const r = await schema.parseAsync({ pw: 'password' }) // passes min(4), fails server check
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]?.message).toBe('breached')
  })
})
