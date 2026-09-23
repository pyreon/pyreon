// A `<path>` in a native Flow custom edge used to lower only when its `d` was
// a path-helper result or the connection line's `path()`. Any other path data
// (a template literal, a constant) was dropped with a pointer to the WebView
// host. The runtimes now parse SVG path data themselves, so every `d` lowers,
// and the paint follows the browser's rules for an unstyled SVG path.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { resolveFlowPathPaint } from '../flow-path-paint'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const APP = `
  import { createFlow, Flow, type EdgeComponentProps } from '@pyreon/flow'
  const ARROW = 'M0 0 L10 5 L0 10 Z'
  function WireEdge(props: EdgeComponentProps) {
    return <>
      <path d={\`M \${props.sourceX()} \${props.sourceY()} L \${props.targetX()} \${props.targetY()}\`} style="fill: none; stroke: #16a34a; stroke-width: 3" />
      <path d={ARROW} />
    </>
  }
  export function Diagram() {
    const flow = createFlow({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } },
        { id: 'b', position: { x: 200, y: 80 }, data: { label: 'B' } },
      ],
      edges: [{ id: 'ab', source: 'a', target: 'b', type: 'wire' }],
    })
    return <Flow instance={flow} edgeTypes={{ wire: WireEdge }} />
  }
`

describe('arbitrary SVG path data in a native Flow renderer', () => {
  it('swift: parses the path at runtime and paints it like the browser', () => {
    const result = transform(APP, { target: 'swift' })
    expect(result.code).toContain('PyreonFlowPathResult(svgPath: ')
    // Styled: stroke and width from `style`, fill none.
    expect(result.code).toContain('color: "#16a34a", width: 3, fill: nil)')
    // Unstyled: the SVG defaults, a black fill and no stroke.
    expect(result.code).toContain('color: nil, width: 1, fill: "#000000")')
    expect(result.warnings.join('\n')).not.toContain('needs a `d` attribute')
    if (isSwiftcAvailable()) {
      const v = validateSwiftWithStubs(result.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
  })

  it('kotlin: parses the path at runtime and paints it like the browser', () => {
    const result = transform(APP, { target: 'kotlin' })
    expect(result.code).toContain('pyreonFlowPathResultFromSvg(')
    expect(result.code).toContain('color = "#16a34a", width = 3.0, fill = null)')
    expect(result.code).toContain('color = null, width = 1.0, fill = "#000000")')
    expect(result.warnings.join('\n')).not.toContain('needs a `d` attribute')
    if (isKotlincAvailable()) {
      const v = validateKotlin(result.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
  })

  it('a path with no d warns instead of drawing nothing silently', () => {
    const src = APP.replace('<path d={ARROW} />', '<path stroke="red" />')
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).warnings.some((w) => w.includes('needs a `d` attribute')), target).toBe(true)
    }
  })
})

describe('resolveFlowPathPaint', () => {
  const element = (attrs: Record<string, string | number>) => ({
    kind: 'jsx-element' as const,
    tag: 'path',
    attrs: Object.entries(attrs).map(([name, value]) => ({ kind: 'attr' as const, name, value: { kind: 'literal' as const, value } })),
    children: [],
  })

  it('uses the SVG defaults when nothing is set', () => {
    const p = resolveFlowPathPaint(element({}) as never)
    expect(p.fill).toEqual({ kind: 'literal', value: '#000000' })
    expect(p.stroke).toEqual({ kind: 'none' })
    expect(p.width).toEqual({ kind: 'literal', value: 1 })
  })

  it('reads each property from style by name, not the first colour it finds', () => {
    const p = resolveFlowPathPaint(element({ style: 'fill: #ffffff; stroke: #000000; stroke-width: 2.5' }) as never)
    expect(p.fill).toEqual({ kind: 'literal', value: '#ffffff' })
    expect(p.stroke).toEqual({ kind: 'literal', value: '#000000' })
    expect(p.width).toEqual({ kind: 'literal', value: 2.5 })
  })

  it('lets style win over the presentation attribute, as CSS does', () => {
    const p = resolveFlowPathPaint(element({ stroke: '#ff0000', style: 'stroke: #00ff00' }) as never)
    expect(p.stroke).toEqual({ kind: 'literal', value: '#00ff00' })
  })

  it('treats none and transparent as no paint, and reads attribute width forms', () => {
    const p = resolveFlowPathPaint(element({ fill: 'none', stroke: 'transparent', strokeWidth: 4 }) as never)
    expect(p.fill).toEqual({ kind: 'none' })
    expect(p.stroke).toEqual({ kind: 'none' })
    expect(p.width).toEqual({ kind: 'literal', value: 4 })
  })
})
