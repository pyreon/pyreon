// `<WebView>` primitive emit — the native host (WKWebView / Android
// WebView via PyreonWebView) for embedding web-only-rich viz (charts /
// flow / tables) inside a native shell. `html` (inline) or `src` (local
// asset / remote URL); html wins if both set.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const APP = (body: string) =>
  `import { Stack, WebView } from '@pyreon/primitives'
export function App() { return <Stack>${body}</Stack> }`

describe('<WebView> primitive emit', () => {
  describe('Swift', () => {
    it('src → PyreonWebView(src:)', () => {
      expect(transform(APP(`<WebView src="chart.html" />`), { target: 'swift' }).code).toContain(
        'PyreonWebView(src: "chart.html")',
      )
    })
    it('html → PyreonWebView(html:)', () => {
      expect(transform(APP(`<WebView html="<p>hi</p>" />`), { target: 'swift' }).code).toContain(
        'PyreonWebView(html: "<p>hi</p>")',
      )
    })
    it('html wins over src', () => {
      const out = transform(APP(`<WebView html="<p>x</p>" src="y.html" />`), {
        target: 'swift',
      }).code
      expect(out).toContain('PyreonWebView(html: "<p>x</p>")')
      expect(out).not.toContain('PyreonWebView(src:')
    })
  })

  describe('Kotlin', () => {
    it('src → PyreonWebView(src = …)', () => {
      expect(transform(APP(`<WebView src="chart.html" />`), { target: 'kotlin' }).code).toContain(
        'PyreonWebView(src = "chart.html")',
      )
    })
    it('html → PyreonWebView(html = …)', () => {
      expect(transform(APP(`<WebView html="<p>hi</p>" />`), { target: 'kotlin' }).code).toContain(
        'PyreonWebView(html = "<p>hi</p>")',
      )
    })
  })

  it('a dynamic (non-static) WebView emits the expression (reactive reload)', () => {
    // Superseded contract: a dynamic `src={expr}` used to warn + emit an
    // empty PyreonWebView(); now the expression is emitted so the WebView
    // reloads reactively when it changes (full coverage in
    // webview-dynamic.test.ts). Only a WebView with NO html/src still
    // warns + empties.
    //
    // A genuinely-dynamic src is a SIGNAL read — a `const u = "x"` literal
    // is now STATIC-resolved (next test), so the dynamic path uses a signal.
    const r = transform(
      `import { WebView } from '@pyreon/primitives'
       export function App() { const u = signal("x"); return <WebView src={u()} /> }`,
      { target: 'swift' },
    )
    expect(r.code).toContain('PyreonWebView(src: u)')
    expect(r.code).not.toContain('PyreonWebView()')
    expect(r.warnings.length).toBe(0)
  })

  it('a component-scope const literal src is STATIC-resolved (component-const widening)', () => {
    // `const u = "x"; <WebView src={u} />` — `u` is a compile-time constant,
    // so the static-attr resolver bakes it (consistent with a module-level
    // const + an inline literal) instead of the runtime reference.
    const r = transform(
      `import { WebView } from '@pyreon/primitives'
       export function App() { const u = "x"; return <WebView src={u} /> }`,
      { target: 'swift' },
    )
    expect(r.code).toContain('PyreonWebView(src: "x")')
    expect(r.warnings.length).toBe(0)
  })
})
