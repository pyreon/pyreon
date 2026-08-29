import { describe, expect, it } from 'vitest'
import { buildChartHostHtml } from './webview'

/**
 * A host page that cannot start REPORTS it, instead of leaving a blank frame.
 *
 * The page already knew: it set `window.__pyreonChartError` and returned. But
 * that flag lives inside the very frame nobody on the host can read from, so
 * every target showed an empty box with the diagnosis stranded one origin away.
 * On a device that is the hardest possible failure to debug.
 *
 * The reverse bridge was already there for ordinary events; a failure to start
 * is the one message that most needs it.
 *
 * Driven through a RAW iframe rather than `<WebView>`, so this stays a test of
 * the generated PAGE (what changed) and charts needs no dependency on
 * @pyreon/primitives to make its own assertion.
 */
describe('chart host page — engine missing', () => {
  it('posts an {error} back to the host rather than failing silently', async () => {
    // No `echartsScript`, and a src that resolves to nothing — the real shape
    // of a bundled page shipped without its engine.
    const html = buildChartHostHtml({ echartsSrc: 'about:blank#missing' })

    const received: string[] = []
    const frame = document.createElement('iframe')
    frame.srcdoc = html
    document.body.appendChild(frame)

    // Install the reverse bridge the way a host does — on load, i.e. AFTER the
    // page's own script has already run. That ordering is the point: reporting
    // once and giving up put the message back where it started.
    frame.addEventListener('load', () => {
      const win = frame.contentWindow as (Window & { pyreonPostMessage?: (m: unknown) => void }) | null
      if (win) win.pyreonPostMessage = (m: unknown): void => void received.push(String(m))
    })

    const start = Date.now()
    while (received.length === 0) {
      if (Date.now() - start > 6000) throw new Error('no error report arrived within 6s')
      await new Promise((r) => setTimeout(r, 20))
    }
    const payload = JSON.parse(received[0] as string) as { error?: string }
    expect(payload.error).toContain('echarts')
    frame.remove()
  })
})
