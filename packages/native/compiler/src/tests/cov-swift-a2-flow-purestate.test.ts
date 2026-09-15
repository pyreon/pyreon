// Branch matrices for two Swift member-call families whose whole point is
// that the WEB spelling and the NATIVE spelling disagree:
//
//   * `createFlow(...)`'s member surface — the ported methods take LABELLED
//     Swift parameters the positional web call does not write, the literal
//     arguments must be rebuilt as `PyreonFlowNode`/`PyreonFlowEdge`/
//     `PyreonXYPosition`, and anything unported must be NAMED rather than
//     silently emitted (it fails at the native build, far from the cause).
//   * `useToggle` / `useCounter` — the state field IS the value, so a read
//     drops its parens and each mutator becomes the arithmetic it stands
//     for, with the literal clamp baked in.
//
// Each literal rebuild is paired with the shape that must NOT rebuild (a
// missing required field, a non-literal argument): those fall through to the
// generic emit, which is correct for an identifier already holding a
// `PyreonFlowNode` and is the reason the recognizers return null instead of
// warning.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const FLOW = (body: string) => `import { createFlow } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [],
  })
  const held = { id: 'z', position: { x: 1, y: 1 }, data: { label: 'Z' } }
  const run = () => {
${body}
  }
  return (
    <Stack>
      <Button onPress={run}>go</Button>
      <Text>{() => String(flow.nodes().length)}</Text>
    </Stack>
  )
}`

function flow(body: string): { code: string; warnings: string[] } {
  const r = transform(FLOW(body), { target: 'swift' })
  return { code: r.code, warnings: [...r.warnings] }
}

describe('createFlow member calls — labelled parameters', () => {
  it('selectNode/selectEdge label their SECOND argument, and do not when called with one', () => {
    // The web call is positional; the port's second parameter is labelled,
    // so an unlabelled emit fails ONLY on iOS.
    const { code } = flow(`    flow.selectNode('1', true)
    flow.selectNode('1')
    flow.selectEdge('e1', false)
    flow.selectEdge('e1')`)
    expect(code).toContain('flow.selectNode("1", additive: true)')
    expect(code).toContain('flow.selectEdge("e1", additive: false)')
    expect(code).toContain('flow.selectNode("1")\n')
    expect(code).toContain('flow.selectEdge("e1")\n')
  })

  it('fitView: zero args, a nil first arg, one arg, and a labelled padding are four distinct emits', () => {
    const { code } = flow(`    flow.fitView()
    flow.fitView(undefined)
    flow.fitView(null)
    flow.fitView(['1'])
    flow.fitView(['1'], 20)`)
    expect(code).toContain('flow.fitView()\n')
    // `undefined` and `null` both become the Swift nil — an emitted
    // `undefined` identifier would not resolve.
    expect(code.match(/flow\.fitView\(nil\)/g)).toHaveLength(2)
    expect(code).toContain('flow.fitView(["1"])')
    expect(code).toContain('flow.fitView(["1"], padding: 20)')
  })

  it('fitView lowers without a warning now that native viewport framing is ported', () => {
    const { warnings } = flow(`    flow.fitView()`)
    expect(warnings.some((w) => w.includes('fitView'))).toBe(false)
  })
})

describe('createFlow addNode/addEdge/updateNodePosition — literal rebuild vs fall-through', () => {
  it('a COMPLETE node literal rebuilds as PyreonFlowNode, optional fields included only when present', () => {
    const { code } = flow(`    flow.addNode({ id: '2', position: { x: 1, y: 2 }, data: { label: 'B' }, type: 'x', width: 10, height: 20 })
    flow.addNode({ id: '3', position: { x: 1, y: 2 }, data: { label: 'C' } })`)
    expect(code).toContain(
      'flow.addNode(PyreonFlowNode(id: "2", type: "x", position: PyreonXYPosition(x: 1, y: 2), data: __Obj0(label: "B"), width: 10, height: 20))',
    )
    // type/width/height absent → those `...(expr ? [..] : [])` arms emit nothing
    expect(code).toContain(
      'flow.addNode(PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 1, y: 2), data: __Obj0(label: "C")))',
    )
  })

  it('a node literal MISSING a required field, or a non-literal argument, falls through to the generic emit', () => {
    const { code } = flow(`    flow.addNode({ id: '4', data: { label: 'D' } })
    flow.addNode({ id: '5', position: { x: 1 }, data: { label: 'E' } })
    flow.addNode(held)`)
    // no `position` at all / a `position` with no `y` / an identifier —
    // each returns null from the recognizer, never a warning
    expect(code).not.toContain('flow.addNode(PyreonFlowNode(id: "4"')
    expect(code).not.toContain('flow.addNode(PyreonFlowNode(id: "5"')
    expect(code).toMatch(/flow\.addNode\(__Obj\d+\(id: "4"/)
    expect(code).toMatch(/flow\.addNode\(__Obj\d+\(id: "5"/)
    expect(code).toMatch(/flow\.addNode\(\(?__Obj\d+\(id: "z"/)
  })

  it('a node literal field the native type does not carry is DROPPED and NAMED', () => {
    const { warnings } = flow(
      `    flow.addNode({ id: '3', position: { x: 1, y: 2 }, data: { label: 'C' }, bogus: 1 })`,
    )
    expect(
      warnings.some((w) => w.includes('node field `bogus` is NOT carried by the native PyreonFlowNode')),
    ).toBe(true)
  })

  it('a COMPLETE edge literal rebuilds as PyreonFlowEdge; a partial one and an identifier do not', () => {
    const { code } = flow(`    flow.addEdge({ id: 'e2', source: '1', target: '2', type: 'smooth', label: 'L', animated: true })
    flow.addEdge({ id: 'e4', source: '1', target: '2' })
    flow.addEdge({ id: 'e3', source: '1' })
    flow.addEdge(held)`)
    expect(code).toContain(
      'flow.addEdge(PyreonFlowEdge(id: "e2", source: "1", target: "2", type: "smooth", label: "L", animated: true, animatedSpecified: true))',
    )
    // type/label/animated absent → the three optional arms emit nothing
    expect(code).toContain('flow.addEdge(PyreonFlowEdge(id: "e4", source: "1", target: "2"))')
    // no `target` → recognizer bails
    expect(code).toMatch(/flow\.addEdge\(__Obj\d+\(id: "e3"/)
    expect(code).toMatch(/flow\.addEdge\(\(?__Obj\d+\(id: "z"/)
  })

  it('updateNodePosition rebuilds a {x,y} literal and falls through for anything else', () => {
    const { code } = flow(`    flow.updateNodePosition('1', { x: 5, y: 6 })
    flow.updateNodePosition('1', { x: 5 })
    flow.updateNodePosition('1', held)`)
    expect(code).toContain('flow.updateNodePosition("1", PyreonXYPosition(x: 5, y: 6))')
    expect(code).toMatch(/flow\.updateNodePosition\("1", __Obj\d+\(x: 5\)\)/)
    expect(code).toMatch(/flow\.updateNodePosition\("1", \(?__Obj\d+\(id: "z"/)
  })
})

describe('createFlow reads and writes', () => {
  it('the four ported PROPERTY reads drop their parens', () => {
    const { code } = flow(`    flow.selectAll()`)
    const out = transform(
      FLOW(`    flow.selectAll()`).replace(
        'String(flow.nodes().length)',
        'String(flow.nodes().length) + String(flow.edges().length) + String(flow.zoom()) + String(flow.viewport().x)',
      ),
      { target: 'swift' },
    ).code
    expect(out).toContain('flow.nodes.count')
    expect(out).toContain('flow.edges.count')
    expect(out).toContain('String(flow.zoom)')
    expect(out).toContain('flow.viewport.x')
    expect(code).toContain('flow.selectAll()')
  })

  it('a signal WRITE on a flow collection lowers to its native setter, with no warning', () => {
    const { code, warnings } = flow(`    flow.nodes.set([])
    flow.edges.update((v) => v)`)
    expect(warnings).toEqual([])
    expect(code).toContain('flow.setNodes([])')
    expect(code).toContain('flow.setEdges({ v in v })')
  })

  it('an UNPORTED member is emitted as written AND named', () => {
    const { code, warnings } = flow(`    flow.unknownThing()`)
    expect(code).toContain('flow.unknownThing()')
    expect(
      warnings.some((w) => w.includes('`unknownThing` is NOT ported to the native PyreonFlowState')),
    ).toBe(true)
  })

  it('a PORTED method with no rewrite is NOT warned', () => {
    const { warnings } = flow(`    flow.zoomIn()
    flow.deleteSelected()`)
    expect(warnings.filter((w) => w.includes('is NOT ported'))).toEqual([])
  })
})

describe('useToggle / useCounter — the member surface lowers to plain field arithmetic', () => {
  const PURE = (body: string, opts: string) => `import { Stack, Text, Press } from '@pyreon/primitives'
import { useToggle, useCounter } from '@pyreon/hooks'
export function App() {
  const t = useToggle(false)
  const c = useCounter(1, ${opts})
  const run = () => { ${body} }
  return (<Stack><Press onPress={run}><Text>{t.value() ? 'on' : String(c.count())}</Text></Press></Stack>)
}`
  const pure = (body: string, opts = '{ min: 0, max: 10 }') =>
    transform(PURE(body, opts), { target: 'swift' }).code

  it('useToggle: the read is the field; each mutator is its assignment', () => {
    const out = pure(`t.toggle(); t.setTrue(); t.setFalse()`)
    expect(out).toContain('t.toggle()')
    expect(out).toContain('t = true')
    expect(out).toContain('t = false')
    // the READ drops its parens — `t.value()` would be "cannot call a Bool"
    expect(out).toContain('t ? "on"')
  })

  it('useCounter: inc/dec default to 1, set/reset use their own operands, and the clamp is baked in', () => {
    const out = pure(`c.inc(); c.inc(2); c.dec(); c.dec(3); c.set(5); c.reset()`)
    expect(out).toContain('c = min(max(c + 1, 0), 10)')
    expect(out).toContain('c = min(max(c + 2, 0), 10)')
    expect(out).toContain('c = min(max(c - 1, 0), 10)')
    expect(out).toContain('c = min(max(c - 3, 0), 10)')
    expect(out).toContain('c = min(max(5, 0), 10)')
    // reset goes to the hook's INITIAL value, not zero
    expect(out).toContain('c = min(max(1, 0), 10)')
    expect(out).toContain('String(c)')
  })

  it('with NO bounds the clamp disappears — it is emitted, not held in a runtime', () => {
    const out = pure(`c.inc(2); c.set(5); c.reset()`, '{}')
    expect(out).toContain('c = c + 2')
    expect(out).toContain('c = 5')
    expect(out).toContain('c = 1')
    expect(out).not.toContain('min(max(')
  })
})
