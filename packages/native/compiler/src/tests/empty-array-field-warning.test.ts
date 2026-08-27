import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/**
 * An UN-ANNOTATED object literal with an empty array field is the one shape in
 * the struct-synthesis path where both targets emit something structurally
 * wrong rather than degrading to a warning — and they fail DIFFERENTLY, which
 * is what kept it hidden:
 *
 *   Kotlin  `(nodes = listOf(...), edges = listOf())` — named arguments with no
 *           constructor. Not valid Kotlin; the Gradle build dies on it.
 *   Swift   `(nodes: [...], edges: [])` typed `Any` — a labelled tuple, which
 *           COMPILES. Tuples are not `Codable`, so `PyreonJSON.encode` and a
 *           `<WebView data=>` push silently produce the wrong bytes.
 *
 * Found while putting the real `@pyreon/flow` webview host page through the
 * compiler: `{ nodes: [...], edges: [] }` is a flow graph with no edges yet,
 * i.e. the documented crossing shape of a package the coverage registry lists
 * as crossing. Nothing in the repo's 567 `.tsx` files has this shape, which is
 * why no gate saw it.
 */
const mk = (pre: string, decl: string): string => `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
${pre}
export function C() {
  ${decl}
  return <Stack><Text>{String(g().nodes.length)}</Text></Stack>
}
`

const TYPES = `type Node = { id: string }
type Edge = { from: string; to: string }
type Graph = { nodes: Node[]; edges: Edge[] }`

const warnsFor = (pre: string, decl: string, target: 'swift' | 'kotlin' = 'kotlin'): string[] =>
  (transform(mk(pre, decl), { target }).warnings ?? []).filter((w) =>
    w.includes('empty array field'),
  )

describe('un-annotated object literal with an empty array field', () => {
  it('warns, names the field, and gives the remedy that actually works', () => {
    const [warning] = warnsFor('', `const g = signal({ nodes: [{ id: 'a' }], edges: [] })`)
    expect(warning, 'the broken shape must warn').toBeDefined()
    expect(warning).toContain('`edges: []`') // names the offending field
    expect(warning).toContain('signal<Graph>') // and the verified fix
  })

  it('warns identically on both targets — the shape is broken on both', () => {
    const decl = `const g = signal({ nodes: [{ id: 'a' }], edges: [] })`
    expect(warnsFor('', decl, 'swift')).toEqual(warnsFor('', decl, 'kotlin'))
  })

  // The four shapes that lower CORRECTLY today must stay silent. A warning that
  // fires on working code is worse than none — it trains people to ignore it.
  it.each([
    ['a type argument on the call', TYPES, `const g = signal<Graph>({ nodes: [{ id: 'a' }], edges: [] })`],
    ['an annotation on the binding', TYPES, `const g: Graph = { nodes: [{ id: 'a' }], edges: [] }`],
    ['an array seeded with one element', '', `const g = signal({ nodes: [{ id: 'a' }], edges: [{ from: 'a', to: 'b' }] })`],
    ['no array field at all', '', `const g = signal({ nodes: 1, edges: 2 })`],
  ])('stays silent with %s', (_label, pre, decl) => {
    expect(warnsFor(pre, decl)).toEqual([])
  })

  it('stays silent for a lone empty array — that synthesizes nothing either way', () => {
    // `{ items: [] }` is usually a props bag, not a data shape, and it does not
    // reach the broken tuple emit. Warning on it would be noise.
    expect(warnsFor('', `const g = signal({ nodes: [] })`)).toEqual([])
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
