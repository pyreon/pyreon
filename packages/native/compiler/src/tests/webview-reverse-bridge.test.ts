// `<WebView onMessage={(m) => …}>` — the reverse bridge. The hosted page
// sends a string back via the unified `window.pyreonPostMessage(...)` API;
// the handler is emitted as a native `(String) -> Void` / `(String) ->
// Unit` closure (iOS WKScriptMessageHandler / Android @JavascriptInterface
// under the hood). Combines with the forward `data` push.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = (body: string) =>
  `import { Stack, WebView } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C() {
  const sel = signal('')
  return (<Stack>${body}</Stack>)
}`

describe('<WebView onMessage={…}> reverse-bridge emit', () => {
  it('Swift: onMessage arrow → onMessage: { m in … }', () => {
    const r = transform(SRC('<WebView html="<svg/>" onMessage={(m) => sel.set(m)} />'), {
      target: 'swift',
    })
    expect(r.code).toContain('PyreonWebView(html: "<svg/>", onMessage: { m in sel = m })')
    expect(r.warnings.length).toBe(0)
  })

  it('Kotlin: onMessage arrow → onMessage = { m -> … }', () => {
    const r = transform(SRC('<WebView html="<svg/>" onMessage={(m) => sel.set(m)} />'), {
      target: 'kotlin',
    })
    expect(r.code).toContain('PyreonWebView(html = "<svg/>", onMessage = { m -> sel = m })')
    expect(r.warnings.length).toBe(0)
  })

  it('Swift: data + onMessage combine (both bridges on one WebView)', () => {
    const r = transform(
      SRC('<WebView src="c.html" data={sel()} onMessage={(m) => sel.set(m)} />'),
      { target: 'swift' },
    )
    expect(r.code).toContain(
      'PyreonWebView(src: "c.html", data: PyreonJSON.encode(sel), onMessage: { m in sel = m })',
    )
  })

  it('Kotlin: data + onMessage combine', () => {
    const r = transform(
      SRC('<WebView src="c.html" data={sel()} onMessage={(m) => sel.set(m)} />'),
      { target: 'kotlin' },
    )
    expect(r.code).toContain(
      'PyreonWebView(src = "c.html", data = PyreonJson.encode(sel), onMessage = { m -> sel = m })',
    )
  })

  it('Swift: zero-param handler ignores the message (_ in)', () => {
    const r = transform(SRC('<WebView html="<x/>" onMessage={() => sel.set("hit")} />'), {
      target: 'swift',
    })
    expect(r.code).toContain('onMessage: { _ in sel = "hit" }')
  })

  it('static-only WebView (no onMessage) emits no onMessage arg — unchanged', () => {
    const r = transform(SRC('<WebView html="<p>x</p>" />'), { target: 'swift' })
    expect(r.code).toContain('PyreonWebView(html: "<p>x</p>")')
    expect(r.code).not.toContain('onMessage:')
  })

  it.each(['swift', 'kotlin'] as const)('block-bodied onMessage emits every statement; data-testid reaches the host on %s', (target) => {
    // Same silent-drop class the hosted Flow/Chart components had: a block
    // body parses to `stmts`, and the message-handler emitter read only `body`.
    const result = transform(
      `
      import { WebView } from '@pyreon/primitives'
      import { signal } from '@pyreon/reactivity'
      export function App() {
        const last = signal('none')
        const count = signal(0)
        return <WebView src="bridge.html" data-testid="toolkit-webview" onMessage={(m) => {
          last.set(m)
          count.set(count() + 1)
        }} />
      }`,
      { target },
    )
    expect(result.warnings).toEqual([])
    expect(result.code).toContain('last = m')
    expect(result.code).toContain('count = count + 1')
    expect(result.code).toContain(target === 'swift' ? '.accessibilityIdentifier("toolkit-webview")' : 'modifier = Modifier.testTag("toolkit-webview")')
  })
})
