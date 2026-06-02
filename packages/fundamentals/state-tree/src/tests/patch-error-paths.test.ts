/**
 * Coverage-focused tests for `patch.ts`'s `applyPatch` error paths.
 * Lifts state-tree statements 94.98% → ≥ 95% by exercising the 5 throw
 * branches (lines 122, 126, 129, 133, 142) that previously had no test.
 *
 * Each test plants a real misuse and asserts the documented error message.
 */
import { model, applyPatch } from '../index'

describe('applyPatch — error paths', () => {
  test('throws on unsupported op', () => {
    const Counter = model({ state: { count: 0 } })
    const inst = Counter.create()
    expect(() =>
      applyPatch(inst, {
        op: 'add' as 'replace',
        path: '/count',
        value: 1,
      }),
    ).toThrow(/unsupported op/)
  })

  test('throws on empty path', () => {
    const Counter = model({ state: { count: 0 } })
    const inst = Counter.create()
    expect(() => applyPatch(inst, { op: 'replace', path: '/', value: 1 })).toThrow(
      /empty path/,
    )
  })

  test('throws on reserved property name (intermediate segment, line 122)', () => {
    // RESERVED_KEYS = { __proto__, constructor, prototype }
    const Inner = model({ state: { v: 0 } })
    const Outer = model({ state: { nested: Inner.create() } })
    const inst = Outer.create({ nested: Inner.create() })
    expect(() =>
      applyPatch(inst, { op: 'replace', path: '/__proto__/v', value: 1 }),
    ).toThrow(/reserved property name "__proto__"/)
  })

  test('throws on unknown intermediate state key (line 129)', () => {
    const Inner = model({ state: { v: 0 } })
    const Outer = model({ state: { nested: Inner.create() } })
    const inst = Outer.create({ nested: Inner.create() })
    expect(() =>
      applyPatch(inst, { op: 'replace', path: '/missing/v', value: 1 }),
    ).toThrow(/unknown state key "missing"/)
  })

  test('throws when intermediate segment is not a nested model instance (line 133)', () => {
    // Path walks INTO a primitive segment that isn't a nested model
    const Counter = model({ state: { count: 0, label: 'x' } })
    const inst = Counter.create()
    expect(() =>
      applyPatch(inst, { op: 'replace', path: '/label/inner', value: 1 }),
    ).toThrow(/is not a nested model instance/)
  })

  test('throws on reserved property at LAST segment (line 142)', () => {
    const Counter = model({ state: { count: 0 } })
    const inst = Counter.create()
    expect(() =>
      applyPatch(inst, { op: 'replace', path: '/__proto__', value: 1 }),
    ).toThrow(/reserved property name "__proto__"/)
  })

  test('throws on unknown final state key (line 147)', () => {
    const Counter = model({ state: { count: 0 } })
    const inst = Counter.create()
    expect(() =>
      applyPatch(inst, { op: 'replace', path: '/nonexistent', value: 1 }),
    ).toThrow(/unknown state key "nonexistent"/)
  })
})
