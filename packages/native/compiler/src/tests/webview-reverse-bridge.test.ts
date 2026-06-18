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
})
