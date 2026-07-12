/**
 * REAL-CHROMIUM proof that an SVG-rooted `_tpl` template renders a live SVG
 * element — not an inert HTML-namespaced fake.
 *
 * happy-dom confirms `namespaceURI`, but the load-bearing property is that the
 * cloned node is a genuine `SVGPathElement` the browser will render + measure.
 * `getTotalLength()` / `getBBox()` exist ONLY on real SVG geometry elements; a
 * `<path>` mis-parsed into the HTML namespace is an `HTMLUnknownElement` with
 * neither. This is the shape an `@pyreon/flow` edge lowers to
 * (`_tpl("<g><path…")`), and it is what the `page.locator('svg path').count()`
 * flow e2e could not distinguish (a CSS type selector matches broken HTML
 * `<path>` by localName too).
 */
import { _tpl } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'

const SVG_NS = 'http://www.w3.org/2000/svg'

describe('_tpl SVG-rooted templates in real Chromium', () => {
  it('a <g><path> template mounts as a live SVGPathElement', () => {
    // Mount into a real <svg> host so the path participates in SVG layout.
    const host = document.createElementNS(SVG_NS, 'svg')
    host.setAttribute('width', '100')
    host.setAttribute('height', '100')
    document.body.appendChild(host)

    const item = _tpl('<g><path fill="none" d="M0 0 L50 50"></path></g>', () => null) as {
      el: SVGGElement
    }
    host.appendChild(item.el)

    const g = item.el
    expect(g.namespaceURI).toBe(SVG_NS)
    const path = g.firstElementChild as SVGPathElement
    expect(path.namespaceURI).toBe(SVG_NS)
    // The real-SVG discriminators — absent on an HTML-namespaced fake.
    expect(path).toBeInstanceOf(SVGPathElement)
    expect(typeof path.getTotalLength).toBe('function')
    expect(path.getTotalLength()).toBeGreaterThan(0) // M0 0 L50 50 ≈ 70.7
    expect(typeof path.getBBox).toBe('function')

    host.remove()
  })

  it('a bare <rect> (minimap dot) mounts as a live SVGRectElement', () => {
    const host = document.createElementNS(SVG_NS, 'svg')
    document.body.appendChild(host)
    const item = _tpl('<rect x="1" y="2" width="8" height="6"></rect>', () => null) as {
      el: SVGRectElement
    }
    host.appendChild(item.el)
    expect(item.el).toBeInstanceOf(SVGRectElement)
    expect(item.el.width.baseVal.value).toBe(8) // SVGAnimatedLength — SVG-only
    host.remove()
  })

  it('a plain HTML <div> template is still an HTMLDivElement', () => {
    const item = _tpl('<div class="x"></div>', () => null) as { el: HTMLElement }
    document.body.appendChild(item.el)
    expect(item.el).toBeInstanceOf(HTMLDivElement)
    item.el.remove()
  })
})
