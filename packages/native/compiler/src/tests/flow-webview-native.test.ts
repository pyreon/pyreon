import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildFlowHostHtml } from '../../../../fundamentals/flow/src/webview'
import { transform } from '../index'
import { DEFAULT_FLOW_WEBVIEW_HOST_HTML } from '../generated-flow-webview-host'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SOURCE = `
import { FlowWebView as HostedFlow } from '@pyreon/flow/webview'
export function App(props: { graph: any }) {
  return <HostedFlow graph={props.graph} commands={[{ id: 'fit', type: 'fit-view' }]} nodeWidth={180} background="#101820"
    onSelect={(selection) => console.log(selection.id)}
    onEvent={(event) => console.log(event.type)}
    onError={(error) => console.log(error.message)} />
}`

describe('@pyreon/flow/webview native lowering', () => {
  it('keeps the generated default host byte-identical to the web builder', () => {
    expect(DEFAULT_FLOW_WEBVIEW_HOST_HTML).toBe(buildFlowHostHtml())
    const generator = readFileSync(
      new URL('../../../../../scripts/gen-flow-webview-host.ts', import.meta.url),
      'utf8',
    )
    expect(generator).toContain('buildFlowHostHtml()')
  })

  it.each(['swift', 'kotlin'] as const)('lowers the aliased public component on %s', (target) => {
    const result = transform(SOURCE, { target })
    expect(result.warnings).toEqual([])
    expect(result.code).not.toContain('HostedFlow(')
    expect(result.code).toContain('PyreonWebView(')
    expect(result.code).toContain('var NODE_W = 180, NODE_H = 44;')
    expect(result.code).toContain('background:#101820')
    expect(result.code).toContain('pyreonFlowWebViewData(')
    expect(result.code).toContain('pyreonDispatchFlowWebViewMessage(')
    if (target === 'swift' && isSwiftcAvailable()) {
      expect(validateSwiftWithStubs(result.code)).toMatchObject({ ok: true })
    }
    if (target === 'kotlin' && isKotlincAvailable()) {
      expect(validateKotlin(result.code)).toMatchObject({ ok: true })
    }
  })

  it.each(['swift', 'kotlin'] as const)(
    'honours explicit html and diagnoses dynamic styling on %s',
    (target) => {
      const result = transform(
        `
      import { FlowWebView } from '@pyreon/flow/webview'
      export function App(props: { html: string; color: string }) {
        return <FlowWebView html={props.html} graph={{ nodes: [], edges: [] }} nodeFill={props.color} />
      }`,
        { target },
      )
      expect(result.code).toContain(target === 'swift' ? 'html: html' : 'html = html')
      expect(result.warnings.join('\n')).toContain('nodeFill')
    },
  )
})
