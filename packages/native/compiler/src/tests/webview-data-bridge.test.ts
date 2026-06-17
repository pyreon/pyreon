// `<WebView data={signal}>` — the live-data bridge. The data expression
// is JSON-encoded (PyreonJSON.encode / PyreonJson.encode runtime helper)
// and combined with the html/src content arg; the runtime pushes it into
// the running page (window.__pyreonData) on load + on change WITHOUT
// reloading. Accessor arrows unwrap. Content (html/src) may be static or
// dynamic and is independent of data.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = (body: string) =>
  `import { Stack, WebView } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type Point = { x: number; y: number }
export function C() {
  const points = signal<Point[]>([{ x: 1, y: 2 }])
  return (<Stack>${body}</Stack>)
}`

describe('<WebView data={…}> live-data bridge emit', () => {
  it('Swift: src + data → PyreonWebView(src:, data: PyreonJSON.encode(…))', () => {
    const r = transform(SRC('<WebView src="c.html" data={points()} />'), { target: 'swift' })
    expect(r.code).toContain('PyreonWebView(src: "c.html", data: PyreonJSON.encode(points))')
    expect(r.warnings.length).toBe(0)
  })

  it('Kotlin: src + data → PyreonWebView(src =, data = PyreonJson.encode(…))', () => {
    const r = transform(SRC('<WebView src="c.html" data={points()} />'), { target: 'kotlin' })
    expect(r.code).toContain('PyreonWebView(src = "c.html", data = PyreonJson.encode(points))')
    expect(r.warnings.length).toBe(0)
  })

  it('Swift: html + data combine', () => {
    const r = transform(SRC('<WebView html="<svg/>" data={points()} />'), { target: 'swift' })
    expect(r.code).toContain('PyreonWebView(html: "<svg/>", data: PyreonJSON.encode(points))')
  })

  it('Swift: data accessor arrow unwraps to its body', () => {
    const r = transform(SRC('<WebView src="c.html" data={() => points()} />'), { target: 'swift' })
    expect(r.code).toContain('data: PyreonJSON.encode(points)')
  })

  it('static-only WebView (no data) emits no data arg — unchanged', () => {
    const r = transform(SRC('<WebView html="<p>x</p>" />'), { target: 'swift' })
    expect(r.code).toContain('PyreonWebView(html: "<p>x</p>")')
    expect(r.code).not.toContain('data:')
  })

  it('data with NO html/src still warns + empties (data alone is meaningless)', () => {
    const r = transform(SRC('<WebView data={points()} />'), { target: 'swift' })
    expect(r.code).toContain('PyreonWebView()')
    expect(r.warnings.some((w) => w.includes('<WebView>'))).toBe(true)
  })
})
