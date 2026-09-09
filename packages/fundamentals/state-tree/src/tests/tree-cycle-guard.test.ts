import { describe, expect, it } from 'vitest'
import { getPath, getRoot, model } from '../index'

/**
 * A cyclic parent chain is constructible through the public API — writing two
 * instances into each other makes each the other's parent:
 *
 *   a.child.set(b)  // b.parent = a
 *   b.child.set(a)  // a.parent = b
 *
 * The ancestor walks in `getRoot` / `getPath` are bounded so they cannot spin
 * forever. Before this fix the bound was a silent exit: `getRoot` returned the
 * node it happened to be holding (a WRONG root, returned on every call of the
 * hot `reference()` resolve path), and `getPath` returned a 600,000-character
 * garbage string built by 100,000 `unshift`s (~700ms per call). Hitting the
 * bound means the acyclicity invariant is already broken, so there is no
 * correct answer left to return — both must throw.
 */
describe('tree walks — cyclic parent chain is LOUD, not a wrong answer', () => {
  const Node = model({ state: { name: '', child: undefined as unknown } })

  function makeCycle() {
    const a = Node.create({ name: 'a', child: undefined })
    const b = Node.create({ name: 'b', child: undefined })
    a.child.set(b)
    b.child.set(a)
    return { a: a as object, b: b as object }
  }

  it('the cycle really is reachable through the public API', () => {
    const { a, b } = makeCycle()
    // Each is the other's parent — neither is a root, so neither walk terminates.
    expect(() => getRoot(a)).toThrow()
    expect(() => getRoot(b)).toThrow()
  })

  it('getRoot THROWS instead of returning a wrong root', () => {
    const { a } = makeCycle()
    expect(() => getRoot(a)).toThrow(/\[Pyreon\] state-tree getRoot: cyclic parent chain/)
  })

  it('getPath THROWS instead of returning a garbage path', () => {
    const { a } = makeCycle()
    expect(() => getPath(a)).toThrow(/\[Pyreon\] state-tree getPath: cyclic parent chain/)
  })

  it('the throw names the node and the fix', () => {
    const { a } = makeCycle()
    let message = ''
    try {
      getRoot(a)
    } catch (err) {
      message = (err as Error).message
    }
    // Identifies the node: models carry no name, so the attach key + state keys.
    expect(message).toContain('key "child"')
    expect(message).toContain('name, child')
    // Names the cause and the remedy, not just the symptom.
    expect(message).toContain('acyclic')
    expect(message).toContain('Detach one side')
  })

  it('a single (acyclic) write through the same API still resolves — the throw is the CYCLE, not `.set()`', () => {
    const a = Node.create({ name: 'a', child: undefined })
    const b = Node.create({ name: 'b', child: undefined })
    a.child.set(b) // only one direction: b is a child of a, a stays a root
    expect(getRoot(b as object)).toBe(a as object)
    expect(getRoot(a as object)).toBe(a as object)
    expect(getPath(b as object)).toBe('/child')
    expect(getPath(a as object)).toBe('')
  })

  it('a well-formed deep chain still walks normally (the bound is not a depth cap)', () => {
    const C = model({ state: { x: 0 } })
    const B = model({ state: { c: C } })
    const A = model({ state: { b: B } })
    const a = A.create()
    const b = a.b() as object
    const c = (b as { c: () => object }).c()
    expect(getRoot(c)).toBe(a)
    expect(getPath(c)).toBe('/b/c')
  })
})
