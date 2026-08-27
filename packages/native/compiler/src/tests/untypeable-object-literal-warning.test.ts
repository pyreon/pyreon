import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/**
 * An object literal that cannot be given a synthesized struct falls back to a
 * TUPLE, and both targets then emit something structurally wrong — differently,
 * which is what kept the whole class hidden:
 *
 *   Kotlin  `(id = "a", parent = null)` — named arguments with no constructor.
 *           Not valid Kotlin; the Gradle build dies on it.
 *   Swift   `(id: "a", parent: nil)` typed `Any` — a labelled tuple, which
 *           COMPILES. Tuples are not `Codable`, so `PyreonJSON.encode` and a
 *           `<WebView data=>` push silently produce the wrong bytes at runtime.
 *           (A SINGLE-field labelled tuple does not even compile —
 *           "cannot create a single-element tuple with an element label".)
 *
 * The warning lives at the BAIL SITE, not in a parser pattern-match. The first
 * cut enumerated the one shape that had been observed — an un-annotated empty
 * array field. Sweeping the synthesis frontier then found five more that fail
 * identically and just as silently: `null` and `undefined` fields, a NESTED
 * empty array, a mixed scalar array, an array of arrays. Every one is an
 * ordinary data model (`{ id, parent: null }` is a tree node), and each would
 * have needed its own parser rule. The bail site already knows which field
 * defeated it; asking it is one rule for the whole class.
 */
const mk = (pre: string, decl: string): string => `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
${pre}
export function C() {
  ${decl}
  return <Stack><Text>ok</Text></Stack>
}
`

const TYPES = `type Node = { id: string }
type Edge = { from: string; to: string }
type Graph = { nodes: Node[]; edges: Edge[] }`

const warnsFor = (pre: string, decl: string, target: 'swift' | 'kotlin' = 'kotlin'): string[] =>
  (transform(mk(pre, decl), { target }).warnings ?? []).filter((w) =>
    w.includes('no struct could be synthesized'),
  )

describe('object literal with no synthesizable struct', () => {
  // Every one of these emitted a broken tuple SILENTLY before this warning
  // existed. They are ordinary data models, not exotic shapes.
  it.each([
    ['an empty array field', `signal({ nodes: [{ id: 'a' }], edges: [] })`, 'empty array literal carries no element type'],
    ['a lone empty array field', `signal({ nodes: [] })`, 'empty array literal carries no element type'],
    ['a null field', `signal({ id: 'a', parent: null })`, 'carries no type'],
    ['an undefined field', `signal({ id: 'a', note: undefined })`, 'carries no type'],
    ['a NESTED empty array', `signal({ id: 'a', meta: { tags: [], n: 1 } })`, 'nested object literal'],
    ['a mixed scalar array', `signal({ id: 'a', xs: [1, 'two'] })`, 'mixes element types'],
    ['an array of arrays', `signal({ id: 'a', grid: [[1, 2], [3, 4]] })`, 'array of arrays'],
  ])('warns on %s, and says why', (_label, init, because) => {
    const [warning] = warnsFor('', `const g = ${init}`)
    expect(warning, 'the broken shape must warn').toBeDefined()
    expect(warning).toContain(because)
    expect(warning).toContain('signal<Shape>') // the verified remedy
  })

  it('warns on BOTH targets — the shape is broken on both, in different ways', () => {
    const decl = `const g = signal({ id: 'a', parent: null })`
    // Same cause, target-specific consequence: Kotlin does not build, Swift
    // builds and encodes wrongly. Saying "invalid Kotlin" on the Swift emit
    // would send someone looking for a build error that never comes.
    expect(warnsFor('', decl, 'kotlin')[0]).toContain('INVALID Kotlin')
    expect(warnsFor('', decl, 'swift')[0]).toContain('COMPILES')
    expect(warnsFor('', decl, 'swift')[0]).toContain('Codable')
  })

  // Shapes that lower CORRECTLY must stay silent. A warning that fires on
  // working code is worse than none — it trains people to ignore it.
  it.each([
    ['a type argument on the call', TYPES, `const g = signal<Graph>({ nodes: [{ id: 'a' }], edges: [] })`],
    ['an annotation on the binding', TYPES, `const g: Graph = { nodes: [{ id: 'a' }], edges: [] }`],
    ['an array seeded with one element', '', `const g = signal({ nodes: [{ id: 'a' }], edges: [{ from: 'a', to: 'b' }] })`],
    ['no array field at all', '', `const g = signal({ nodes: 1, edges: 2 })`],
    ['a heterogeneous object array', '', `const g = signal({ id: 'a', xs: [{ p: 1 }, { q: 2 }] })`],
    ['a ternary field', '', `const g = signal({ id: 'a', n: 1 > 0 ? 1 : 2 })`],
    ['three levels of nesting', '', `const g = signal({ a: { b: { c: 1 } }, n: 1 })`],
    ['negative and float fields', '', `const g = signal({ id: 'a', n: -1, m: 1.5, ok: true })`],
  ])('stays silent with %s', (_label, pre, decl) => {
    expect(warnsFor(pre, decl)).toEqual([])
  })

  it('the annotated form really does lower to a struct, not a tuple', () => {
    // The remedy is asserted, not asserted-about: if this ever stops being
    // true, the warning is telling people to do something that does not work.
    const kt = transform(
      mk(TYPES, `const g = signal<Graph>({ nodes: [{ id: 'a' }], edges: [] })`),
      { target: 'kotlin' },
    ).code
    expect(kt).toContain('Graph(nodes = listOf(Node(id = "a")), edges = listOf())')
    // The tuple emit is a bare `(` where the constructor name should be. Note
    // the struct form CONTAINS the tuple text as a substring, so this has to
    // anchor on what precedes it, not on the tuple body.
    expect(kt).not.toContain('mutableStateOf((')
  })
})
