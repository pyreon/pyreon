// Regression: `_tpl()` must parse an SVG-rooted template string in the SVG
// namespace, not the HTML namespace.
//
// The compiler lowers a DOM subtree with ≥1 element to a `_tpl("<…>")` call.
// An `@pyreon/flow` edge is `<g><path d={…}/>…</g>`, which lowers to
// `_tpl("<g><path…></path><!></g>", …)`. Before the fix, `template.innerHTML`
// parsed that string as HTML — `<g>`/`<path>` became inert HTMLUnknownElements
// in the XHTML namespace, so edges (and minimap node dots, which are separate
// `<rect>`-rooted templates) rendered NOTHING while the container `<svg>` — not
// templatized because it has reactive `<For>` children — rendered fine. That
// asymmetry is why "nodes show, lines don't."
//
// This asserts the ACTUAL namespace, not a `querySelector('path')` count: a CSS
// type selector matches by localName in an HTML document, so it counts the
// broken HTML-namespaced <path> too — exactly what masked this bug in the flow
// e2e (`page.locator('svg path').count()`).
import { describe, expect, it } from 'vitest'
import { _tpl } from '../template'

const SVG_NS = 'http://www.w3.org/2000/svg'
const HTML_NS = 'http://www.w3.org/1999/xhtml'

describe('_tpl — SVG-rooted templates are SVG-namespaced', () => {
  it('the flow edge shape <g><path> is SVG, descendants too', () => {
    const item = _tpl('<g><path fill="none"></path><!></g>', () => null) as {
      el: Element
    }
    expect(item.el.namespaceURI).toBe(SVG_NS)
    const path = item.el.firstElementChild!
    expect(path.namespaceURI).toBe(SVG_NS)
    expect(path instanceof (globalThis as unknown as { SVGElement: typeof Element }).SVGElement).toBe(
      true,
    )
  })

  it('a minimap node dot <rect> is SVG', () => {
    const item = _tpl('<rect x="1" y="2" width="3" height="4"></rect>', () => null) as {
      el: Element
    }
    expect(item.el.namespaceURI).toBe(SVG_NS)
  })

  it('a camelCase SVG tag <linearGradient> is SVG', () => {
    const item = _tpl('<linearGradient><stop></stop></linearGradient>', () => null) as {
      el: Element
    }
    expect(item.el.namespaceURI).toBe(SVG_NS)
    expect(item.el.firstElementChild!.namespaceURI).toBe(SVG_NS)
  })

  it('an HTML <div> template is unchanged (still HTML)', () => {
    const item = _tpl('<div class="x"><span> </span></div>', () => null) as { el: Element }
    expect(item.el.namespaceURI).toBe(HTML_NS)
  })

  it('an already-<svg>-rooted template still works (never broken)', () => {
    const item = _tpl('<svg><rect></rect></svg>', () => null) as { el: Element }
    expect(item.el.namespaceURI).toBe(SVG_NS)
    expect(item.el.firstElementChild!.namespaceURI).toBe(SVG_NS)
  })

  it('the HTML-collision tag <title> stays HTML (not SVG-wrapped)', () => {
    const item = _tpl('<title>Page</title>', () => null) as { el: Element }
    expect(item.el.namespaceURI).toBe(HTML_NS)
  })

  it('reactive binding into a cloned SVG node works (setAttribute path)', () => {
    // Prove the cloned SVG root is a real element the binder can write to —
    // the flow edge sets `d` reactively. `bind` receives the cloned root.
    let bound: Element | null = null
    const item = _tpl('<path fill="none"></path>', (root) => {
      bound = root as unknown as Element
      ;(root as unknown as Element).setAttribute('d', 'M0 0 L10 10')
      return null
    }) as { el: Element }
    expect(bound).toBe(item.el)
    expect(item.el.getAttribute('d')).toBe('M0 0 L10 10')
    expect(item.el.namespaceURI).toBe(SVG_NS)
  })
})
