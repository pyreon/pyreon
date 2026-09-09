/**
 * Namespaced JSX attributes (`xlink:href`, `xml:lang`) — real Chromium.
 *
 * REAL BROWSER, and this is the one file that can prove any of it: **happy-dom
 * MASKS the entire bug class.** Measured — a plain `setAttribute('xlink:href',
 * v)` in happy-dom reports `namespaceURI === 'http://www.w3.org/1999/xlink'`,
 * i.e. it auto-namespaces by PREFIX. Chromium does not: it creates a
 * NULL-namespace attribute whose localName is the literal string `xlink:href`,
 * which an SVG `<use>` ignores. So in happy-dom the broken code and the fixed
 * code are indistinguishable, which is exactly why this shipped.
 *
 * The load-bearing assertion is `getBBox().width`. A `<use>` whose href does not
 * resolve still EXISTS, still carries the attribute, and still passes every
 * `getAttribute` check — only the rendered box tells the truth. An assertion on
 * attribute presence would pass against the broken build.
 *
 * The compiled shapes below are HAND-WRITTEN, following this directory's
 * established pattern (`mount-hole-adoption.browser.test.tsx`): `@pyreon/compiler`
 * pulls oxc-parser's native/wasm binding and cannot load in the page. They are
 * not guesses — the happy-dom twin `namespaced-attributes.test.tsx` asserts that
 * `transformJSX` emits these EXACT strings on both backends, so a drift on the
 * compiler side fails there.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import {
  _bindDirect,
  _setAttr,
  _tpl,
  foreignAttrNamespace,
  hydrateRoot,
  mount,
  mountChild,
} from '../index'

const XLINK = 'http://www.w3.org/1999/xlink'
const XML = 'http://www.w3.org/XML/1998/namespace'
const XMLNS = 'http://www.w3.org/2000/xmlns/'
const SVG_NS = 'http://www.w3.org/2000/svg'

/** A `<defs>` the sprite `<use>` can resolve against. */
function withSprite(container: HTMLElement): void {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.innerHTML =
    '<defs><symbol id="icon" viewBox="0 0 10 10">' +
    '<rect width="10" height="10" fill="red"/></symbol></defs>'
  container.appendChild(svg)
}

function host(): HTMLDivElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

const shapeOf = (el: Element): string => {
  const a = el.attributes[0]!
  return `${a.namespaceURI}|${a.prefix}|${a.localName}|${a.name}|${a.value}`
}

// Emitted shape of: <svg width="100" height="100"><use xlink:href="#icon"/></svg>
const STATIC_TPL = '<svg width="100" height="100"><use xlink:href="#icon"></use></svg>'

describe('compiled template path — the SVG sprite idiom', () => {
  it('STATIC: the baked name is namespaced by the parser and the sprite RENDERS', () => {
    const c = host()
    withSprite(c)
    const cleanup = mountChild(
      _tpl(STATIC_TPL, () => null) as never,
      c,
    )
    const use = c.querySelector('use')!
    expect(use.attributes[0]!.namespaceURI).toBe(XLINK)
    expect(use.attributes[0]!.localName).toBe('href')
    expect((use as SVGUseElement).href.baseVal).toBe('#icon')
    // Broken build: 0. The attribute is present either way.
    expect((use as SVGGraphicsElement).getBBox().width).toBe(100)
    cleanup?.()
    c.remove()
  })

  it('DYNAMIC: _setAttr resolves the namespace, so the sprite renders AND reacts', () => {
    const c = host()
    withSprite(c)
    const id = signal('#icon')
    const cleanup = mountChild(
      _tpl('<svg width="100" height="100"><use></use></svg>', (__root) => {
        const __e0 = __root.firstElementChild!
        return _bindDirect(id, (v) => _setAttr(__e0, 'xlink:href', v as string))
      }) as never,
      c,
    )
    const use = c.querySelector('use')!
    expect(use.attributes[0]!.namespaceURI).toBe(XLINK)
    expect((use as SVGUseElement).href.baseVal).toBe('#icon')
    expect((use as SVGGraphicsElement).getBBox().width).toBe(100)

    // Templatizing must not have cost the binding its reactivity.
    id.set('#missing')
    expect((use as SVGUseElement).href.baseVal).toBe('#missing')
    id.set('#icon')
    expect((use as SVGUseElement).href.baseVal).toBe('#icon')
    expect((use as SVGGraphicsElement).getBBox().width).toBe(100)
    cleanup?.()
    c.remove()
  })

  it('STATIC and DYNAMIC produce a BYTE-IDENTICAL attribute shape', () => {
    const a = host()
    const cleanA = mountChild(_tpl(STATIC_TPL, () => null) as never, a)
    const b = host()
    const id = signal('#icon')
    const cleanB = mountChild(
      _tpl('<svg width="100" height="100"><use></use></svg>', (__root) => {
        const __e0 = __root.firstElementChild!
        return _bindDirect(id, (v) => _setAttr(__e0, 'xlink:href', v as string))
      }) as never,
      b,
    )
    expect(shapeOf(b.querySelector('use')!)).toBe(shapeOf(a.querySelector('use')!))
    cleanA?.(); cleanB?.(); a.remove(); b.remove()
  })

  it('xml:lang: XML namespace inside SVG, NULL on an HTML element', () => {
    const a = host()
    const cleanA = mountChild(_tpl('<svg><text xml:lang="cs">x</text></svg>', () => null) as never, a)
    const t = a.querySelector('text')!
    expect(t.attributes[0]!.namespaceURI).toBe(XML)
    expect(t.attributes[0]!.localName).toBe('lang')

    // HTML context: the parser assigns NO namespace here, so the runtime must
    // not either. Adding one would CREATE a divergence rather than close one.
    const b = host()
    const cleanB = mountChild(_tpl('<p xml:lang="cs">x</p>', () => null) as never, b)
    const p = b.querySelector('p')!
    expect(p.attributes[0]!.namespaceURI).toBeNull()
    expect(p.getAttribute('xml:lang')).toBe('cs')
    cleanA?.(); cleanB?.(); a.remove(); b.remove()
  })

  it('a namespaced attr among static siblings leaves their ref walks intact', () => {
    const c = host()
    withSprite(c)
    const id = signal('#icon')
    const cleanup = mountChild(
      _tpl(
        '<svg width="100" height="100"><title>t</title><use class="i"></use><desc>d</desc></svg>',
        (__root) => {
          const __e0 = __root.firstElementChild!.nextElementSibling!
          return _bindDirect(id, (v) => _setAttr(__e0, 'xlink:href', v as string))
        },
      ) as never,
      c,
    )
    const use = c.querySelector('use')!
    expect(use.getAttribute('class')).toBe('i')
    expect((use as SVGUseElement).href.baseVal).toBe('#icon')
    expect((use as SVGGraphicsElement).getBBox().width).toBe(100)
    expect(c.querySelector('title')!.textContent).toBe('t')
    expect(c.querySelector('desc')!.textContent).toBe('d')
    cleanup?.()
    c.remove()
  })
})

describe('the h() path — PR #3389 bailed HERE, so it has to be right too', () => {
  it('h() namespaces the attribute and the sprite renders', () => {
    // The sprite goes in its OWN host: `mount` CLEARS its container, so a
    // sprite placed in the mount target is wiped and the box reads 0 for a
    // reason that has nothing to do with namespaces. (`mountChild`, which the
    // compiled cases use, appends instead — hence the asymmetry.)
    withSprite(host())
    const c = host()
    const cleanup = mount(
      h('svg', { width: 100, height: 100 }, [h('use', { 'xlink:href': '#icon' })]),
      c,
    )
    const use = c.querySelector('use')!
    expect(use.attributes[0]!.namespaceURI).toBe(XLINK)
    // Measured 0 before the runtime fix — the bail's destination was broken too,
    // so bailing the compiled path moved the bug rather than closing it.
    expect((use as SVGGraphicsElement).getBBox().width).toBe(100)
    cleanup?.()
    c.remove()
  })

  it('h() and the compiled template agree on the attribute shape', () => {
    const a = host()
    const cleanA = mount(h('svg', null, [h('use', { 'xlink:href': '#icon' })]), a)
    const b = host()
    const cleanB = mountChild(_tpl('<svg><use xlink:href="#icon"></use></svg>', () => null) as never, b)
    expect(shapeOf(a.querySelector('use')!)).toBe(shapeOf(b.querySelector('use')!))
    cleanA?.(); cleanB?.(); a.remove(); b.remove()
  })
})

describe('SSR -> hydration', () => {
  // Byte-for-byte the string `renderToString` emits for
  //   <svg width="100" height="100"><use xlink:href="#icon"/></svg>
  // — locked against the real renderer by the runtime-server twin
  // (`namespaced-attributes.test.ts`), which cannot run in the page because
  // runtime-server imports `node:async_hooks`.
  const SSR = '<svg width="100" height="100"><use xlink:href="#icon"></use></svg>'

  it('the server bytes parse into the XLink namespace and the sprite renders', () => {
    const c = host()
    c.innerHTML = SSR
    withSprite(c)
    const use = c.querySelector('use')!
    expect(use.attributes[0]!.namespaceURI).toBe(XLINK)
    expect((use as SVGGraphicsElement).getBBox().width).toBe(100)
    c.remove()
  })

  it('hydrating the compiled shape over those bytes ADOPTS the node and keeps the namespace', () => {
    const c = host()
    c.innerHTML = SSR
    withSprite(c)
    const before = c.querySelector('use')!
    hydrateRoot(c, h((() => _tpl(STATIC_TPL, () => null)) as never, null))
    const after = c.querySelector('use')!
    // Adoption: the server's element is the one still in the document.
    expect(after).toBe(before)
    expect(after.attributes[0]!.namespaceURI).toBe(XLINK)
    expect((after as SVGGraphicsElement).getBBox().width).toBe(100)
    c.remove()
  })

  it('a client mount produces the SAME shape the server bytes do', () => {
    const a = host()
    a.innerHTML = SSR
    const b = host()
    const cleanup = mountChild(_tpl(STATIC_TPL, () => null) as never, b)
    expect(shapeOf(b.querySelector('use')!)).toBe(shapeOf(a.querySelector('use')!))
    cleanup?.(); a.remove(); b.remove()
  })
})

describe('foreignAttrNamespace — a CLOSED table, not a prefix rule', () => {
  const svgEl = () => document.createElementNS(SVG_NS, 'use')
  const htmlEl = () => document.createElement('div')

  it('namespaces exactly the names the parser adjusts', () => {
    for (const k of [
      'xlink:actuate', 'xlink:arcrole', 'xlink:href',
      'xlink:role', 'xlink:show', 'xlink:title', 'xlink:type',
    ])
      expect(foreignAttrNamespace(svgEl(), k)).toBe(XLINK)
    for (const k of ['xml:lang', 'xml:space']) expect(foreignAttrNamespace(svgEl(), k)).toBe(XML)
    for (const k of ['xmlns', 'xmlns:xlink']) expect(foreignAttrNamespace(svgEl(), k)).toBe(XMLNS)
  })

  it('leaves alone the names the parser does NOT adjust — same prefixes', () => {
    // Measured null-namespace in Chromium. A prefix rule would get these wrong.
    for (const k of ['xlink:custom', 'xml:base', 'xml:custom', 'foo:bar', 'href', 'class'])
      expect(foreignAttrNamespace(svgEl(), k)).toBeNull()
  })

  it('never fires on an HTML element, where the parser namespaces nothing', () => {
    for (const k of ['xlink:href', 'xml:lang', 'xmlns'])
      expect(foreignAttrNamespace(htmlEl(), k)).toBeNull()
  })

  it('reproduces the PARSER byte-for-byte for every adjusted name', () => {
    const names = [
      'xlink:actuate', 'xlink:arcrole', 'xlink:href', 'xlink:role',
      'xlink:show', 'xlink:title', 'xlink:type', 'xml:lang', 'xml:space',
    ]
    const h2 = document.createElement('div')
    h2.innerHTML = `<svg>${names.map((n, i) => `<use ${n}="v${i}"/>`).join('')}</svg>`
    const parsed = [...h2.querySelectorAll('use')]
    names.forEach((n, i) => {
      const assigned = document.createElementNS(SVG_NS, 'use')
      _setAttr(assigned, n, `v${i}`)
      expect(shapeOf(assigned)).toBe(shapeOf(parsed[i]!))
    })
  })

  it('a nullish flip REMOVES a namespaced attribute', () => {
    // `removeAttribute` matches by QUALIFIED name, which is why the removal
    // branch needs no namespaced sibling.
    const el = document.createElementNS(SVG_NS, 'use')
    _setAttr(el, 'xlink:href', '#a')
    expect(el.attributes.length).toBe(1)
    _setAttr(el, 'xlink:href', undefined)
    expect(el.attributes.length).toBe(0)
  })

  it('an HTML element is untouched — the plain spelling already agreed', () => {
    const el = document.createElement('div')
    _setAttr(el, 'xml:lang', 'cs')
    expect(el.attributes[0]!.namespaceURI).toBeNull()
    expect(el.getAttribute('xml:lang')).toBe('cs')
  })
})
