// A raw DOM/SVG element had no native lowering and no warning: `<div>` was
// written as `div(…)`, a call that exists on neither iOS nor Android. Inside a
// `<Flow>` custom node that is the silent loss the flow parity plan forbids,
// because a DOM/CSS/SVG renderer has a supported route: `<FlowWebView>`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const FLOW_APP = `import { Flow, createFlow } from '@pyreon/flow'
import type { NodeComponentProps } from '@pyreon/flow'
function DomNode(props: NodeComponentProps<{ label: string }>) {
  return <div style="border-radius: 12px">{props.data().label}</div>
}
function SvgNode(props: NodeComponentProps<{ label: string }>) {
  return <svg width={40} height={40}><path d="M0 0 L40 40" stroke="red" /></svg>
}
function App() {
  const flow = createFlow<{ label: string }>({ nodes: [{ id: 'a', type: 'dom', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  return <Flow instance={flow} nodeTypes={{ dom: DomNode, svg: SvgNode }} />
}`

const PLAIN_APP = `import { Stack, Text } from '@pyreon/primitives'
function App() {
  return <Stack><Text>ok</Text><span>raw</span></Stack>
}`

describe('a raw DOM/SVG element is named, with its route', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: a DOM custom flow node warns and names FlowWebView`, () => {
      const warnings = transform(FLOW_APP, { target }).warnings
      const div = warnings.find((w) => w.startsWith('<div> is a DOM/SVG element'))
      expect(div, warnings.join('\n')).toBeDefined()
      expect(div).toContain('@pyreon/flow/webview')
    })

    it(`${target}: the <svg> wrapper still warns, but its <path> data now lowers natively`, () => {
      const result = transform(FLOW_APP, { target })
      expect(result.warnings.some((w) => w.startsWith('<svg> is a DOM/SVG element'))).toBe(true)
      expect(result.code).toContain(target === 'swift' ? 'PyreonFlowPathResult(svgPath: "M0 0 L40 40")' : 'pyreonFlowPathResultFromSvg("M0 0 L40 40")')
      expect(result.warnings.some((w) => w.includes('needs a `d` attribute'))).toBe(false)
    })

    it(`${target}: a raw element outside flow warns too, and a primitive does not`, () => {
      const warnings = transform(PLAIN_APP, { target }).warnings
      expect(warnings.filter((w) => w.includes('DOM/SVG element'))).toEqual([
        expect.stringContaining('<span> is a DOM/SVG element'),
      ])
    })
  }
})
