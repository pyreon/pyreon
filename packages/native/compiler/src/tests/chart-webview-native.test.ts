import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildChartHostHtml } from '../../../../fundamentals/charts/src/webview'
import { transform } from '../index'
import { DEFAULT_CHART_WEBVIEW_HOST_HTML } from '../generated-chart-webview-host'
import { HANDLED_CHART_WEBVIEW_PROPS } from '../chart-webview-lowering'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SOURCE = `
import { ChartWebView as HostedChart } from '@pyreon/charts/webview'
export function App(props: { option: any; loading: boolean }) {
  return <HostedChart option={props.option}
    commands={[{ id: 'restore', type: 'restore' }]}
    loading={props.loading}
    loadingOptions={{ text: 'Loading' }}
    group="dashboard"
    background="#101820"
    onSelect={(selection) => console.log(selection.name)}
    onEvent={(event) => console.log(event.name)}
    onError={(error) => console.log(error.message)} />
}`

describe('@pyreon/charts/webview native lowering', () => {
  it('keeps the generated default host byte-identical to the web builder', () => {
    expect(DEFAULT_CHART_WEBVIEW_HOST_HTML).toBe(buildChartHostHtml())
    const generator = readFileSync(
      new URL('../../../../../scripts/gen-chart-webview-host.ts', import.meta.url),
      'utf8',
    )
    expect(generator).toContain('buildChartHostHtml()')
  })

  it('tracks every public hosted-chart prop in both native emitters', () => {
    const source = readFileSync(
      new URL('../../../../fundamentals/charts/src/webview.ts', import.meta.url),
      'utf8',
    )
    const start = source.indexOf('export interface ChartWebViewProps')
    const body = source.slice(start, source.indexOf('\n}', start))
    const publicProps = [...body.matchAll(/^  ([A-Za-z_]\w*)\??:/gm)]
      .map((match) => match[1]!)
      .sort()
    expect([...HANDLED_CHART_WEBVIEW_PROPS].sort()).toEqual(publicProps)
  })

  it.each(['swift', 'kotlin'] as const)('lowers the aliased public component on %s', (target) => {
    const result = transform(SOURCE, { target })
    expect(result.warnings).toEqual([])
    expect(result.code).not.toContain('HostedChart(')
    expect(result.code).toContain('PyreonWebView(')
    expect(result.code).toContain('background:#101820')
    expect(result.code).toContain('pyreonChartWebViewData(')
    // Connected group: the envelope carries the group name so the hosted page
    // joins it and relays the mirrored action classes through the bridge.
    expect(result.code).toContain(target === 'swift' ? 'group: "dashboard"' : 'group = "dashboard"')
    expect(result.code).toContain('pyreonDispatchChartWebViewMessage(')
    if (target === 'swift' && isSwiftcAvailable()) {
      expect(validateSwiftWithStubs(result.code)).toMatchObject({ ok: true })
    }
    if (target === 'kotlin' && isKotlincAvailable()) {
      expect(validateKotlin(result.code)).toMatchObject({ ok: true })
    }
  })

  it.each(['swift', 'kotlin'] as const)('honours explicit host HTML on %s', (target) => {
    const result = transform(
      `
      import { ChartWebView } from '@pyreon/charts/webview'
      export function App(props: { html: string; option: any }) {
        return <ChartWebView html={props.html} option={props.option} />
      }`,
      { target },
    )
    expect(result.warnings).toEqual([])
    expect(result.code).toContain(target === 'swift' ? 'html: html' : 'html = html')
  })

  it.each(['swift', 'kotlin'] as const)(
    'does not intercept a same-named component from another module on %s',
    (target) => {
      const result = transform(
        `
        import { ChartWebView } from './widgets'
        export function App() { return <ChartWebView option={{}} /> }`,
        { target },
      )
      expect(result.code).toContain('ChartWebView(')
      expect(result.code).not.toContain('pyreonChartWebViewData(')
    },
  )
})
