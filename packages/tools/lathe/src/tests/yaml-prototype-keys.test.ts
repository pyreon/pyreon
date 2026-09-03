import { describe, expect, it } from 'vitest'
import { parseSpecText } from '../input/yaml'

/**
 * A spec reaches this parser over the network — `lathe pull <url>` fetches one
 * and writes it to disk — and the IR it produces is what the emitters turn into
 * SOURCE. So the parser's handling of `__proto__` is not a curiosity: a key that
 * silently disappears is a missing field in a generated client, and a property
 * that silently appears is a value the spec author never wrote being read by the
 * generator.
 *
 * The oracle is `JSON.parse`, which is the OTHER half of this same reader
 * (`parseSpecText` routes `.json` specs to it). Before the fix the two formats
 * disagreed about the same document: JSON defined an own `__proto__` key, YAML
 * replaced the object's prototype.
 */
describe('YAML mapping keys that collide with Object.prototype', () => {
  const BLOCK = `components:
  schemas:
    Thing:
      __proto__:
        polluted: yes
      type: object
`

  it('block mapping: `__proto__` is an own key, not a prototype swap', () => {
    const doc = parseSpecText(BLOCK) as {
      components: { schemas: { Thing: Record<string, unknown> } }
    }
    const thing = doc.components.schemas.Thing

    // The key survives — before the fix `Object.keys` returned only ['type'].
    expect(Object.keys(thing).sort()).toEqual(['__proto__', 'type'])
    // The prototype is untouched — before the fix it was the injected object.
    expect(Object.getPrototypeOf(thing)).toBe(Object.prototype)
    // Nothing leaked in through the chain: `polluted` was reachable as
    // `thing.polluted` before the fix even though it is not a key of `thing`.
    expect((thing as { polluted?: unknown }).polluted).toBeUndefined()
  })

  it('flow mapping: same, on the inline `{…}` path', () => {
    const doc = parseSpecText(`x: {__proto__: {p: 1}, a: 2}\n`) as { x: Record<string, unknown> }
    expect(Object.keys(doc.x).sort()).toEqual(['__proto__', 'a'])
    expect(Object.getPrototypeOf(doc.x)).toBe(Object.prototype)
    expect((doc.x as { p?: unknown }).p).toBeUndefined()
  })

  it('agrees with JSON.parse, the reader’s other half, on the same document', () => {
    const json = JSON.parse('{"__proto__":{"p":1},"a":2}') as Record<string, unknown>
    const yaml = parseSpecText(`__proto__: {p: 1}\na: 2\n`) as Record<string, unknown>
    expect(Object.keys(yaml).sort()).toEqual(Object.keys(json).sort())
    expect(Object.getPrototypeOf(yaml)).toBe(Object.getPrototypeOf(json))
  })

  it('`constructor` as a key does not shadow the real one for other objects', () => {
    const doc = parseSpecText(`constructor: hijacked\nother: 1\n`) as Record<string, unknown>
    expect(doc['constructor']).toBe('hijacked')
    expect(Object.keys(doc).sort()).toEqual(['constructor', 'other'])
    // A sibling object parsed from the same document is unaffected.
    expect(({}).constructor).toBe(Object)
  })
})
