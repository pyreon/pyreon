// Branch-coverage matrix for the SHARED lowering modules both emitters call —
// the inline `<svg>` planner, BaseEdge/EdgeText, the flow-lowering helpers,
// path paint, render-slot struct lifting and inline-object lifting.
//
// These modules are pure functions over IR (a JSX element, a type, a
// component), so the specs build the IR by hand and assert the decision:
// the emitted path data, the paint, the lifted struct, or the named warning.
// Each spec pairs the shape that takes an arm with the neighbour that must not.

import { describe, expect, it } from 'vitest'
import {
  classifyNonBooleanLogicalOperand,
  exprContainsJsx,
  exprHasOptionalLink,
  exprReferencesIdent,
  isNumericLiteralOrNegation,
  isReReadableExpr,
  lowerRouteParams,
  resolveForElementKey,
  substituteIdentifier,
  substituteMatching,
  synthTypedStructName,
  typeShapeKey,
} from '../expr-utils'
import { planBaseEdge, planEdgeText } from '../../../../fundamentals/flow/src/native-plugin/base-edge'
import {
  collectFlowRendererComponents,
  droppedFlowFieldsWarning,
  flowRectLiteralFields,
  flowSignalWriteWarning,
  nodeResizerTargetsAnotherNode,
  resolveStaticFlowRendererMap,
} from '../../../../fundamentals/flow/src/native-plugin/lowering'
import { resolveFlowPathPaint } from '../../../../fundamentals/flow/src/native-plugin/path-paint'
import { planFlowSvg } from '../../../../fundamentals/flow/src/native-plugin/svg'
import { liftInlineObjectStructs } from '../inline-object-structs'
import { liftSlotParamStructs, moduleViewHelpers, viewHelperFromDecl } from '../render-slots'
import type { ComponentIR, DeclIR, ExprIR, ModuleDeclIR, StructIR, TypeIR } from '../types'

type El = Extract<ExprIR, { kind: 'jsx-element' }>
const lit = (value: string | number | boolean | null): ExprIR => ({ kind: 'literal', value })
const id = (name: string): ExprIR => ({ kind: 'identifier', name })
const el = (tag: string, attrs: Record<string, ExprIR> = {}, children: El['children'] = []): El => ({
  kind: 'jsx-element',
  tag,
  attrs: Object.entries(attrs).map(([name, value]) => ({ kind: 'attr' as const, name, value })),
  children,
})
const child = (e: ExprIR): El['children'][number] => ({ kind: 'expr', expr: e })
const svg = (attrs: Record<string, ExprIR>, ...kids: ExprIR[]): El => el('svg', { width: lit(24), height: lit(24), ...attrs }, kids.map(child))
const pathText = (e: ExprIR | undefined): string =>
  e === undefined ? '<none>' : e.kind === 'literal' ? String(e.value) : e.kind === 'template' ? e.quasis.join('${}') : `<${e.kind}>`

describe('flow-svg — number attributes', () => {
  it('reads "24px" as 24 and warns on a non-number string, falling back to the default', () => {
    const plan = planFlowSvg(el('svg', { width: lit('24px'), height: lit('tall') }))
    expect(plan.width).toEqual({ kind: 'literal', value: 24 })
    expect(plan.height).toBeUndefined()
    expect(plan.warnings.join('\n')).toContain('<svg height="tall"> is not a plain number')
  })

  it('a boolean literal attribute is kept as an expression, not parsed', () => {
    expect(planFlowSvg(el('svg', { width: lit(true), height: lit(1) })).width).toEqual({ kind: 'expr', expr: lit(true) })
  })
})

describe('flow-svg — shape paths', () => {
  const shape = (e: El) => planFlowSvg(svg({}, e))
  it('a zero-arg arrow `d={() => …}` unwraps to its body; a missing `d` is dropped with a warning', () => {
    const arrow = { kind: 'arrow', params: [], body: id('pathD') } as unknown as ExprIR
    const plan = shape(el('path', { d: arrow }))
    expect(plan.shapes[0]!.d).toEqual({ kind: 'template', quasis: ['', ''], exprs: [id('pathD')] })
    const missing = shape(el('path'))
    expect(missing.shapes).toHaveLength(0)
    expect(missing.warnings.join('\n')).toContain('<path> needs a `d` attribute')
  })

  it('<line> defaults every missing coordinate to 0', () => {
    expect(pathText(shape(el('line', { x2: lit(5) })).shapes[0]!.d)).toBe('M 0 0 L 5 0')
  })

  it('<polyline> stays open, <polygon> closes; a points-less one draws nothing', () => {
    expect(pathText(shape(el('polyline', { points: lit('0,0 1,1') })).shapes[0]!.d)).toBe('M 0,0 1,1')
    expect(pathText(shape(el('polygon', { points: lit('0,0 1,1') })).shapes[0]!.d)).toBe('M 0,0 1,1 Z')
    expect(shape(el('polygon')).shapes).toHaveLength(0)
  })

  it('<ellipse> falls back rx→ry and ry→rx; a radius-less one draws nothing', () => {
    expect(pathText(shape(el('ellipse', { ry: lit(3) })).shapes[0]!.d)).toContain('m -3 0 a 3 3')
    expect(pathText(shape(el('ellipse', { rx: lit(4) })).shapes[0]!.d)).toContain('a 4 4')
    expect(shape(el('ellipse')).shapes).toHaveLength(0)
    expect(shape(el('circle')).shapes).toHaveLength(0)
  })

  it('a DYNAMIC circle radius negates by prefixing `-`', () => {
    const d = shape(el('circle', { r: id('r') })).shapes[0]!.d
    expect(d.kind).toBe('template')
    expect(pathText(d)).toContain(' m -${}')
  })

  it('a <rect> without width/height draws nothing; a clamped-to-zero radius keeps square corners', () => {
    expect(shape(el('rect', { width: lit(10) })).shapes).toHaveLength(0)
    expect(pathText(shape(el('rect', { width: lit(10), height: lit(10), rx: lit(0) })).shapes[0]!.d)).toBe('M 0 0 h 10 v 10 h -10 Z')
    // `ry` alone supplies `rx` too.
    expect(pathText(shape(el('rect', { width: lit(10), height: lit(10), ry: lit(2) })).shapes[0]!.d)).toContain('a 2 2 0 0 1')
  })

  it('an unknown shape tag inside <g> is dropped with a warning', () => {
    const plan = planFlowSvg(svg({}, el('g', {}, [child(el('text'))])))
    expect(plan.warnings.join('\n')).toContain('<text> inside a native Flow <svg> has no lowering')
  })
})

describe('flow-svg — children', () => {
  it('drops non-blank text with a warning, lowers a fragment, drops a dynamic child and skips <title>', () => {
    const plan = planFlowSvg(
      el('svg', { width: lit(1), height: lit(1) }, [
        { kind: 'text', value: '   ' },
        { kind: 'text', value: 'hello' },
        child({ kind: 'jsx-fragment', children: [child(el('line', { x2: lit(1) }))] }),
        child(id('dynamic')),
        child(el('title')),
      ]),
    )
    const w = plan.warnings.join('\n')
    expect(w).toContain('Text directly inside a native Flow <svg>')
    expect(w).toContain('A dynamic child inside a native Flow <svg>')
    expect(plan.shapes).toHaveLength(1)
    expect(w).not.toContain('<title>')
  })

  it('a `transform` on a shape is reported', () => {
    const plan = planFlowSvg(svg({}, el('line', { transform: lit('rotate(45)') })))
    expect(plan.warnings.join('\n')).toContain('<line transform> is not applied natively')
  })
})

describe('flow-svg — root attributes', () => {
  it('a malformed static viewBox and a dynamic one are both ignored with their own warning', () => {
    expect(planFlowSvg(svg({ viewBox: lit('0 0 10') })).warnings.join('\n')).toContain('is not four numbers')
    expect(planFlowSvg(svg({ viewBox: id('vb') })).warnings.join('\n')).toContain('must be a static string')
    expect(planFlowSvg(svg({ viewBox: lit('0,0,10,10') })).viewBox).toEqual([0, 0, 10, 10])
  })

  it('preserveAspectRatio: "none" stretches, "xMidYMid meet" is silent, anything else warns', () => {
    expect(planFlowSvg(svg({ preserveAspectRatio: lit('none') })).stretch).toBe(true)
    expect(planFlowSvg(svg({ preserveAspectRatio: lit('xMidYMid meet') })).warnings).toEqual([])
    expect(planFlowSvg(svg({ preserveAspectRatio: lit('xMinYMin') })).warnings.join('\n')).toContain('preserveAspectRatio')
    expect(planFlowSvg(svg({ preserveAspectRatio: id('par') })).warnings.join('\n')).toContain('preserveAspectRatio')
  })

  it('a size-less <svg> warns; class/className are reported', () => {
    expect(planFlowSvg(el('svg')).warnings.join('\n')).toContain('draws at 300 wide')
    expect(planFlowSvg(svg({ className: lit('x') })).warnings.join('\n')).toContain('<svg className> is browser CSS')
  })
})

describe('flow-path-paint — style parsing and width sources', () => {
  it('a style declaration with no colon is ignored; a dynamic style warns; a string stroke-width parses', () => {
    const p = resolveFlowPathPaint(el('path', { style: lit('bogus; stroke: red') }))
    expect(p.stroke).toEqual({ kind: 'literal', value: 'red' })
    expect(resolveFlowPathPaint(el('path', { style: id('s') })).warnings.join('\n')).toContain('must be a static string')
    expect(resolveFlowPathPaint(el('path', { strokeWidth: lit('2.5') })).width).toEqual({ kind: 'literal', value: 2.5 })
    expect(resolveFlowPathPaint(el('path', { 'stroke-width': id('w') })).width).toEqual({ kind: 'expr', expr: id('w') })
  })

  it('a dynamic fill stays an expression', () => {
    expect(resolveFlowPathPaint(el('path', { fill: id('c') })).fill).toEqual({ kind: 'expr', expr: id('c') })
  })
})

describe('flow-base-edge — BaseEdge and EdgeText', () => {
  it('a path-less BaseEdge warns; markers, class and labelStyle are reported; a label without coordinates is dropped', () => {
    const plan = planBaseEdge(
      el('BaseEdge', { markerEnd: lit('url(#a)'), class: lit('x'), labelStyle: lit('y'), label: lit('L') }),
    )
    const w = plan.warnings.join('\n')
    expect(plan.path).toBeUndefined()
    expect(w).toContain('needs a `path`')
    expect(w).toContain('<BaseEdge markerEnd>')
    expect(w).toContain('<BaseEdge class>')
    expect(w).toContain('<BaseEdge labelStyle>')
    expect(w).toContain('needs `labelX` and `labelY`')
    expect(plan.label).toBeUndefined()
  })

  it('a complete label is kept', () => {
    const plan = planBaseEdge(el('BaseEdge', { path: lit('M 0 0'), label: lit('L'), labelX: lit(1), labelY: lit(2) }))
    expect(plan.label).toEqual({ text: lit('L'), x: lit(1), y: lit(2) })
    expect(plan.warnings).toEqual([])
  })

  it('EdgeText keeps each present field and reports a missing one and a style', () => {
    const full = planEdgeText(el('EdgeText', { label: lit('t'), x: lit(1), y: lit(2) }))
    expect(full).toEqual({ text: lit('t'), x: lit(1), y: lit(2), warnings: [] })
    const partial = planEdgeText(el('EdgeText', { style: lit('a') }))
    expect(partial.text).toBeUndefined()
    expect(partial.warnings.join('\n')).toContain('needs `x`, `y` and `label`')
    expect(partial.warnings.join('\n')).toContain('<EdgeText style> is browser CSS')
  })
})

describe('flow-lowering — renderer maps', () => {
  const obj = (fields: Record<string, ExprIR>, spreads?: ExprIR[]): ExprIR => ({
    kind: 'object',
    fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
    ...(spreads ? { spreads } : {}),
  })

  it('a self-referential identifier stops instead of recursing forever', () => {
    const lookup = (n: string): ExprIR | undefined => (n === 'a' ? id('a') : undefined)
    expect(resolveStaticFlowRendererMap(id('a'), lookup)).toBeUndefined()
  })

  it('a spread that does not resolve, or a non-identifier value, makes the whole map unresolvable', () => {
    expect(resolveStaticFlowRendererMap(obj({ a: id('A') }, [id('missing')]), () => undefined)).toBeUndefined()
    expect(resolveStaticFlowRendererMap(obj({ a: lit('A') }), () => undefined)).toBeUndefined()
    const lookup = (n: string): ExprIR | undefined => (n === 'base' ? obj({ b: id('B') }) : undefined)
    expect(resolveStaticFlowRendererMap(obj({ a: id('A') }, [id('base')]), lookup)).toEqual([
      { type: 'b', component: 'B' },
      { type: 'a', component: 'A' },
    ])
  })

  it('collects edgeTypes + connectionLine renderers, skipping events and unresolvable maps', () => {
    const flow: ExprIR = {
      kind: 'jsx-element',
      tag: 'Flow',
      attrs: [
        { kind: 'event', name: 'Click', handler: id('h') },
        { kind: 'attr', name: 'edgeTypes', value: obj({ e: id('EdgeR') }) },
        { kind: 'attr', name: 'nodeTypes', value: id('unknownMap') },
        { kind: 'attr', name: 'connectionLine', value: id('Line') },
        { kind: 'attr', name: 'connectionLine', value: lit('x') },
      ],
      children: [],
    }
    expect([...collectFlowRendererComponents([flow], () => undefined)].sort()).toEqual(['EdgeR', 'Line'])
  })
})

describe('flow-lowering — warnings and small predicates', () => {
  it('the signal-write warning names the prop and op', () => {
    expect(flowSignalWriteWarning('flow', 'nodes', 'set')).toContain('`nodes.set(...)` writes the `nodes` signal directly')
  })

  it('the dropped-fields warning pluralises and names the edge type', () => {
    const one = droppedFlowFieldsWarning('site', 'edge', ['foo'])
    expect(one).toContain('edge field `foo` is NOT carried by the native PyreonFlowEdge and was DROPPED')
    const many = droppedFlowFieldsWarning('site', 'node', ['a', 'b'])
    expect(many).toContain('node fields `a`, `b` are NOT carried by the native PyreonFlowNode and were DROPPED')
  })

  it('a NodeResizer with no nodeId, `id`, or `props.id` targets its host; anything else another node', () => {
    expect(nodeResizerTargetsAnotherNode(el('NodeResizer'), 'props')).toBe(false)
    expect(nodeResizerTargetsAnotherNode(el('NodeResizer', { nodeId: id('id') }), 'props')).toBe(false)
    const propsId: ExprIR = { kind: 'member', object: id('props'), property: 'id' }
    expect(nodeResizerTargetsAnotherNode(el('NodeResizer', { nodeId: propsId }), 'props')).toBe(false)
    expect(nodeResizerTargetsAnotherNode(el('NodeResizer', { nodeId: lit('n2') }), 'props')).toBe(true)
  })

  it('a rect literal with a spread or a wrong field set is not a rect', () => {
    const rect = (fields: Record<string, ExprIR>, spreads?: ExprIR[]): ExprIR => ({
      kind: 'object',
      fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
      ...(spreads ? { spreads } : {}),
    })
    const full = { x: lit(1), y: lit(2), width: lit(3), height: lit(4) }
    expect(flowRectLiteralFields(rect(full))).toEqual([lit(1), lit(2), lit(3), lit(4)])
    expect(flowRectLiteralFields(rect(full, [id('r')]))).toBeNull()
    expect(flowRectLiteralFields(rect({ x: lit(1), y: lit(2), width: lit(3), depth: lit(4) }))).toBeNull()
    expect(flowRectLiteralFields(id('r'))).toBeNull()
  })
})

describe('inline-object-structs — collection element lifting', () => {
  const pt: TypeIR = { kind: 'object', fields: [{ name: 'x', type: { kind: 'number' } }] }
  it('lifts an object inside a Set to `<Owner><Field>Item` and inside a Map value to `…Value`', () => {
    const r = liftInlineObjectStructs(
      {
        name: 'Doc',
        fields: [
          { name: 'pts', type: { kind: 'set', element: pt } },
          { name: 'byId', type: { kind: 'map', key: { kind: 'string' }, value: pt } },
        ],
      },
      new Set(),
    )
    expect(r.lifted.map((s) => s.name)).toEqual(['DocPtsItem', 'DocByIdValue'])
    expect(r.struct.fields[0]!.type).toEqual({ kind: 'set', element: { kind: 'typeRef', name: 'DocPtsItem', args: [] } })
  })

  it('refuses a name that is already declared, with a warning', () => {
    const r = liftInlineObjectStructs({ name: 'Doc', fields: [{ name: 'meta', type: pt }] }, new Set(['DocMeta']))
    expect(r.lifted).toEqual([])
    expect(r.warnings.join('\n')).toContain('would lift to `DocMeta`, which is already declared')
  })
})

describe('render-slots — lifting slot parameter structs', () => {
  const view: TypeIR = { kind: 'typeRef', name: 'VNodeChild', args: [] }
  const slot = (params: { name?: string; type: TypeIR }[]): TypeIR => ({ kind: 'function', params, returnType: view })
  const comp = (name: string, type: TypeIR): ComponentIR => ({
    name,
    props: [{ name: 'render', type }],
    propsParamName: 'props',
    decls: [],
    returnExpr: lit(null),
  })

  it('an OPTIONAL render prop keeps its optionality around the renamed function type', () => {
    const c = comp('Picker', { kind: 'union', branches: [slot([{ name: 'item', type: { kind: 'object', fields: [{ name: 't', type: { kind: 'string' } }] } }]), { kind: 'undefined' }] })
    const lifted = liftSlotParamStructs([c], new Set(), [], [])
    expect(lifted.map((s) => s.name)).toEqual(['PickerRenderItem'])
    const t = c.props[0]!.type
    expect(t.kind).toBe('union')
    const fn = (t as Extract<TypeIR, { kind: 'union' }>).branches[0]!
    expect(fn).toMatchObject({ kind: 'function', params: [{ type: { kind: 'typeRef', name: 'PickerRenderItem' } }] })
  })

  it('two identical nested shapes collapse into ONE struct, and the parent references it through a Set/Map/union', () => {
    const inner: TypeIR = { kind: 'object', fields: [{ name: 'b', type: { kind: 'number' } }, { name: 'a', type: { kind: 'string' } }] }
    const outer: TypeIR = {
      kind: 'object',
      fields: [
        { name: 'one', type: inner },
        { name: 'many', type: { kind: 'set', element: inner } },
        { name: 'byKey', type: { kind: 'map', key: { kind: 'string' }, value: inner } },
        { name: 'maybe', type: { kind: 'union', branches: [inner, { kind: 'null' }] } },
      ],
    }
    const c = comp('Grid', slot([{ name: 'row', type: outer }]))
    const lifted = liftSlotParamStructs([c], new Set(), [], [])
    // One inner struct, the four duplicates renamed to it, plus the row struct.
    expect(lifted.map((s) => s.name)).toEqual(['GridRenderRowOne', 'GridRenderRow'])
    const row = lifted.find((s) => s.name === 'GridRenderRow')!
    expect(row.fields.map((f) => JSON.stringify(f.type))).toEqual([
      JSON.stringify({ kind: 'typeRef', name: 'GridRenderRowOne', args: [] }),
      JSON.stringify({ kind: 'set', element: { kind: 'typeRef', name: 'GridRenderRowOne', args: [] } }),
      JSON.stringify({ kind: 'map', key: { kind: 'string' }, value: { kind: 'typeRef', name: 'GridRenderRowOne', args: [] } }),
      JSON.stringify({ kind: 'union', branches: [{ kind: 'typeRef', name: 'GridRenderRowOne', args: [] }, { kind: 'null' }] }),
    ])
  })

  it('a slot whose only object is inside a Map value still lifts; a primitive-param slot lifts nothing', () => {
    const c = comp('M', slot([{ name: 'm', type: { kind: 'map', key: { kind: 'string' }, value: { kind: 'object', fields: [{ name: 'z', type: { kind: 'boolean' } }] } } }]))
    expect(liftSlotParamStructs([c], new Set(), [], []).map((s) => s.name)).toEqual(['MRenderMValue'])
    const plain = comp('P', slot([{ name: 'n', type: { kind: 'number' } }]))
    expect(liftSlotParamStructs([plain], new Set(), [], [])).toEqual([])
  })

  it('a lifted shape matching an EXISTING struct reuses its name', () => {
    const existing: StructIR[] = [{ name: 'Row', fields: [{ name: 'a', type: { kind: 'string' } }] }]
    const c = comp('T', slot([{ name: 'r', type: { kind: 'object', fields: [{ name: 'a', type: { kind: 'string' } }] } }]))
    expect(liftSlotParamStructs([c], new Set(), existing, [])).toEqual([])
    expect(c.props[0]!.type).toMatchObject({ params: [{ type: { kind: 'typeRef', name: 'Row' } }] })
  })
})

describe('render-slots — view helper recognition', () => {
  const jsx: ExprIR = { kind: 'jsx-element', tag: 'Text', attrs: [], children: [] }
  const fn = (body: Extract<DeclIR, { kind: 'function' }>['body']): DeclIR => ({
    kind: 'function',
    name: 'renderRow',
    params: [{ name: 'r', type: { kind: 'string' } }],
    returnType: { kind: 'unknown' },
    body,
  })

  it('declines a multi-statement body and a bare return; accepts a single view return', () => {
    expect(viewHelperFromDecl(fn([{ kind: 'expr', expr: lit(1) }, { kind: 'return', expr: jsx }]))).toBeNull()
    expect(viewHelperFromDecl(fn([{ kind: 'return' }]))).toBeNull()
    expect(viewHelperFromDecl(fn([{ kind: 'return', expr: jsx }]))?.name).toBe('renderRow')
  })

  it('a module-scope `let`, a non-arrow, or a statement-bodied arrow is not a helper', () => {
    const arrow = (extra: object = {}): ExprIR => ({ kind: 'arrow', params: ['r'], paramTypes: [{ kind: 'string' }], body: jsx, ...extra }) as ExprIR
    const md = (name: string, initial: ExprIR, mutable = false): ModuleDeclIR => ({ name, mutable, type: { kind: 'unknown' }, initial })
    const helpers = moduleViewHelpers([
      md('ok', arrow()),
      md('mutable', arrow(), true),
      md('notArrow', lit(1)),
      md('stmts', arrow({ stmts: [{ kind: 'return', expr: jsx }] })),
    ])
    expect([...helpers.keys()]).toEqual(['ok'])
  })
})

// ─── expr-utils: the three TOTAL walkers over every ExprIR kind ────────────
//
// `exprReferencesIdent`, `substituteMatching` and `lowerRouteParams` each
// recurse into every node kind. One table of wrappers — each placing a hole
// in the kind's child slot — drives all three, so a kind whose arm stopped
// recursing (or stopped propagating a bail) fails by NAME.

type Wrap = (hole: ExprIR) => ExprIR
const jsxEl = (attrs: El['attrs'], children: El['children'] = []): ExprIR => ({ kind: 'jsx-element', tag: 'View', attrs, children })
const WRAPS: Record<string, Wrap> = {
  'new-collection seed': (h) => ({ kind: 'new-collection', collection: 'set', seed: h }),
  'new-collection entry key': (h) => ({ kind: 'new-collection', collection: 'map', entries: [[h, lit(1)]] }),
  'new-collection entry value': (h) => ({ kind: 'new-collection', collection: 'map', entries: [[lit('k'), h]] }),
  'call callee': (h) => ({ kind: 'call', callee: h, args: [] }),
  'call arg': (h) => ({ kind: 'call', callee: id('f'), args: [lit(1), h] }),
  member: (h) => ({ kind: 'member', object: h, property: 'p' }),
  'index object': (h) => ({ kind: 'index', object: h, index: lit(0) }),
  'index key': (h) => ({ kind: 'index', object: id('xs'), index: h }),
  'binary right': (h) => ({ kind: 'binary', op: '+', left: lit(1), right: h }),
  'comparison left': (h) => ({ kind: 'comparison', op: '<', left: h, right: lit(1) }),
  'logical right': (h) => ({ kind: 'logical', op: '&&', left: lit(true), right: h }),
  unary: (h) => ({ kind: 'unary', op: '-', argument: h }),
  update: (h) => ({ kind: 'update', op: '++', argument: h }),
  'ternary cond': (h) => ({ kind: 'ternary', cond: h, then: lit(1), otherwise: lit(2) }),
  'ternary then': (h) => ({ kind: 'ternary', cond: lit(true), then: h, otherwise: lit(2) }),
  'ternary otherwise': (h) => ({ kind: 'ternary', cond: lit(true), then: lit(1), otherwise: h }),
  arrow: (h) => ({ kind: 'arrow', params: ['q'], body: h }) as ExprIR,
  array: (h) => ({ kind: 'array', elements: [lit(1), h] }),
  template: (h) => ({ kind: 'template', quasis: ['a', 'b'], exprs: [h] }),
  'object field': (h) => ({ kind: 'object', fields: [{ name: 'a', value: h }] }),
  'object spread': (h) => ({ kind: 'object', fields: [{ name: 'a', value: lit(1) }], spreads: [h] }),
  paren: (h) => ({ kind: 'paren', inner: h }),
  await: (h) => ({ kind: 'await', expr: h }),
  'json-stringify': (h) => ({ kind: 'json-stringify', arg: h }),
  'ext-expr': (h) => ({ kind: 'ext-expr', plugin: '@acme/p', type: 't', payload: {}, args: [lit(1), h] }),
  spread: (h) => ({ kind: 'spread', argument: h }),
  'jsx attr': (h) => jsxEl([{ kind: 'spread', argument: id('rest') }, { kind: 'attr', name: 'a', value: h }]),
  'jsx event': (h) => jsxEl([{ kind: 'event', name: 'Press', handler: h }]),
  'jsx child': (h) => jsxEl([], [{ kind: 'text', value: 't' }, child(h)]),
  'jsx-fragment child': (h) => ({ kind: 'jsx-fragment', children: [{ kind: 'text', value: 't' }, child(h)] }),
}
const X = id('x')
const SHADOW: ExprIR = { kind: 'arrow', params: ['x'], body: X } as ExprIR

describe('expr-utils — exprReferencesIdent is total', () => {
  for (const [name, wrap] of Object.entries(WRAPS)) {
    it(`finds a free \`x\` through ${name}, and nothing when it is absent`, () => {
      expect(exprReferencesIdent(wrap(X), 'x')).toBe(true)
      expect(exprReferencesIdent(wrap(id('other')), 'x')).toBe(false)
    })
  }

  it('an arrow re-binding the name hides it; the leaf kinds reference nothing', () => {
    expect(exprReferencesIdent(SHADOW, 'x')).toBe(false)
    expect(exprReferencesIdent({ kind: 'new-collection', collection: 'set' }, 'x')).toBe(false)
    // A plugin expression with no argument slots (`new SizedMap<K, V>({ … })` carries only literal options) can never reference one.
    expect(exprReferencesIdent({ kind: 'ext-expr', plugin: '@acme/toy', type: 'toy', payload: { maxEntries: 3 }, args: [] }, 'x')).toBe(false)
  })
})

describe('expr-utils — substituteMatching is total and propagates a bail from every slot', () => {
  for (const [name, wrap] of Object.entries(WRAPS)) {
    it(`replaces \`x\` through ${name}, and bails when a nested arrow re-binds it`, () => {
      const out = substituteIdentifier(wrap(X), 'x', id('y'))
      expect(out).not.toBeNull()
      expect(exprReferencesIdent(out!, 'x')).toBe(false)
      expect(exprReferencesIdent(out!, 'y')).toBe(true)
      expect(substituteIdentifier(wrap(SHADOW), 'x', id('y'))).toBeNull()
    })
  }

  it('leaves the childless leaves untouched', () => {
    const empty: ExprIR = { kind: 'new-collection', collection: 'set' }
    expect(substituteIdentifier(empty, 'x', id('y'))).toBe(empty)
  })

  it('under NARROWING: `x?.p` loses its `?.` once `x` is the unwrapped binding; a statement-bodied arrow bails', () => {
    const subst = { matches: (e: ExprIR) => e.kind === 'identifier' && e.name === 'x', replacement: id('xv'), shadow: 'x', narrowing: true }
    const optMember: ExprIR = { kind: 'member', object: X, property: 'p', optional: true }
    expect(substituteMatching(optMember, subst)).toEqual({ kind: 'member', object: id('xv'), property: 'p', optional: false })
    const stmtArrow = { kind: 'arrow', params: [], body: X, stmts: [{ kind: 'return', expr: X }] } as unknown as ExprIR
    expect(substituteMatching(stmtArrow, subst)).toBeNull()
    // Without narrowing, the same arrow's expression body is substituted.
    expect(substituteMatching(stmtArrow, { ...subst, narrowing: false })).not.toBeNull()
  })
})

describe('expr-utils — lowerRouteParams walks every kind', () => {
  const ctxParamsId: ExprIR = { kind: 'member', object: { kind: 'member', object: id('ctx'), property: 'params' }, property: 'id' }
  const JSX_WRAPS = new Set(['jsx attr', 'jsx event', 'jsx child', 'jsx-fragment child'])
  for (const [name, wrap] of Object.entries(WRAPS)) {
    if (JSX_WRAPS.has(name)) continue
    it(`rewrites \`ctx.params.id\` and flags a stray \`ctx\` through ${name}`, () => {
      const r = lowerRouteParams(wrap(ctxParamsId), 'ctx')
      expect(r.usesParams).toBe(true)
      expect(r.residualCtx).toBe(false)
      expect(JSON.stringify(r.expr)).toContain('"name":"params"')
      expect(lowerRouteParams(wrap(id('ctx')), 'ctx').residualCtx).toBe(true)
    })
  }

  it('`ctx.params[key]` lowers the computed key; JSX and leaves pass through untouched', () => {
    const idx: ExprIR = { kind: 'index', object: { kind: 'member', object: id('ctx'), property: 'params' }, index: lit('slug') }
    expect(lowerRouteParams(idx, 'ctx').expr).toEqual({
      kind: 'logical',
      op: '??',
      left: { kind: 'index', object: id('params'), index: lit('slug') },
      right: lit(''),
    })
    const jsx = WRAPS['jsx child']!(id('ctx'))
    expect(lowerRouteParams(jsx, 'ctx')).toEqual({ expr: jsx, usesParams: false, residualCtx: false })
    const empty: ExprIR = { kind: 'new-collection', collection: 'map' }
    expect(lowerRouteParams(empty, 'ctx').expr).toBe(empty)
    const sized: ExprIR = { kind: 'ext-expr', plugin: '@acme/toy', type: 'toy', payload: { maxEntries: 1 }, args: [] }
    expect(lowerRouteParams(sized, 'ctx').expr).toEqual(sized)
  })
})

describe('expr-utils — exprContainsJsx', () => {
  const view: ExprIR = { kind: 'jsx-fragment', children: [] }
  const containers = [
    'call callee', 'call arg', 'member', 'index object', 'index key', 'binary right', 'comparison left',
    'logical right', 'unary', 'ternary cond', 'ternary then', 'ternary otherwise', 'arrow', 'array',
    'template', 'object field', 'object spread', 'paren', 'await', 'spread',
  ]
  for (const name of containers) {
    it(`sees JSX through ${name}`, () => {
      expect(exprContainsJsx(WRAPS[name]!(view))).toBe(true)
      expect(exprContainsJsx(WRAPS[name]!(lit(1)))).toBe(false)
    })
  }

  it('sees JSX in a statement-bodied arrow; not through the kinds that cannot carry it', () => {
    const stmtArrow = { kind: 'arrow', params: [], body: undefined, stmts: [{ kind: 'expr', expr: view }, { kind: 'break' }] } as unknown as ExprIR
    expect(exprContainsJsx(stmtArrow)).toBe(true)
    expect(exprContainsJsx({ kind: 'arrow', params: [], body: undefined } as unknown as ExprIR)).toBe(false)
    expect(exprContainsJsx(WRAPS['json-stringify']!(view))).toBe(false)
  })
})

describe('expr-utils — small classifiers', () => {
  it('typeShapeKey distinguishes set / map / object and sorts union branches', () => {
    expect(typeShapeKey({ kind: 'set', element: { kind: 'string' } })).toBe('set:string')
    expect(typeShapeKey({ kind: 'map', key: { kind: 'string' }, value: { kind: 'number', float: true } })).toBe('map:string:number.f')
    expect(typeShapeKey({ kind: 'object', fields: [{ name: 'b', type: { kind: 'boolean' } }, { name: 'a', type: { kind: 'string' } }] })).toBe(
      'obj{a:string,b:boolean}',
    )
    expect(typeShapeKey({ kind: 'union', branches: [{ kind: 'string' }, { kind: 'null' }] })).toBe(
      typeShapeKey({ kind: 'union', branches: [{ kind: 'null' }, { kind: 'string' }] }),
    )
  })

  it('exprHasOptionalLink looks through index, call and paren', () => {
    expect(exprHasOptionalLink({ kind: 'index', object: id('xs'), index: lit(0), optional: true })).toBe(true)
    expect(exprHasOptionalLink({ kind: 'call', callee: { kind: 'member', object: id('a'), property: 'f', optional: true }, args: [] })).toBe(true)
    expect(exprHasOptionalLink({ kind: 'paren', inner: { kind: 'index', object: id('xs'), index: lit(0) } })).toBe(false)
    expect(exprHasOptionalLink(lit(1))).toBe(false)
  })

  it('isReReadableExpr: literal and paren yes, a call with arguments no', () => {
    expect(isReReadableExpr(lit(3))).toBe(true)
    expect(isReReadableExpr({ kind: 'paren', inner: id('a') })).toBe(true)
    expect(isReReadableExpr({ kind: 'call', callee: id('f'), args: [lit(1)] })).toBe(false)
    expect(isReReadableExpr({ kind: 'index', object: id('xs'), index: lit(0) })).toBe(false)
  })

  it('resolveForElementKey: self / id / no-id / unknown', () => {
    const structs = new Map([['Row', new Map<string, TypeIR>([['name', { kind: 'string' }]])]])
    expect(resolveForElementKey(undefined, structs)).toEqual({ kind: 'unknown' })
    expect(resolveForElementKey({ kind: 'boolean' }, structs)).toEqual({ kind: 'self' })
    expect(resolveForElementKey({ kind: 'object', fields: [{ name: 'id', type: { kind: 'number' } }] }, structs)).toEqual({ kind: 'id' })
    expect(resolveForElementKey({ kind: 'object', fields: [] }, structs)).toEqual({ kind: 'no-id', what: 'an object with fields (none)' })
    expect(resolveForElementKey({ kind: 'typeRef', name: 'Row', args: [] }, structs)).toMatchObject({ kind: 'no-id' })
    expect(resolveForElementKey({ kind: 'typeRef', name: 'Elsewhere', args: [] }, structs)).toEqual({ kind: 'unknown' })
    expect(resolveForElementKey({ kind: 'array', element: { kind: 'string' } }, structs)).toEqual({ kind: 'unknown' })
  })

  it('classifyNonBooleanLogicalOperand names map / set / object / a struct, and is silent for Promise', () => {
    expect(classifyNonBooleanLogicalOperand({ kind: 'map', key: { kind: 'string' }, value: { kind: 'string' } })).toEqual({ name: 'map' })
    expect(classifyNonBooleanLogicalOperand({ kind: 'set', element: { kind: 'string' } })).toEqual({ name: 'set' })
    expect(classifyNonBooleanLogicalOperand({ kind: 'object', fields: [] })).toEqual({ name: 'object' })
    expect(classifyNonBooleanLogicalOperand({ kind: 'typeRef', name: 'Promise', args: [] })).toBeUndefined()
    expect(classifyNonBooleanLogicalOperand({ kind: 'typeRef', name: 'Row', args: [] })).toEqual({ name: 'Row' })
  })

  it('isNumericLiteralOrNegation: `-2` and `+2` yes, `!2` and `-x` no', () => {
    expect(isNumericLiteralOrNegation({ kind: 'unary', op: '+', argument: lit(2) })).toBe(true)
    expect(isNumericLiteralOrNegation({ kind: 'unary', op: '!', argument: lit(2) })).toBe(false)
    expect(isNumericLiteralOrNegation({ kind: 'unary', op: '-', argument: id('x') })).toBe(false)
    expect(isNumericLiteralOrNegation(lit(true))).toBe(false)
  })

  it('synthTypedStructName registers a nested struct first, lifts an array of objects, and declines an empty nested shape', () => {
    const structs: StructIR[] = []
    const keys = new Map<string, string>()
    const name = synthTypedStructName(
      [
        { name: 'pos', type: { kind: 'object', fields: [{ name: 'x', type: { kind: 'number' } }] } },
        { name: 'tags', type: { kind: 'array', element: { kind: 'object', fields: [{ name: 't', type: { kind: 'string' } }] } } },
      ],
      structs,
      keys,
    )
    expect(structs.map((st) => st.name)).toEqual(['__Obj0', '__Obj1', '__Obj2'])
    expect(name).toBe('__Obj2')
    expect(synthTypedStructName([{ name: 'e', type: { kind: 'object', fields: [] } }], [], new Map())).toBeNull()
    expect(synthTypedStructName([{ name: 'e', type: { kind: 'array', element: { kind: 'object', fields: [] } } }], [], new Map())).toBeNull()
  })
})
