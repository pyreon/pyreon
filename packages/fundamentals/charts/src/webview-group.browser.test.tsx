/** @jsxImportSource @pyreon/core */
/**
 * `<ChartWebView group>` — connected groups across SEPARATE hosted pages
 * (real ECharts, real iframes, the real `<WebView>` primitive).
 *
 * `echarts.connect(group)` only reaches charts in ONE realm. Every hosted
 * chart is its own page, so the engine's connect can never see a sibling
 * host. The bridge relays the same action classes connect() mirrors —
 * dataZoom, legend selection, highlight/downplay, the data-anchored tooltip —
 * out of the page that performed them and into every sibling host of the same
 * group, as once-only commands. This suite drives a REAL engine event in one
 * page and asserts the sibling engine's state, so the whole loop is proven:
 * engine event → outbound bridge → parent relay → inbound bridge → sibling
 * dispatchAction. The echo guard is proven by counting sibling→origin relays.
 */
import { query } from '@pyreon/test-utils'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
// eslint-disable-next-line import/no-unresolved
import echartsScript from 'echarts/dist/echarts.min.js?raw'
import { ChartWebView, buildChartHostHtml } from './webview'

const HOST = buildChartHostHtml({ echartsScript })

interface HostedInstance {
  getOption(): { legend: { selected?: Record<string, boolean> }[]; dataZoom: { start?: number; end?: number }[] }
  dispatchAction(action: Record<string, unknown>): void
}

const option = () => ({
  legend: {},
  dataZoom: [{ type: 'slider' }],
  xAxis: { type: 'category', data: ['A', 'B', 'C', 'D'] },
  yAxis: { type: 'value' },
  series: [
    { name: 'A', type: 'bar', data: [1, 2, 3, 4] },
    { name: 'B', type: 'bar', data: [4, 3, 2, 1] },
  ],
})

async function waitForInstance(iframe: HTMLIFrameElement, timeoutMs = 8000): Promise<HostedInstance> {
  const start = performance.now()
  for (;;) {
    const win = iframe.contentWindow as
      | (Window & { echarts?: { getInstanceByDom(el: Element): HostedInstance | undefined }; __pyreonChartError?: string })
      | null
    const el = iframe.contentDocument?.getElementById('pyreon-chart') as HTMLElement | null
    if (win?.__pyreonChartError) throw new Error('host bridge error: ' + win.__pyreonChartError)
    const instance = win?.echarts && el ? win.echarts.getInstanceByDom(el) : undefined
    if (instance && el?.querySelector('canvas')) return instance
    if (performance.now() - start > timeoutMs) throw new Error('chart host did not boot')
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

const settle = async (): Promise<void> => {
  await flush()
  for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(() => r(null)))
}

async function until(predicate: () => boolean, label: string, timeoutMs = 4000): Promise<void> {
  const start = performance.now()
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

async function mountHosts(groups: (string | undefined)[]) {
  const mounted = groups.map((group) => {
    const { container, unmount } = mountInBrowser(
      h(ChartWebView as never, group === undefined ? { html: HOST, option } : { html: HOST, option, group }),
    )
    container.style.width = '400px'
    container.style.height = '300px'
    return { container, unmount }
  })
  await flush()
  const instances = await Promise.all(mounted.map(({ container }) => waitForInstance(query<HTMLIFrameElement>(container, 'iframe'))))
  return { instances, unmount: () => mounted.forEach(({ unmount }) => unmount()) }
}

describe('ChartWebView connected groups (real ECharts, separate hosted pages)', () => {
  it('mirrors a legend toggle and a dataZoom from one host into its group sibling, not into another group', async () => {
    const { instances, unmount } = await mountHosts(['dash', 'dash', 'other'])
    const [origin, sibling, outsider] = instances as [HostedInstance, HostedInstance, HostedInstance]

    // A REAL engine action in the origin page — legendToggleSelect is exactly what a user legend tap dispatches.
    origin.dispatchAction({ type: 'legendToggleSelect', name: 'A' })
    await settle()
    await until(() => sibling.getOption().legend[0]!.selected?.A === false, 'legend relay')
    expect(outsider.getOption().legend[0]!.selected?.A, 'a different group is untouched').not.toBe(false)

    origin.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 25, end: 75 })
    await settle()
    await until(() => sibling.getOption().dataZoom[0]!.start === 25, 'dataZoom relay')
    expect(sibling.getOption().dataZoom[0]!.end).toBe(75)
    expect(outsider.getOption().dataZoom[0]!.start ?? 0).toBe(0)
    unmount()
  })

  it('does not echo a relayed action back to its origin, and a host leaving the group stops receiving', async () => {
    const group = signal<string | undefined>('dash')
    const { container: a, unmount: unmountA } = mountInBrowser(h(ChartWebView as never, { html: HOST, option, group: 'dash' }))
    const { container: b, unmount: unmountB } = mountInBrowser(h(ChartWebView as never, { html: HOST, option, group: () => group() }))
    for (const c of [a, b]) {
      c.style.width = '400px'
      c.style.height = '300px'
    }
    await flush()
    const origin = await waitForInstance(query<HTMLIFrameElement>(a, 'iframe'))
    const sibling = await waitForInstance(query<HTMLIFrameElement>(b, 'iframe'))
    // Count engine actions the ORIGIN receives after its own tap — an echo
    // would arrive as a second legendUnSelect dispatch.
    let originDispatches = 0
    const originDispatch = origin.dispatchAction.bind(origin)
    origin.dispatchAction = (action) => {
      originDispatches += 1
      originDispatch(action)
    }
    origin.dispatchAction({ type: 'legendToggleSelect', name: 'B' })
    await settle()
    await until(() => sibling.getOption().legend[0]!.selected?.B === false, 'legend relay')
    await settle()
    expect(originDispatches, 'the origin only saw its own action, never an echo').toBe(1)

    // Leave the group: later origin actions no longer reach the former sibling.
    group.set(undefined)
    await settle()
    origin.dispatchAction({ type: 'legendToggleSelect', name: 'A' })
    await settle()
    await settle()
    expect(sibling.getOption().legend[0]!.selected?.A, 'left the group → no relay').not.toBe(false)
    unmountA()
    unmountB()
  })
})
