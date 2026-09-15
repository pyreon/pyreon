/**
 * A DAG is not a cycle.
 *
 * `encodeIslandProps` tracked every object it had EVER visited and never pruned
 * it, so an object referenced twice — which `JSON.stringify` handles fine — was
 * reported as a circular reference. Both callers CATCH (an island must not 500
 * the SSR), so the visible symptom was not an error: production shipped
 * `data-props="{}"` and the island hydrated with EMPTY PROPS, with only a
 * dev-mode `console.error` explaining it.
 *
 * Same defect, same fix as `@pyreon/router`'s `stringifyLoaderData`: an ANCESTOR
 * set, added on descend and deleted on ascend.
 */
import { describe, expect, it } from 'vitest'
import { decodeIslandProps, encodeIslandProps } from '../island-codec'

const roundtrip = (v: unknown) => decodeIslandProps(encodeIslandProps(v, 'Test'))

describe('island props — a shared reference is not a cycle', () => {
  it('the same object under two keys encodes (and matches JSON.stringify)', () => {
    const user = { id: 1, name: 'ada' }
    const props = { author: user, lastEditor: user }
    expect(roundtrip(props)).toEqual(props)
    expect(JSON.stringify(encodeIslandProps(props, 'Test'))).toBe(JSON.stringify(props))
  })

  it('the same array under two keys encodes', () => {
    const tags = ['a', 'b']
    const props = { current: tags, all: tags }
    expect(roundtrip(props)).toEqual(props)
  })

  it('rows sharing one lookup object encode', () => {
    // The dominant real shape: a list whose rows all point at the same category
    // / author / config record.
    const category = { id: 7, label: 'news' }
    const props = { rows: [{ id: 1, category }, { id: 2, category }, { id: 3, category }] }
    expect(roundtrip(props)).toEqual(props)
  })

  it('a shared LEAF (Date / RegExp) encodes — the branch with no recursion', () => {
    // Date and RegExp return before any child walk, so a per-exit `delete` would
    // have missed them and a shared one would still have thrown.
    const d = new Date('2020-01-02T03:04:05.000Z')
    const r = /ab+c/gi
    const out = roundtrip({ from: d, to: d, a: r, b: r }) as Record<string, unknown>
    expect(out.from).toEqual(d)
    expect(out.to).toEqual(d)
    expect(out.a).toEqual(r)
    expect(out.b).toEqual(r)
  })

  it('a shared object inside a Map / Set encodes', () => {
    const shared = { k: 1 }
    const out = roundtrip({
      m: new Map([['x', shared]]),
      s: new Set([shared]),
      direct: shared,
    }) as Record<string, unknown>
    expect((out.m as Map<string, unknown>).get('x')).toEqual(shared)
    expect([...(out.s as Set<unknown>)]).toEqual([shared])
  })

  it('a diamond (two paths to one node) encodes', () => {
    const leaf = { v: 1 }
    const left = { leaf }
    const right = { leaf }
    expect(roundtrip({ left, right })).toEqual({ left: { leaf: { v: 1 } }, right: { leaf: { v: 1 } } })
  })

  it('a REAL cycle still throws, naming the path', () => {
    const a: Record<string, unknown> = { name: 'a' }
    a.self = a
    expect(() => encodeIslandProps(a, 'Test')).toThrow(/Circular reference at "\$\.self"/)
  })

  it('a real cycle through an ARRAY still throws', () => {
    const arr: unknown[] = [1]
    arr.push(arr)
    expect(() => encodeIslandProps({ arr }, 'Test')).toThrow(/Circular reference/)
  })

  it('a real cycle through a Map VALUE still throws', () => {
    const m = new Map<string, unknown>()
    m.set('self', m)
    expect(() => encodeIslandProps({ m }, 'Test')).toThrow(/Circular reference/)
  })

  it('a MUTUAL cycle (a -> b -> a) still throws', () => {
    const a: Record<string, unknown> = {}
    const b: Record<string, unknown> = { a }
    a.b = b
    expect(() => encodeIslandProps({ a }, 'Test')).toThrow(/Circular reference/)
  })

  it('the depth guard still fires (a deep chain is not mistaken for a cycle)', () => {
    let node: Record<string, unknown> = {}
    const root = node
    for (let i = 0; i < 120; i++) {
      const next: Record<string, unknown> = {}
      node.next = next
      node = next
    }
    expect(() => encodeIslandProps(root, 'Test')).toThrow(/Maximum prop nesting depth/)
  })

  it('a WIDE shared-reference payload does not hit the depth guard either', () => {
    // 500 rows sharing one object is depth 3, not depth 500 — the ancestor set
    // must not conflate breadth with depth.
    const shared = { z: 1 }
    const rows = Array.from({ length: 500 }, () => ({ shared }))
    expect(() => encodeIslandProps({ rows }, 'Test')).not.toThrow()
  })
})
