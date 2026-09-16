/**
 * Shared Flow parity fixture — F2's machine-checked "same results on web,
 * iOS and Android".
 *
 * The scenarios below are DATA: a seed graph, a sequence of deterministic
 * engine operations, and the queries to read afterwards. The web engine is
 * the ORACLE: `expectationsOf` runs a scenario through `createFlow` and
 * records what it observed. `renderSwift` / `renderKotlin` then emit those
 * observations as literal assertions into the native behaviour fixtures
 * (marker-delimited regions in `native/tests/PyreonFlowStateTests.swift` and
 * `native/tests/PyreonFlowStateTest.kt`), which the co-source gate compiles
 * and RUNS. `native-parity.test.ts` locks both regions byte-for-byte against
 * this generator, so a scenario, an oracle result or an emit shape cannot
 * drift silently; `PYREON_WRITE_FLOW_PARITY=1` rewrites the regions.
 *
 * Deliberately excluded: anything reading the container size (`fitView`,
 * `setCenter`) — it is a host measurement on every target — and every
 * callback / animation / layout operation, which the hand-written fixtures
 * cover under their own semantics.
 */
import { createFlow } from '../flow'

export type ParityOp =
  | { op: 'addNode'; id: string; x: number; y: number }
  | { op: 'removeNode'; id: string }
  | { op: 'updateNodePosition'; id: string; x: number; y: number }
  | { op: 'addEdge'; id: string; source: string; target: string }
  | { op: 'removeEdge'; id: string }
  | { op: 'selectNode'; id: string; additive: boolean }
  | { op: 'selectNodes'; ids: string[]; additive: boolean }
  | { op: 'deselectNode'; id: string }
  | { op: 'selectEdge'; id: string; additive: boolean }
  | { op: 'clearSelection' }
  | { op: 'selectAll' }
  | { op: 'deleteSelected' }
  | { op: 'zoomTo'; zoom: number }
  | { op: 'zoomIn' }
  | { op: 'zoomOut' }
  | { op: 'panTo'; x: number; y: number }
  | { op: 'setViewport'; x: number; y: number; zoom: number }
  | { op: 'moveSelectedNodes'; dx: number; dy: number }
  | { op: 'reconnectEdge'; id: string; source?: string; target?: string }
  | { op: 'pushHistory' }
  | { op: 'undo' }
  | { op: 'redo' }
  | { op: 'setNodeExtent'; minX: number; minY: number; maxX: number; maxY: number }

export type ParityQuery =
  | { q: 'isValidConnection'; source: string; target: string }
  | { q: 'connectedEdges'; id: string }
  | { q: 'incomers'; id: string }
  | { q: 'outgoers'; id: string }
  | { q: 'screenToFlow'; x: number; y: number }
  | { q: 'clampToExtent'; x: number; y: number }

export interface ParityScenario {
  name: string
  nodes: { id: string; x: number; y: number }[]
  edges: { id: string; source: string; target: string }[]
  ops: ParityOp[]
  queries: ParityQuery[]
}

export interface ParityExpectation {
  nodes: { id: string; x: number; y: number }[]
  edges: { id: string; source: string; target: string }[]
  selectedNodes: string[]
  selectedEdges: string[]
  viewport: { x: number; y: number; zoom: number }
  answers: (boolean | string[] | { x: number; y: number })[]
}

const grid = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i + 1), x: i * 200, y: (i % 2) * 120 }))
const chain = (n: number) => Array.from({ length: n - 1 }, (_, i) => ({ id: `e${i + 1}`, source: String(i + 1), target: String(i + 2) }))

export const PARITY_SCENARIOS: readonly ParityScenario[] = [
  {
    name: 'node CRUD keeps order, positions and the edges that survive',
    nodes: grid(3),
    edges: chain(3),
    ops: [
      { op: 'addNode', id: '4', x: 50, y: 500 },
      { op: 'updateNodePosition', id: '2', x: 210.5, y: -30 },
      { op: 'addEdge', id: 'e3', source: '3', target: '4' },
      { op: 'removeNode', id: '1' },
    ],
    queries: [{ q: 'connectedEdges', id: '3' }, { q: 'incomers', id: '3' }, { q: 'outgoers', id: '3' }, { q: 'connectedEdges', id: '1' }],
  },
  {
    name: 'edge CRUD and reconnect',
    nodes: grid(4),
    edges: chain(4),
    ops: [
      { op: 'reconnectEdge', id: 'e1', target: '4' },
      { op: 'removeEdge', id: 'e2' },
      { op: 'addEdge', id: 'e9', source: '4', target: '1' },
    ],
    queries: [{ q: 'incomers', id: '4' }, { q: 'outgoers', id: '4' }, { q: 'connectedEdges', id: '2' }],
  },
  {
    name: 'selection: single, additive, deselect, edges, select all, clear',
    nodes: grid(4),
    edges: chain(4),
    ops: [
      { op: 'selectNode', id: '1', additive: false },
      { op: 'selectNode', id: '2', additive: true },
      { op: 'selectNode', id: '3', additive: false },
      { op: 'selectNodes', ids: ['1', '4'], additive: true },
      { op: 'deselectNode', id: '1' },
      { op: 'selectEdge', id: 'e2', additive: true },
    ],
    queries: [],
  },
  {
    name: 'select all then clear leaves nothing selected',
    nodes: grid(3),
    edges: chain(3),
    ops: [{ op: 'selectAll' }, { op: 'clearSelection' }, { op: 'selectEdge', id: 'e1', additive: false }],
    queries: [],
  },
  {
    name: 'deleteSelected removes the selected nodes with their edges',
    nodes: grid(4),
    edges: chain(4),
    ops: [{ op: 'selectNodes', ids: ['2', '3'], additive: false }, { op: 'selectEdge', id: 'e3', additive: true }, { op: 'deleteSelected' }],
    queries: [{ q: 'connectedEdges', id: '1' }, { q: 'connectedEdges', id: '4' }],
  },
  {
    name: 'moveSelectedNodes shifts only the selection',
    nodes: grid(3),
    edges: [],
    ops: [{ op: 'selectNodes', ids: ['1', '3'], additive: false }, { op: 'moveSelectedNodes', dx: 7.5, dy: -12 }],
    queries: [],
  },
  {
    name: 'viewport: zoom steps, clamps, pan and set',
    nodes: grid(2),
    edges: [],
    ops: [{ op: 'zoomIn' }, { op: 'zoomIn' }, { op: 'zoomOut' }, { op: 'panTo', x: -40, y: 25 }, { op: 'zoomTo', zoom: 99 }, { op: 'zoomTo', zoom: 0.0001 }, { op: 'setViewport', x: 10, y: 20, zoom: 2 }],
    queries: [{ q: 'screenToFlow', x: 110, y: 220 }, { q: 'screenToFlow', x: 0, y: 0 }],
  },
  {
    name: 'connection validation: no self loops, no duplicates, missing nodes',
    nodes: grid(3),
    edges: chain(3),
    ops: [],
    queries: [
      { q: 'isValidConnection', source: '1', target: '3' },
      { q: 'isValidConnection', source: '1', target: '2' },
      { q: 'isValidConnection', source: '2', target: '2' },
      { q: 'isValidConnection', source: '1', target: 'ghost' },
    ],
  },
  {
    name: 'history: undo and redo across CRUD and moves',
    nodes: grid(2),
    edges: chain(2),
    ops: [
      { op: 'addNode', id: '3', x: 400, y: 0 },
      { op: 'updateNodePosition', id: '1', x: 5, y: 5 },
      { op: 'removeEdge', id: 'e1' },
      { op: 'undo' },
      { op: 'undo' },
      { op: 'redo' },
    ],
    queries: [{ q: 'connectedEdges', id: '1' }],
  },
  {
    name: 'node extent clamps a move and answers clampToExtent',
    nodes: grid(2),
    edges: [],
    ops: [{ op: 'setNodeExtent', minX: 0, minY: 0, maxX: 300, maxY: 300 }, { op: 'updateNodePosition', id: '1', x: -50, y: 900 }],
    queries: [{ q: 'clampToExtent', x: -10, y: 10 }, { q: 'clampToExtent', x: 250, y: 250 }],
  },
]

const num = (v: number) => (Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : v)

/** Run a scenario through the WEB engine and record what it observed. */
export function expectationsOf(s: ParityScenario): ParityExpectation {
  const flow = createFlow<{ label: string }>({
    nodes: s.nodes.map((n) => ({ id: n.id, position: { x: n.x, y: n.y }, data: { label: n.id } })),
    edges: s.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  })
  for (const o of s.ops) {
    switch (o.op) {
      case 'addNode': flow.addNode({ id: o.id, position: { x: o.x, y: o.y }, data: { label: o.id } }); break
      case 'removeNode': flow.removeNode(o.id); break
      case 'updateNodePosition': flow.updateNodePosition(o.id, { x: o.x, y: o.y }); break
      case 'addEdge': flow.addEdge({ id: o.id, source: o.source, target: o.target }); break
      case 'removeEdge': flow.removeEdge(o.id); break
      case 'selectNode': flow.selectNode(o.id, o.additive); break
      case 'selectNodes': flow.selectNodes(o.ids, o.additive); break
      case 'deselectNode': flow.deselectNode(o.id); break
      case 'selectEdge': flow.selectEdge(o.id, o.additive); break
      case 'clearSelection': flow.clearSelection(); break
      case 'selectAll': flow.selectAll(); break
      case 'deleteSelected': flow.deleteSelected(); break
      case 'zoomTo': flow.zoomTo(o.zoom); break
      case 'zoomIn': flow.zoomIn(); break
      case 'zoomOut': flow.zoomOut(); break
      case 'panTo': flow.panTo({ x: o.x, y: o.y }); break
      case 'setViewport': flow.setViewport({ x: o.x, y: o.y, zoom: o.zoom }); break
      case 'moveSelectedNodes': flow.moveSelectedNodes(o.dx, o.dy); break
      case 'reconnectEdge': flow.reconnectEdge(o.id, { ...(o.source !== undefined ? { source: o.source } : {}), ...(o.target !== undefined ? { target: o.target } : {}) }); break
      case 'pushHistory': flow.pushHistory(); break
      case 'undo': flow.undo(); break
      case 'redo': flow.redo(); break
      case 'setNodeExtent': flow.setNodeExtent([[o.minX, o.minY], [o.maxX, o.maxY]]); break
    }
  }
  const answers: ParityExpectation['answers'] = s.queries.map((q) => {
    switch (q.q) {
      case 'isValidConnection': return flow.isValidConnection({ source: q.source, target: q.target })
      case 'connectedEdges': return flow.getConnectedEdges(q.id).map((e) => e.id ?? '')
      case 'incomers': return flow.getIncomers(q.id).map((n) => n.id)
      case 'outgoers': return flow.getOutgoers(q.id).map((n) => n.id)
      case 'screenToFlow': { const p = flow.screenToFlowPosition({ x: q.x, y: q.y }); return { x: num(p.x), y: num(p.y) } }
      case 'clampToExtent': { const p = flow.clampToExtent({ x: q.x, y: q.y }); return { x: num(p.x), y: num(p.y) } }
    }
  })
  const vp = flow.getViewport()
  return {
    nodes: flow.getNodes().map((n) => ({ id: n.id, x: num(n.position.x), y: num(n.position.y) })),
    edges: flow.getEdges().map((e) => ({ id: e.id ?? '', source: e.source, target: e.target })),
    selectedNodes: [...flow.selectedNodes()].sort(),
    selectedEdges: [...flow.selectedEdges()].sort(),
    viewport: { x: num(vp.x), y: num(vp.y), zoom: num(vp.zoom) },
    answers,
  }
}

// ---- emitters ------------------------------------------------------------

const d = (v: number): string => {
  const s = String(v)
  return s.includes('.') || s.includes('e') ? s : s + '.0'
}
const str = (s: string) => JSON.stringify(s)
// Kotlin lists are always explicitly typed: an EMPTY `listOf()` cannot infer T.
const strList = (xs: string[], lang: 'swift' | 'kotlin') => (lang === 'swift' ? `[${xs.map(str).join(', ')}]` : `listOf<String>(${xs.map(str).join(', ')})`)

export const SWIFT_MARKERS = ['    // <flow-parity:start> GENERATED by src/tests/native-parity-fixture.ts — do not edit; PYREON_WRITE_FLOW_PARITY=1 bun run test', '    // <flow-parity:end>'] as const
export const KOTLIN_MARKERS = ['// <flow-parity:start> GENERATED by src/tests/native-parity-fixture.ts — do not edit; PYREON_WRITE_FLOW_PARITY=1 bun run test', '// <flow-parity:end>'] as const

function opSwift(o: ParityOp): string {
  switch (o.op) {
    case 'addNode': return `f.addNode(PyreonFlowNode(id: ${str(o.id)}, position: PyreonXYPosition(x: ${d(o.x)}, y: ${d(o.y)}), data: NodeData(label: ${str(o.id)})))`
    case 'removeNode': return `f.removeNode(${str(o.id)})`
    case 'updateNodePosition': return `f.updateNodePosition(${str(o.id)}, PyreonXYPosition(x: ${d(o.x)}, y: ${d(o.y)}))`
    case 'addEdge': return `f.addEdge(PyreonFlowEdge(id: ${str(o.id)}, source: ${str(o.source)}, target: ${str(o.target)}))`
    case 'removeEdge': return `f.removeEdge(${str(o.id)})`
    case 'selectNode': return `f.selectNode(${str(o.id)}, additive: ${o.additive})`
    case 'selectNodes': return `f.selectNodes(${strList(o.ids, 'swift')}, additive: ${o.additive})`
    case 'deselectNode': return `f.deselectNode(${str(o.id)})`
    case 'selectEdge': return `f.selectEdge(${str(o.id)}, additive: ${o.additive})`
    case 'clearSelection': return 'f.clearSelection()'
    case 'selectAll': return 'f.selectAll()'
    case 'deleteSelected': return 'f.deleteSelected()'
    case 'zoomTo': return `f.zoomTo(${d(o.zoom)})`
    case 'zoomIn': return 'f.zoomIn()'
    case 'zoomOut': return 'f.zoomOut()'
    case 'panTo': return `f.panTo(PyreonXYPosition(x: ${d(o.x)}, y: ${d(o.y)}))`
    case 'setViewport': return `f.setViewport(PyreonFlowViewport(x: ${d(o.x)}, y: ${d(o.y)}, zoom: ${d(o.zoom)}))`
    case 'moveSelectedNodes': return `f.moveSelectedNodes(${d(o.dx)}, ${d(o.dy)})`
    case 'reconnectEdge': return `f.reconnectEdge(${str(o.id)}${o.source !== undefined ? `, source: ${str(o.source)}` : ''}${o.target !== undefined ? `, target: ${str(o.target)}` : ''})`
    case 'pushHistory': return 'f.pushHistory()'
    case 'undo': return 'f.undo()'
    case 'redo': return 'f.redo()'
    case 'setNodeExtent': return `f.setNodeExtent(minX: ${d(o.minX)}, minY: ${d(o.minY)}, maxX: ${d(o.maxX)}, maxY: ${d(o.maxY)})`
  }
}

function opKotlin(o: ParityOp): string {
  switch (o.op) {
    case 'addNode': return `f.addNode(PyreonFlowNode(${str(o.id)}, position = PyreonXYPosition(${d(o.x)}, ${d(o.y)}), data = NodeData(${str(o.id)})))`
    case 'removeNode': return `f.removeNode(${str(o.id)})`
    case 'updateNodePosition': return `f.updateNodePosition(${str(o.id)}, PyreonXYPosition(${d(o.x)}, ${d(o.y)}))`
    case 'addEdge': return `f.addEdge(PyreonFlowEdge(${str(o.id)}, source = ${str(o.source)}, target = ${str(o.target)}))`
    case 'removeEdge': return `f.removeEdge(${str(o.id)})`
    case 'selectNode': return `f.selectNode(${str(o.id)}, additive = ${o.additive})`
    case 'selectNodes': return `f.selectNodes(${strList(o.ids, 'kotlin')}, additive = ${o.additive})`
    case 'deselectNode': return `f.deselectNode(${str(o.id)})`
    case 'selectEdge': return `f.selectEdge(${str(o.id)}, additive = ${o.additive})`
    case 'clearSelection': return 'f.clearSelection()'
    case 'selectAll': return 'f.selectAll()'
    case 'deleteSelected': return 'f.deleteSelected()'
    case 'zoomTo': return `f.zoomTo(${d(o.zoom)})`
    case 'zoomIn': return 'f.zoomIn()'
    case 'zoomOut': return 'f.zoomOut()'
    case 'panTo': return `f.panTo(PyreonXYPosition(${d(o.x)}, ${d(o.y)}))`
    case 'setViewport': return `f.setViewport(PyreonFlowViewport(${d(o.x)}, ${d(o.y)}, ${d(o.zoom)}))`
    case 'moveSelectedNodes': return `f.moveSelectedNodes(${d(o.dx)}, ${d(o.dy)})`
    case 'reconnectEdge': return `f.reconnectEdge(${str(o.id)}${o.source !== undefined ? `, source = ${str(o.source)}` : ''}${o.target !== undefined ? `, target = ${str(o.target)}` : ''})`
    case 'pushHistory': return 'f.pushHistory()'
    case 'undo': return 'f.undo()'
    case 'redo': return 'f.redo()'
    case 'setNodeExtent': return `f.setNodeExtent(minX = ${d(o.minX)}, minY = ${d(o.minY)}, maxX = ${d(o.maxX)}, maxY = ${d(o.maxY)})`
  }
}

function answerSwift(q: ParityQuery, a: ParityExpectation['answers'][number], label: string): string {
  switch (q.q) {
    case 'isValidConnection': return `check(f.isValidConnection(PyreonFlowConnection(source: ${str(q.source)}, target: ${str(q.target)})) == ${String(a)}, ${str(label)})`
    case 'connectedEdges': return `check(f.getConnectedEdges(${str(q.id)}).map { $0.id } == ${strList(a as string[], 'swift')}, ${str(label)})`
    case 'incomers': return `check(f.getIncomers(${str(q.id)}).map { $0.id } == ${strList(a as string[], 'swift')}, ${str(label)})`
    case 'outgoers': return `check(f.getOutgoers(${str(q.id)}).map { $0.id } == ${strList(a as string[], 'swift')}, ${str(label)})`
    case 'screenToFlow': { const p = a as { x: number; y: number }; return `check(parityNear(f.screenToFlowPosition(PyreonXYPosition(x: ${d(q.x)}, y: ${d(q.y)})), ${d(p.x)}, ${d(p.y)}), ${str(label)})` }
    case 'clampToExtent': { const p = a as { x: number; y: number }; return `check(parityNear(f.clampToExtent(PyreonXYPosition(x: ${d(q.x)}, y: ${d(q.y)})), ${d(p.x)}, ${d(p.y)}), ${str(label)})` }
  }
}

function answerKotlin(q: ParityQuery, a: ParityExpectation['answers'][number], label: string): string {
  switch (q.q) {
    case 'isValidConnection': return `check(f.isValidConnection(PyreonFlowConnection(source = ${str(q.source)}, target = ${str(q.target)})) == ${String(a)}, ${str(label)})`
    case 'connectedEdges': return `check(f.getConnectedEdges(${str(q.id)}).map { it.id } == ${strList(a as string[], 'kotlin')}, ${str(label)})`
    case 'incomers': return `check(f.getIncomers(${str(q.id)}).map { it.id } == ${strList(a as string[], 'kotlin')}, ${str(label)})`
    case 'outgoers': return `check(f.getOutgoers(${str(q.id)}).map { it.id } == ${strList(a as string[], 'kotlin')}, ${str(label)})`
    case 'screenToFlow': { const p = a as { x: number; y: number }; return `check(parityNear(f.screenToFlowPosition(PyreonXYPosition(${d(q.x)}, ${d(q.y)})), ${d(p.x)}, ${d(p.y)}), ${str(label)})` }
    case 'clampToExtent': { const p = a as { x: number; y: number }; return `check(parityNear(f.clampToExtent(PyreonXYPosition(${d(q.x)}, ${d(q.y)})), ${d(p.x)}, ${d(p.y)}), ${str(label)})` }
  }
}

export function renderSwift(scenarios: readonly ParityScenario[] = PARITY_SCENARIOS): string {
  const out: string[] = [SWIFT_MARKERS[0]]
  out.push('    static func parityNear(_ p: PyreonXYPosition, _ x: Double, _ y: Double) -> Bool { abs(p.x - x) < 1e-6 && abs(p.y - y) < 1e-6 }')
  out.push('    static func parityNodes(_ f: PyreonFlowState<NodeData>, _ want: [(String, Double, Double)]) -> Bool {')
  out.push('        let got = f.nodes')
  out.push('        if got.count != want.count { return false }')
  out.push('        for i in 0..<got.count { if got[i].id != want[i].0 || abs(got[i].position.x - want[i].1) >= 1e-6 || abs(got[i].position.y - want[i].2) >= 1e-6 { return false } }')
  out.push('        return true')
  out.push('    }')
  out.push('    static func parityEdges(_ f: PyreonFlowState<NodeData>, _ want: [(String, String, String)]) -> Bool {')
  out.push('        let got = f.edges')
  out.push('        if got.count != want.count { return false }')
  out.push('        for i in 0..<got.count { if got[i].id != want[i].0 || got[i].source != want[i].1 || got[i].target != want[i].2 { return false } }')
  out.push('        return true')
  out.push('    }')
  out.push('    /// The web engine ran every scenario first; these are its answers.')
  out.push('    static func runParityChecks() {')
  for (const s of scenarios) {
    const e = expectationsOf(s)
    out.push(`        do { // ${s.name}`)
    out.push(`            let f = PyreonFlowState<NodeData>(nodes: [${s.nodes.map((n) => `PyreonFlowNode(id: ${str(n.id)}, position: PyreonXYPosition(x: ${d(n.x)}, y: ${d(n.y)}), data: NodeData(label: ${str(n.id)}))`).join(', ')}], edges: [${s.edges.map((x) => `PyreonFlowEdge(id: ${str(x.id)}, source: ${str(x.source)}, target: ${str(x.target)})`).join(', ')}])`)
    for (const o of s.ops) out.push(`            ${opSwift(o)}`)
    out.push(`            check(parityNodes(f, [${e.nodes.map((n) => `(${str(n.id)}, ${d(n.x)}, ${d(n.y)})`).join(', ')}]), ${str(`parity: ${s.name} — nodes`)})`)
    out.push(`            check(parityEdges(f, [${e.edges.map((x) => `(${str(x.id)}, ${str(x.source)}, ${str(x.target)})`).join(', ')}]), ${str(`parity: ${s.name} — edges`)})`)
    out.push(`            check(f.selectedNodes().sorted() == ${strList(e.selectedNodes, 'swift')}, ${str(`parity: ${s.name} — selected nodes`)})`)
    out.push(`            check(f.selectedEdges().sorted() == ${strList(e.selectedEdges, 'swift')}, ${str(`parity: ${s.name} — selected edges`)})`)
    out.push(`            check(abs(f.viewport.x - ${d(e.viewport.x)}) < 1e-6 && abs(f.viewport.y - ${d(e.viewport.y)}) < 1e-6 && abs(f.viewport.zoom - ${d(e.viewport.zoom)}) < 1e-6, ${str(`parity: ${s.name} — viewport`)})`)
    s.queries.forEach((q, i) => out.push(`            ${answerSwift(q, e.answers[i]!, `parity: ${s.name} — query ${i + 1} ${q.q}`)}`))
    out.push('        }')
  }
  out.push('    }')
  out.push(SWIFT_MARKERS[1])
  return out.join('\n')
}

export function renderKotlin(scenarios: readonly ParityScenario[] = PARITY_SCENARIOS): string {
  const out: string[] = [KOTLIN_MARKERS[0]]
  out.push('private fun parityNear(p: PyreonXYPosition, x: Double, y: Double): Boolean = abs(p.x - x) < 1e-6 && abs(p.y - y) < 1e-6')
  out.push('private fun parityNodes(f: PyreonFlowState<NodeData>, want: List<Triple<String, Double, Double>>): Boolean {')
  out.push('    val got = f.nodes')
  out.push('    if (got.size != want.size) return false')
  out.push('    for (i in got.indices) { if (got[i].id != want[i].first || abs(got[i].position.x - want[i].second) >= 1e-6 || abs(got[i].position.y - want[i].third) >= 1e-6) return false }')
  out.push('    return true')
  out.push('}')
  out.push('private fun parityEdges(f: PyreonFlowState<NodeData>, want: List<Triple<String, String, String>>): Boolean {')
  out.push('    val got = f.edges')
  out.push('    if (got.size != want.size) return false')
  out.push('    for (i in got.indices) { if (got[i].id != want[i].first || got[i].source != want[i].second || got[i].target != want[i].third) return false }')
  out.push('    return true')
  out.push('}')
  out.push('/** The web engine ran every scenario first; these are its answers. */')
  out.push('private fun runParityChecks() {')
  for (const s of scenarios) {
    const e = expectationsOf(s)
    out.push(`    run { // ${s.name}`)
    out.push(`        val f = PyreonFlowState<NodeData>(nodes = listOf<PyreonFlowNode<NodeData>>(${s.nodes.map((n) => `PyreonFlowNode(${str(n.id)}, position = PyreonXYPosition(${d(n.x)}, ${d(n.y)}), data = NodeData(${str(n.id)}))`).join(', ')}), edges = listOf<PyreonFlowEdge>(${s.edges.map((x) => `PyreonFlowEdge(${str(x.id)}, source = ${str(x.source)}, target = ${str(x.target)})`).join(', ')}))`)
    for (const o of s.ops) out.push(`        ${opKotlin(o)}`)
    out.push(`        check(parityNodes(f, listOf<Triple<String, Double, Double>>(${e.nodes.map((n) => `Triple(${str(n.id)}, ${d(n.x)}, ${d(n.y)})`).join(', ')})), ${str(`parity: ${s.name} — nodes`)})`)
    out.push(`        check(parityEdges(f, listOf<Triple<String, String, String>>(${e.edges.map((x) => `Triple(${str(x.id)}, ${str(x.source)}, ${str(x.target)})`).join(', ')})), ${str(`parity: ${s.name} — edges`)})`)
    out.push(`        check(f.selectedNodes().sorted() == ${strList(e.selectedNodes, 'kotlin')}, ${str(`parity: ${s.name} — selected nodes`)})`)
    out.push(`        check(f.selectedEdges().sorted() == ${strList(e.selectedEdges, 'kotlin')}, ${str(`parity: ${s.name} — selected edges`)})`)
    out.push(`        check(abs(f.viewport.x - ${d(e.viewport.x)}) < 1e-6 && abs(f.viewport.y - ${d(e.viewport.y)}) < 1e-6 && abs(f.viewport.zoom - ${d(e.viewport.zoom)}) < 1e-6, ${str(`parity: ${s.name} — viewport`)})`)
    s.queries.forEach((q, i) => out.push(`        ${answerKotlin(q, e.answers[i]!, `parity: ${s.name} — query ${i + 1} ${q.q}`)}`))
    out.push('    }')
  }
  out.push('}')
  out.push(KOTLIN_MARKERS[1])
  return out.join('\n')
}

/** Replace (or, on first use, insert before `anchor`) the marker-delimited region. */
export function spliceRegion(file: string, markers: readonly [string, string], region: string, anchor: string): string {
  const a = file.indexOf(markers[0])
  const b = file.indexOf(markers[1])
  if (a >= 0 && b > a) return file.slice(0, a) + region + file.slice(b + markers[1].length)
  const at = file.indexOf(anchor)
  if (at < 0) throw new Error(`[flow-parity] anchor not found: ${anchor}`)
  return file.slice(0, at) + region + '\n\n' + file.slice(at)
}
