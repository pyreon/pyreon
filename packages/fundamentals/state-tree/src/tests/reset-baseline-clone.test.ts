/**
 * Schema-mode reset baseline: `cloneResetBaseline` (instance.ts) deep-clones
 * object fields so in-place mutation cannot poison `reset()`, and copies
 * primitive fields by value WITHOUT a `structuredClone` round-trip (the
 * serializer cost ~18% of a flat schema-mode `.create()`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { model } from '../index'

const schema = z.object({
  n: z.number(),
  s: z.string(),
  b: z.boolean(),
  nul: z.null(),
  undef: z.undefined(),
  big: z.bigint(),
  negZero: z.number(),
  tags: z.array(z.string()),
  nested: z.object({ deep: z.object({ v: z.number() }) }),
})

const initial = {
  n: 1,
  s: 'a',
  b: true,
  nul: null,
  undef: undefined,
  big: 7n,
  negZero: -0,
  tags: ['x'],
  nested: { deep: { v: 1 } },
}

type Sig<T> = { (): T; set(v: T): void }
type Inst = {
  n: Sig<number>
  s: Sig<string>
  b: Sig<boolean>
  nul: Sig<null>
  undef: Sig<undefined>
  big: Sig<bigint>
  negZero: Sig<number>
  tags: Sig<string[]>
  nested: Sig<{ deep: { v: number } }>
  reset(): void
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('schema-mode reset baseline — primitive fields', () => {
  it('never route a primitive through structuredClone (create and reset)', () => {
    const spy = vi.spyOn(globalThis, 'structuredClone')
    const M = model({ schema, initial })
    const m = M.create() as unknown as Inst
    m.reset()
    expect(spy).toHaveBeenCalled()
    for (const [arg] of spy.mock.calls) {
      expect(arg !== null && typeof arg === 'object').toBe(true)
    }
  })

  it('restore every primitive, including null / undefined / bigint / -0', () => {
    const M = model({ schema, initial })
    const m = M.create() as unknown as Inst
    m.n.set(2)
    m.s.set('b')
    m.b.set(false)
    m.big.set(99n)
    m.negZero.set(5)
    m.reset()
    expect(m.n()).toBe(1)
    expect(m.s()).toBe('a')
    expect(m.b()).toBe(true)
    expect(m.nul()).toBe(null)
    expect(m.undef()).toBe(undefined)
    expect(m.big()).toBe(7n)
    expect(Object.is(m.negZero(), -0)).toBe(true)
  })
})

describe('schema-mode reset baseline — object and array fields keep clone semantics', () => {
  it('clones arrays and nested objects through structuredClone', () => {
    const spy = vi.spyOn(globalThis, 'structuredClone')
    const M = model({ schema, initial })
    M.create()
    const cloned = spy.mock.calls.map(([arg]) => arg)
    expect(cloned.some((a) => Array.isArray(a))).toBe(true)
    expect(cloned.some((a) => a !== null && typeof a === 'object' && 'deep' in a)).toBe(true)
  })

  it('in-place mutation of an array / nested object does not poison reset, across repeated resets', () => {
    const M = model({ schema, initial })
    const m = M.create() as unknown as Inst
    m.tags().push('mutated')
    m.nested().deep.v = 42
    m.reset()
    expect(m.tags()).toEqual(['x'])
    expect(m.nested().deep.v).toBe(1)
    // The reset value is itself a fresh clone: mutating it must not leak into
    // the next reset.
    m.tags().push('again')
    m.nested().deep.v = 43
    m.reset()
    expect(m.tags()).toEqual(['x'])
    expect(m.nested().deep.v).toBe(1)
    // And the caller's `initial` object is never aliased.
    expect(initial.tags).toEqual(['x'])
    expect(initial.nested.deep.v).toBe(1)
  })
})
