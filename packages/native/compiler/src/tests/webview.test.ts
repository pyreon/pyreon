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

  it('a dynamic (non-static) WebView warns + emits an empty PyreonWebView()', () => {
    // `src={someVar}` isn't a static string — v1 needs a literal; warn + bail.
    const r = transform(
      `import { WebView } from '@pyreon/primitives'
       export function App() { const u = "x"; return <WebView src={u} /> }`,
      { target: 'swift' },
    )
    expect(r.code).toContain('PyreonWebView()')
    expect(r.warnings.some((w) => w.includes('<WebView>') && w.includes('static'))).toBe(true)
  })
})
