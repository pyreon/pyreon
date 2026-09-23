// `BaseEdge` / `EdgeText` (React Flow's custom-edge building blocks) lower to
// the flow runtime's own stroke + label views, and `ViewportPortal` — which has
// no native meaning — is reported by name rather than dropped silently.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (edgeBody: string, extraImport = '') => `
  import { createFlow, Flow, BaseEdge, EdgeText, getStraightPath${extraImport}, type EdgeComponentProps } from '@pyreon/flow'
  function LabelledEdge(props: EdgeComponentProps) {
    const p = getStraightPath({ sourceX: props.sourceX(), sourceY: props.sourceY(), targetX: props.targetX(), targetY: props.targetY() })
    return ${edgeBody}
  }
  export function Diagram() {
    const flow = createFlow({
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }, { id: 'b', position: { x: 200, y: 0 }, data: { label: 'B' } }],
      edges: [{ id: 'ab', source: 'a', target: 'b', type: 'labelled' }],
    })
    return <Flow instance={flow} edgeTypes={{ labelled: LabelledEdge }} />
  }
`

const compiles = (target: 'swift' | 'kotlin', code: string) => {
  if (target === 'swift' && isSwiftcAvailable()) {
    const v = validateSwiftWithStubs(code)
    expect(v.ok, v.error ?? '').toBe(true)
  }
  if (target === 'kotlin' && isKotlincAvailable()) {
    const v = validateKotlin(code)
    expect(v.ok, v.error ?? '').toBe(true)
  }
}

describe('flow BaseEdge / EdgeText / ViewportPortal', () => {
  const BASE = `<BaseEdge path={p.path} label="hi" labelX={p.labelX} labelY={p.labelY} />`
  it('BaseEdge with a label lowers to the base stroke plus the label (swift)', () => {
    const r = transform(app(BASE), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonFlowBaseEdgePath(result: PyreonFlowPathResult(svgPath:')
    expect(r.code).toContain('color: nil, width: 1.5')
    expect(r.code).toContain('PyreonFlowEdgeText(x: Double(')
    compiles('swift', r.code)
  })
  it('BaseEdge with a label lowers to the base stroke plus the label (kotlin)', () => {
    const r = transform(app(BASE), { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonFlowBaseEdgePath(result = pyreonFlowPathResultFromSvg(')
    expect(r.code).toContain('color = null')
    expect(r.code).toContain('PyreonFlowEdgeText(x = (')
    compiles('kotlin', r.code)
  })
  it('a style stroke overrides the palette', () => {
    const src = app(`<BaseEdge path={p.path} style="stroke: #ff0000; stroke-width: 3" />`)
    expect(transform(src, { target: 'swift' }).code).toContain('color: "#ff0000", width: 3')
    const k = transform(src, { target: 'kotlin' })
    expect(k.code).toContain('color = "#ff0000", width = 3.0')
    compiles('kotlin', k.code)
  })
  it('a style without a stroke draws nothing, as the web does', () => {
    const src = app(`<BaseEdge path={p.path} style="opacity: 0.5" />`)
    expect(transform(src, { target: 'swift' }).code).toContain('color: "#00000000", width: 1)')
    expect(transform(src, { target: 'kotlin' }).code).toContain('color = "#00000000", width = 1.0)')
  })
  for (const target of ['swift', 'kotlin'] as const) {
    it(`EdgeText lowers on ${target}`, () => {
      const r = transform(app(`<EdgeText x={p.labelX} y={p.labelY} label="mid" />`), { target })
      expect(r.warnings).toEqual([])
      expect(r.code).toContain('PyreonFlowEdgeText(')
      compiles(target, r.code)
    })
    it(`marker urls, a label without coordinates and ViewportPortal are reported on ${target}`, () => {
      const w = transform(app(`<BaseEdge path={p.path} markerEnd="url(#m)" label="x" />`), { target }).warnings.join('\n')
      expect(w).toContain('<BaseEdge markerEnd>')
      expect(w).toContain('needs `labelX` and `labelY`')
      const portal = transform(app(`<ViewportPortal><BaseEdge path={p.path} /></ViewportPortal>`, ', ViewportPortal'), { target })
      expect(portal.warnings.join('\n')).toContain('<ViewportPortal>')
    })
  }
})
