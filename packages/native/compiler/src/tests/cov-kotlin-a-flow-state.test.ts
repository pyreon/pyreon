// Coverage: the Kotlin `createFlow` rewrites — `kotlinFlowNodeLiteral` /
// `kotlinFlowEdgeLiteral` / `kotlinFlowPositionLiteral` and the member
// dispatch that calls them (emit-kotlin.ts ~3230-3300 + ~4602-4660).
//
// The rewrites exist because Kotlin's type system is NOMINAL: a bare object
// literal would synthesize its own `__ObjN` data class with the same field
// names and a different type, which does not satisfy the declared
// `PyreonFlowNode` parameter. So the assertions are on the CONSTRUCTOR
// names and the argument labels, and every field the native type does not
// carry has to be NAMED as dropped rather than silently discarded.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const FLOW = (body: string) => `
import { createFlow } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
    edges: [{ id: 'e1', source: '1', target: '1' }],
  })
  return (
    <Stack>
      <Text>{flow.nodes().length}</Text>
${body}
    </Stack>
  )
}`

const kt = (body: string) => transform(FLOW(body), { target: 'kotlin' })

describe('Kotlin createFlow: property reads drop their parens', () => {
  it('nodes/edges/viewport/zoom become `val` reads; selectedNodes stays a METHOD', () => {
    const out = kt(`      <Text>{flow.edges().length}</Text>
      <Text>{flow.zoom()}</Text>
      <Text>{flow.viewport().x}</Text>
      <Text>{flow.selectedNodes().length}</Text>`).code
    expect(out).toContain('flow.edges.length')
    expect(out).toContain('${flow.zoom}')
    expect(out).toContain('flow.viewport.x')
    // deliberately NOT rewritten — the Kotlin port names it a method too
    expect(out).toContain('flow.selectedNodes()')
  })
})

describe('Kotlin createFlow: addNode / addEdge / updateNodePosition literals', () => {
  it('a full node literal becomes PyreonFlowNode with a PyreonXYPosition and Double coords', () => {
    const out = kt(
      `      <Button onPress={() => flow.addNode({ id: '3', type: 'output', position: { x: 100, y: 200 }, data: { label: 'New' }, width: 10, height: 20 })}>Add</Button>`,
    ).code
    expect(out).toContain(
      'flow.addNode(PyreonFlowNode(id = "3", type = "output", position = PyreonXYPosition(100.0, 200.0), data = __Obj0(label = "New"), width = 10.0, height = 20.0))',
    )
  })

  it('the OPTIONAL node fields are omitted when absent rather than passed as null', () => {
    const out = kt(
      `      <Button onPress={() => flow.addNode({ id: '3', position: { x: 1, y: 2 }, data: { label: 'N' } })}>Add</Button>`,
    ).code
    expect(out).toContain('flow.addNode(PyreonFlowNode(id = "3", position = PyreonXYPosition(1.0, 2.0), data = __Obj0(label = "N")))')
    expect(out).not.toContain('type = null')
  })

  it('a full edge literal becomes PyreonFlowEdge; absent optionals are omitted', () => {
    const full = kt(
      `      <Button onPress={() => flow.addEdge({ id: 'e2', source: '1', target: '1', type: 'step', label: 'x', animated: true })}>E</Button>`,
    ).code
    expect(full).toContain(
      'flow.addEdge(PyreonFlowEdge(id = "e2", source = "1", target = "1", type = "step", label = "x", animated = true))',
    )
    const min = kt(
      `      <Button onPress={() => flow.addEdge({ id: 'e2', source: '1', target: '1' })}>E</Button>`,
    ).code
    expect(min).toContain('flow.addEdge(PyreonFlowEdge(id = "e2", source = "1", target = "1"))')
  })

  it('updateNodePosition rewrites only its SECOND argument', () => {
    expect(
      kt(`      <Button onPress={() => flow.updateNodePosition('1', { x: 5, y: 6 })}>M</Button>`).code,
    ).toContain('flow.updateNodePosition("1", PyreonXYPosition(5.0, 6.0))')
  })

  it('a literal MISSING a required field falls through to the generic emit (no half-built node)', () => {
    // no `position` → kotlinFlowNodeLiteral returns null
    const out = kt(`      <Button onPress={() => flow.addNode({ id: '3', data: { label: 'N' } })}>Add</Button>`).code
    expect(out).not.toContain('PyreonFlowNode(id = "3"')
    // no `target` → kotlinFlowEdgeLiteral returns null
    const e = kt(`      <Button onPress={() => flow.addEdge({ id: 'e2', source: '1' })}>E</Button>`).code
    expect(e).not.toContain('PyreonFlowEdge(id = "e2"')
  })

  it('a NON-literal argument is left to the generic emit (it already holds a native value)', () => {
    const out = kt(
      `      <Button onPress={() => flow.updateNodePosition('1', flow.viewport())}>M</Button>`,
    ).code
    expect(out).toContain('flow.updateNodePosition("1", flow.viewport)')
    expect(out).not.toContain('PyreonXYPosition(flow')
  })
})

describe('Kotlin createFlow: nothing silent inside the boundary', () => {
  it('a field the native node/edge does not carry is NAMED as dropped', () => {
    const n = kt(
      `      <Button onPress={() => flow.addNode({ id: '3', position: { x: 1, y: 2 }, data: { label: 'N' }, bogus: 1 })}>Add</Button>`,
    )
    expect(n.warnings.join('\n')).toContain('node field `bogus`')
    const e = kt(
      `      <Button onPress={() => flow.addEdge({ id: 'e2', source: '1', target: '1', zzz: 2 })}>E</Button>`,
    )
    expect(e.warnings.join('\n')).toContain('edge field `zzz`')
  })

  it('an UNPORTED member is named, and the now-ported fitView lowers without a warning', () => {
    expect(kt(`      <Button onPress={() => flow.wat()}>W</Button>`).warnings.join('\n')).toContain(
      '`wat` is NOT ported',
    )
    const fit = kt(`      <Button onPress={() => flow.fitView()}>F</Button>`)
    expect(fit.warnings).toEqual([])
    expect(fit.code).toContain('flow.fitView()')
  })

  it('a WRITE to a flow collection lowers to its native setter, with no warning', () => {
    const r = kt(`      <Button onPress={() => flow.nodes.set([])}>W</Button>`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('flow.setNodes(listOf())')
  })
})

describe('Kotlin createFlow: a node `data` literal with no nameable shape', () => {
  it('degrades the row generic to `Any` and NAMES the empty-literal problem', () => {
    const r = transform(
      `import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }], edges: [] })
  return (<Stack><Text>{flow.nodes().length}</Text></Stack>)
}`,
      { target: 'kotlin' },
    )
    // no struct can be synthesized from `{}`, so the generic widens
    expect(r.code).toContain('PyreonFlowState<Any>')
    // and the empty literal itself is reported rather than silently emitted
    expect(r.warnings.join('\n')).toContain('EMPTY object literal')
  })
})
