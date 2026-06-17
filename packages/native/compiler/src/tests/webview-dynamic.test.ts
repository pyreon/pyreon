// `<WebView>` dynamic (signal-derived) html/src — the first slice of the
// native↔WebView data bridge. Previously a non-static html/src warned +
// emitted an empty `PyreonWebView()`; now the expression is emitted so
// the WebView reloads REACTIVELY when the value changes (SwiftUI
// re-renders → updateUIView reloads; Compose recomposes → AndroidView
// update reloads). Makes `<WebView html={() => buildChart(data())}>` a
// live, data-driven chart hosted natively (reload-based; the smooth
// no-reload data PUSH bridge is the next slice). A zero-param accessor
// arrow unwraps to its body.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = (body: string) =>
  `import { Stack, WebView } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
export function C() {
  const data = signal('x')
  const chartHtml = computed(() => '<svg>' + data() + '</svg>')
  return (<Stack>${body}</Stack>)
}`

describe('<WebView> dynamic html/src emit', () => {
  it('Swift: static html unchanged; dynamic signal-read emits the expr (no warning)', () => {
    const r = transform(SRC('<WebView html="<p>s</p>" /><WebView html={chartHtml()} />'), {
      target: 'swift',
    })
    expect(r.code).toContain('PyreonWebView(html: "<p>s</p>")')
    expect(r.code).toContain('PyreonWebView(html: chartHtml)')
    expect(r.warnings.length).toBe(0)
  })

  it('Swift: dynamic src emits the expr', () => {
    const r = transform(SRC('<WebView src={chartHtml()} />'), { target: 'swift' })
    expect(r.code).toContain('PyreonWebView(src: chartHtml)')
  })

  it('Swift: zero-param accessor arrow unwraps to its body', () => {
    const r = transform(SRC("<WebView html={() => '<p>' + data() + '</p>'} />"), {
      target: 'swift',
    })
    expect(r.code).toContain("PyreonWebView(html: \"<p>\" + data + \"</p>\")")
    expect(r.code).not.toContain('PyreonWebView()')
  })

  it('Kotlin: dynamic html/src emit the expr (no warning)', () => {
    const r = transform(SRC('<WebView html={chartHtml()} /><WebView src={chartHtml()} />'), {
      target: 'kotlin',
    })
    expect(r.code).toContain('PyreonWebView(html = chartHtml)')
    expect(r.code).toContain('PyreonWebView(src = chartHtml)')
    expect(r.warnings.length).toBe(0)
  })

  it('both: a WebView with NO html/src still warns + empty', () => {
    const sw = transform(SRC('<WebView />'), { target: 'swift' })
    expect(sw.code).toContain('PyreonWebView()')
    expect(sw.warnings.some((w) => w.includes('<WebView>'))).toBe(true)
  })
})
