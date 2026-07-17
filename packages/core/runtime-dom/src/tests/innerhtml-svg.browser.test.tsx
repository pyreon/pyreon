import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { applyProp } from '../props'

// Real-Chromium lock for the SVG-sanitizer fix (downstream report, 2026-07).
// happy-dom's DOMParser round-trips SVG well enough for the unit tests, but
// the sanitized string is only useful if a REAL browser then materializes it
// as genuine `SVGElement` nodes when assigned to `innerHTML` — a shape
// happy-dom cannot faithfully prove. This asserts the actual DOM: the icon
// nodes exist AND carry the SVG namespace, while the XSS elements do not.
describe('innerHTML SVG sanitizer (real browser)', () => {
  it('a sanitized icon becomes real namespaced SVG nodes', () => {
    const { container } = mountInBrowser(h('span', null, ''))
    const span = container.querySelector('span')!
    applyProp(
      span,
      'innerHTML',
      '<svg viewBox="0 0 24 24"><path d="M4 4 L20 20"/><g><circle cx="12" cy="12" r="6"/></g></svg>',
    )
    const svg = span.querySelector('svg')
    const path = span.querySelector('path')
    const circle = span.querySelector('circle')
    expect(svg).not.toBeNull()
    expect(path).not.toBeNull()
    expect(circle).not.toBeNull()
    // The load-bearing real-browser assertion: genuine SVG geometry, not
    // inert HTMLUnknownElements. `getTotalLength` exists only on real
    // SVGGeometryElement; namespace confirms foreign-content parsing.
    expect(path).toBeInstanceOf(SVGPathElement)
    expect(svg!.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect((path as SVGPathElement).getTotalLength()).toBeGreaterThan(0)
    expect(svg!.getAttribute('viewBox')).toBe('0 0 24 24')
  })

  it('SECURITY: script/onload/javascript-href do not survive into the live DOM', () => {
    const { container } = mountInBrowser(h('span', null, ''))
    const span = container.querySelector('span')!
    applyProp(
      span,
      'innerHTML',
      '<svg onload="window.__xss=1"><script>window.__xss=1</script>' +
        '<a xlink:href="javascript:window.__xss=1"><path d="M1 1"/></a></svg>',
    )
    expect(span.querySelector('script')).toBeNull()
    expect(span.querySelector('svg')!.hasAttribute('onload')).toBe(false)
    const a = span.querySelector('a')
    if (a) expect(a.getAttribute('xlink:href') ?? '').not.toContain('javascript:')
    // the real icon element still rendered
    expect(span.querySelector('path')).toBeInstanceOf(SVGPathElement)
  })
})
