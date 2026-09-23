// An inline `<svg>` inside a native Flow node or edge renderer used to fall
// through to the generic emit with the "DOM/SVG element, use <FlowWebView>"
// warning. It now lowers: every shape becomes path data the runtime parses,
// with SVG paint inheritance. Outside a Flow renderer an `<svg>` is ordinary
// web markup and keeps its warning.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { planFlowSvg } from '../flow-svg'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const APP = `
  import { createFlow, Flow, Handle, type NodeComponentProps } from '@pyreon/flow'
  function IconNode(props: NodeComponentProps) {
    return <Stack>
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <g stroke="#dc2626">
          <line x1="0" y1="0" x2={props.selected() ? 24 : 12} y2="24" />
          <polyline points="1,1 5,5 9,1" />
        </g>
        <polygon points="2,22 12,2 22,22" fill="#2563eb" />
        <ellipse cx="12" cy="12" rx="6" ry="3" />
        <path d="M 2 12 H 22" />
        <title>Icon</title>
      </svg>
      <Handle type="source" position="right" />
    </Stack>
  }
  export function Diagram() {
    const flow = createFlow({
      nodes: [{ id: 'a', type: 'icon', position: { x: 0, y: 0 }, data: { size: 20 } }],
      edges: [],
    })
    return <Flow instance={flow} nodeTypes={{ icon: IconNode }} />
  }
`

const SVG_WARNING = 'is a DOM/SVG element with no native lowering'

describe('inline <svg> in a native Flow renderer', () => {
  it('swift: lowers every shape to a drawn path, with inherited paint', () => {
    const result = transform(APP, { target: 'swift' })
    expect(result.code).toContain('PyreonFlowSvg(width: 24, height: 24, viewBox: [0, 0, 24, 24], shapes: [')
    // circle: four relative quarter arcs, no arithmetic on its attributes
    expect(result.code).toContain('PyreonFlowPathResult(svgPath: "M 12 12 m -10 0 a 10 10 0 0 0 10 10 a 10 10 0 0 0 10 -10 a 10 10 0 0 0 -10 -10 a 10 10 0 0 0 -10 10 Z")')
    // the svg's fill="none" + stroke inherit; the <g> overrides the stroke
    expect(result.code).toContain('stroke: "#16a34a", strokeWidth: 2, fill: nil)')
    expect(result.code).toContain('stroke: "#dc2626", strokeWidth: 2, fill: nil)')
    // polygon's own fill beats the inherited none
    expect(result.code).toContain('stroke: "#16a34a", strokeWidth: 2, fill: "#2563eb")')
    // a dynamic coordinate is interpolated, not dropped
    expect(result.code).toMatch(/svgPath: "M 0 0 L \\\(.*selected.*\) 24"/)
    expect(result.warnings.join('\n')).not.toContain(SVG_WARNING)
    if (isSwiftcAvailable()) {
      const v = validateSwiftWithStubs(result.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
  })

  it('kotlin: lowers every shape to a drawn path, with inherited paint', () => {
    const result = transform(APP, { target: 'kotlin' })
    expect(result.code).toContain('PyreonFlowSvg(width = 24.0, height = 24.0, viewBox = listOf(0.0, 0.0, 24.0, 24.0), shapes = listOf(')
    expect(result.code).toContain('stroke = "#dc2626", strokeWidth = 2.0, fill = null)')
    expect(result.code).toContain('fill = "#2563eb")')
    expect(result.warnings.join('\n')).not.toContain(SVG_WARNING)
    if (isKotlincAvailable()) {
      const v = validateKotlin(result.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
  })

  it('outside a Flow renderer an <svg> keeps the web-markup warning', () => {
    const src = `
      export function Plain() {
        return <svg width={10} height={10}><circle cx="5" cy="5" r="4" /></svg>
      }
    `
    for (const target of ['swift', 'kotlin'] as const) {
      const result = transform(src, { target })
      expect(result.code, target).not.toContain('PyreonFlowSvg')
      expect(result.warnings.join('\n'), target).toContain(SVG_WARNING)
    }
  })

  it('names what it cannot lower instead of dropping it silently', () => {
    const src = APP.replace('<title>Icon</title>', '<text x="1" y="1">hi</text><linearGradient id="g" />')
      .replace('<g stroke="#dc2626">', '<g stroke="#dc2626" transform="rotate(45)">')
    const warnings = transform(src, { target: 'swift' }).warnings.join('\n')
    expect(warnings).toContain('<text> inside a native Flow <svg> has no lowering')
    expect(warnings).toContain('<linearGradient> inside a native Flow <svg> has no lowering')
    expect(warnings).toContain('<g transform> is not applied natively')
  })
})

describe('planFlowSvg', () => {
  const svg = (children: string) => {
    const code = `import { Flow } from '@pyreon/flow'\nfunction N() { return <svg width={10} height={10}>${children}</svg> }\nexport function D() { return <Flow instance={f} nodeTypes={{ n: N }} /> }`
    return code
  }
  const plan = (children: string) => {
    // Parse through the real transform pipeline's IR by grabbing the element.
    const el = findSvg(svg(children))
    return planFlowSvg(el)
  }

  it('rounds a literal rect with clamped radii and keeps square corners for a dynamic one', () => {
    const rounded = plan('<rect width="10" height="4" rx="9" />').shapes[0]!.d
    // rx clamps to width/2 = 5 and ry follows rx then clamps to height/2 = 2
    expect(rounded).toEqual({ kind: 'literal', value: 'M 0 0 m 5 0 h 0 a 5 2 0 0 1 5 2 v 0 a 5 2 0 0 1 -5 2 h 0 a 5 2 0 0 1 -5 -2 v 0 a 5 2 0 0 1 5 -2 Z' })
    const dynamic = plan('<rect width={w} height="4" rx="1" />')
    expect(dynamic.warnings.join('\n')).toContain('keeps square corners')
  })

  it('an ellipse with only rx uses it for ry, as SVG 2 does', () => {
    const d = plan('<ellipse cx="5" cy="5" rx="3" />').shapes[0]!.d
    expect(d).toEqual({ kind: 'literal', value: 'M 5 5 m -3 0 a 3 3 0 0 0 3 3 a 3 3 0 0 0 3 -3 a 3 3 0 0 0 -3 -3 a 3 3 0 0 0 -3 3 Z' })
  })

  it('warns when no size is given, since the web would size from the container', () => {
    const code = `import { Flow } from '@pyreon/flow'\nfunction N() { return <svg viewBox="0 0 4 4"><rect width="4" height="4" /></svg> }\nexport function D() { return <Flow instance={f} nodeTypes={{ n: N }} /> }`
    expect(planFlowSvg(findSvgIn(code)).warnings.join('\n')).toContain('draws at 300 wide')
  })
})

import { parsePyreon } from '../parse'

function findSvgIn(code: string) {
  const parsed = parsePyreon(code, 'x.tsx')
  let found: unknown
  const visit = (n: unknown): void => {
    if (found || n === null || typeof n !== 'object') return
    const node = n as { kind?: string; tag?: string }
    if (node.kind === 'jsx-element' && node.tag === 'svg') {
      found = n
      return
    }
    for (const v of Object.values(n)) visit(v)
  }
  visit(parsed)
  if (!found) throw new Error('no <svg> in fixture')
  return found as Parameters<typeof planFlowSvg>[0]
}
const findSvg = findSvgIn
