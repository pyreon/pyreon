import { describe, expect, it } from 'vitest'
import { configureChartWebViewHost } from '../chart-webview-lowering'
import type { ExprIR } from '../types'

type ElementIR = Extract<ExprIR, { kind: 'jsx-element' }>

const element = (props: Record<string, unknown>): { el: ElementIR; read: (e: ElementIR, n: string) => unknown } => ({
  el: { kind: 'jsx-element', tag: 'ChartWebView', attrs: Object.keys(props).map((name) => ({ kind: 'attr', name })) } as unknown as ElementIR,
  read: (_e, name) => props[name],
})

describe('ChartWebView host script inlining', () => {
  it('inlines an engine script containing string-replacement patterns verbatim', () => {
    const script = "var a = s.replace(/x/, '$&'); var b = \"$'\" + '$$';"
    const { el, read } = element({ engineScript: script })
    const html = configureChartWebViewHost(el, read, () => {})
    expect(html).toContain('<script>' + script + '</script>')
  })
})
