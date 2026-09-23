// Two silent drops in native Flow renderers, found by the full flow analysis.
//
// 1. A custom node typed with an INLINE data shape,
//    `NodeComponentProps<{ label: string }>`, compiled on neither target and
//    warned on neither: Swift typed `data()` as `String`, Kotlin synthesized a
//    `<Component>Data` class, and the flow's node literal became a third,
//    unrelated struct. One declared struct per inline shape now serves both.
// 2. `<NodeResizer nodeId>` pointing at a node other than the host resized a
//    different node on the web and the host natively, with no warning.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const INLINE = `
  import { createFlow, Flow, type NodeComponentProps } from '@pyreon/flow'
  import { Text } from '@pyreon/primitives'
  function CardNode(props: NodeComponentProps<{ label: string; meta: { owner: string } }>) {
    return <Text>{props.data().label + props.data().meta.owner}</Text>
  }
  export function Diagram() {
    const flow = createFlow({ nodes: [{ id: 'a', type: 'card', position: { x: 0, y: 0 }, data: { label: 'A', meta: { owner: 'o' } } }], edges: [] })
    return <Flow instance={flow} nodeTypes={{ card: CardNode }} />
  }
`

describe('an inline NodeComponentProps data shape', () => {
  it('swift: the renderer and the flow share one declared struct, and it compiles', () => {
    const result = transform(INLINE, { target: 'swift' })
    expect(result.warnings).toEqual([])
    expect(result.code).toContain('let data: () -> CardNodeData')
    expect(result.code).toContain('PyreonFlowState<CardNodeData>(')
    expect(result.code).toContain('struct CardNodeDataMeta: Codable')
    if (isSwiftcAvailable()) {
      const v = validateSwiftWithStubs(result.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
  })

  it('kotlin: the renderer and the flow share one declared class, and it compiles', () => {
    const result = transform(INLINE, { target: 'kotlin' })
    expect(result.warnings).toEqual([])
    expect(result.code).toContain('data: () -> CardNodeData')
    expect(result.code).toContain('PyreonFlowState<CardNodeData>(')
    if (isKotlincAvailable()) {
      const v = validateKotlin(result.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
  })

  it('two renderers with the same inline shape share the struct rather than declaring two', () => {
    const src = INLINE.replace(
      'export function Diagram',
      'function OtherNode(props: NodeComponentProps<{ label: string; meta: { owner: string } }>) { return <Text>{props.data().label}</Text> }\n  export function Diagram',
    ).replace('nodeTypes={{ card: CardNode }}', 'nodeTypes={{ card: CardNode, other: OtherNode }}')
    const code = transform(src, { target: 'swift' }).code
    expect(code.match(/struct CardNodeData: Codable/g)).toHaveLength(1)
    expect(code).not.toContain('OtherNodeData')
    expect(code).toContain('struct OtherNode: View {\n  let id: String\n  let data: () -> CardNodeData')
  })

  it('a name the file already declares is not reused', () => {
    const src = INLINE.replace('import { Text }', 'interface CardNodeData { unrelated: number }\n  import { Text }')
    const code = transform(src, { target: 'swift' }).code
    expect(code).toContain('let data: () -> CardNodeData2')
  })
})

describe('<NodeResizer nodeId>', () => {
  const app = (nodeId: string) => `
    import { createFlow, Flow, NodeResizer, type NodeComponentProps } from '@pyreon/flow'
    import { Stack, Text } from '@pyreon/primitives'
    interface D { label: string }
    function N(props: NodeComponentProps<D>) { return <Stack><NodeResizer${nodeId} /><Text>{props.data().label}</Text></Stack> }
    export function App() {
      const flow = createFlow<D>({ nodes: [{ id: 'a', type: 'n', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
      return <Flow instance={flow} nodeTypes={{ n: N }} />
    }`
  const warns = (src: string, target: 'swift' | 'kotlin') => transform(src, { target }).warnings.some((w) => w.includes('<NodeResizer nodeId> names a node other than its host'))

  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: the host's own id (or no nodeId) lowers without a warning`, () => {
      expect(warns(app(''), target)).toBe(false)
      expect(warns(app(' nodeId={props.id}'), target)).toBe(false)
    })
    it(`${target}: another node's id is reported, not silently re-targeted to the host`, () => {
      expect(warns(app(' nodeId="b"'), target)).toBe(true)
    })
  }
})
