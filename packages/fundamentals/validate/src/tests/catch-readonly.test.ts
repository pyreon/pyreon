// `.catch(fallback)` (resilient parse) + `.readonly()` (freeze + Readonly<T>).
import { describe, expect, it } from 'vitest'
import { installServerCheck, s, uninstallServerCheck } from '../v1'

describe('.catch — resilient parse', () => {
  it('passes a valid value through unchanged', () => {
    const r = s.number().catch(0).parse(42)
    expect(r.ok && r.value).toBe(42)
  })

  it('substitutes the fallback on a type failure', () => {
    const r = s.number().catch(0).parse('nope')
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toBe(0)
  })

  it('substitutes on a CHECK failure (not just type)', () => {
    const r = s.string().min(3).catch('fallback').parse('ab')
    expect(r.ok && r.value).toBe('fallback')
  })

  it('is terminal regardless of chain position', () => {
    const after = s.string().min(3).catch('x').parse('ab')
    const before = s.string().catch('x').min(3).parse('ab')
    expect(after.ok && after.value).toBe('x')
    expect(before.ok && before.value).toBe('x')
  })

  it('a function fallback receives the raw input', () => {
    const r = s.number().catch((input) => `was:${String(input)}` as unknown as number).parse('boom')
    expect(r.ok && r.value).toBe('was:boom')
  })

  it('leaves no leaked issues after a caught failure', () => {
    const r = s.number().catch(0).parse('x')
    // ok branch — issues array is absent entirely
    expect(r.ok).toBe(true)
    expect('issues' in r).toBe(false)
  })

  it('catches a FIELD failure inside an object (object still succeeds)', () => {
    const schema = s.object({
      name: s.string(),
      age: s.number().catch(0),
    })
    const r = schema.parse({ name: 'Ada', age: 'not-a-number' })
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toEqual({ name: 'Ada', age: 0 })
  })

  it('only catches THIS field — a sibling failure still fails the object', () => {
    const schema = s.object({
      name: s.string(), // no catch
      age: s.number().catch(0),
    })
    const r = schema.parse({ name: 123, age: 'x' })
    expect(r.ok).toBe(false) // name failed; age was caught
    expect(!r.ok && r.issues.some((i) => i.path?.[0] === 'name')).toBe(true)
    expect(!r.ok && r.issues.some((i) => i.path?.[0] === 'age')).toBe(false)
  })

  it('catches an async SERVER-CHECK failure (catch + serverCheck integration)', async () => {
    // Integration of the two pipelines: settleCatch's Promise branch must catch
    // an async serverCheck failure (the value runPostType returns is a Promise).
    installServerCheck('breached', async (v) => v !== 'password')
    try {
      const schema = s.string().serverCheck('breached', { message: 'breached' }).catch('safe-default')
      const caught = await schema.parseAsync('password') // serverCheck fails
      expect(caught.ok).toBe(true)
      expect(caught.ok && caught.value).toBe('safe-default')
      const passed = await schema.parseAsync('ok123') // serverCheck passes
      expect(passed.ok && passed.value).toBe('ok123')
    } finally {
      uninstallServerCheck('breached')
    }
  })

  it('catches an async refine failure after the Promise settles (parseAsync)', async () => {
    const schema = s
      .string()
      .refine(async (v) => v === 'ok', { message: 'async-fail' })
      .catch('fallback')
    const good = await schema.parseAsync('ok')
    expect(good.ok && good.value).toBe('ok')
    const bad = await schema.parseAsync('nope')
    expect(bad.ok).toBe(true)
    expect(bad.ok && bad.value).toBe('fallback')
  })

  it('JIT-warm object with a caught field stays correct (interpreter fallback)', () => {
    const schema = s.object({ n: s.number().catch(-1) })
    for (let i = 0; i < 2100; i++) schema.parse({ n: i })
    const good = schema.parse({ n: 7 })
    expect(good.ok && good.value).toEqual({ n: 7 })
    const caught = schema.parse({ n: 'bad' })
    expect(caught.ok && caught.value).toEqual({ n: -1 })
  })
})

describe('.readonly — freeze + Readonly<T>', () => {
  it('freezes the parsed object output', () => {
    const schema = s.object({ port: s.number() }).readonly()
    const r = schema.parse({ port: 80 })
    expect(r.ok).toBe(true)
    expect(r.ok && Object.isFrozen(r.value)).toBe(true)
    expect(r.ok && r.value).toEqual({ port: 80 })
  })

  it('freezes the parsed array output', () => {
    const schema = s.array(s.string()).readonly()
    const r = schema.parse(['a', 'b'])
    expect(r.ok && Object.isFrozen(r.value)).toBe(true)
    expect(r.ok && r.value).toEqual(['a', 'b'])
  })

  it('passes primitives through (freeze is a no-op, value preserved)', () => {
    const r = s.string().readonly().parse('hi')
    expect(r.ok && r.value).toBe('hi')
  })

  it('a frozen object throws on mutation in strict mode', () => {
    const r = s.object({ a: s.number() }).readonly().parse({ a: 1 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(() => {
        ;(r.value as { a: number }).a = 2
      }).toThrow()
    }
  })

  it('still type-checks (a readonly schema rejects wrong input)', () => {
    const r = s.object({ a: s.number() }).readonly().parse({ a: 'x' })
    expect(r.ok).toBe(false)
  })
})
