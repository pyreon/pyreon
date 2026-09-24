/**
 * Event-handler attributes — the LIVENESS half, in a real browser.
 *
 * `setx-superset-differential.test.tsx` locks that the three renderers agree the
 * attribute is ABSENT. That is the contract; this file is why the contract
 * matters, and it cannot live in happy-dom:
 *
 *   - happy-dom does not COMPILE a handler content attribute, so an
 *     `expect(attr).toBeNull()` there is a byte assertion about a string. In
 *     Chromium the same write executes script.
 *   - happy-dom's `'onClick' in el` disagrees with the spec, which changes which
 *     `setStaticProp` branch a camelCase name reaches.
 *
 * Measured in real Chromium against the BROKEN build, each of these ran the
 * payload (`window.__pwn* === 1`): `applyProps` on an SVG `<rect>`, `_setAttr`
 * on an SVG `<rect>`, and `_setAttr` on a plain HTML `<div>`.
 */
import { describe, expect, it } from 'vitest'
import { _setAttr, applyProps } from '../index'

const SVG_NS = 'http://www.w3.org/2000/svg'
const W = window as unknown as Record<string, unknown>

/** A connected `<rect>` inside a connected `<svg>` — handlers need a live tree. */
function svgRect(): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  const rect = document.createElementNS(SVG_NS, 'rect')
  svg.append(rect)
  document.body.append(svg)
  return rect as SVGElement
}

describe('event-handler attributes never reach the DOM (real Chromium)', () => {
  it('h() path, SVG child: the payload does not execute', () => {
    const rect = svgRect()
    W.__pwnA = 0
    applyProps(rect, { onclick: 'window.__pwnA = 1' } as never)
    rect.dispatchEvent(new Event('click', { bubbles: true }))
    expect(rect.getAttribute('onclick')).toBeNull()
    expect(W.__pwnA, 'an inline handler attribute on SVG is LIVE in a browser').toBe(0)
  })

  it('compiled path (`_setAttr`), SVG child: the payload does not execute', () => {
    const rect = svgRect()
    W.__pwnB = 0
    _setAttr(rect, 'onclick', 'window.__pwnB = 1')
    rect.dispatchEvent(new Event('click', { bubbles: true }))
    expect(rect.getAttribute('onclick')).toBeNull()
    expect(W.__pwnB).toBe(0)
  })

  it('compiled path (`_setAttr`), plain HTML: the payload does not execute', () => {
    const el = document.createElement('div')
    document.body.append(el)
    W.__pwnC = 0
    _setAttr(el, 'onclick', 'window.__pwnC = 1')
    el.dispatchEvent(new Event('click', { bubbles: true }))
    expect(el.getAttribute('onclick')).toBeNull()
    expect(W.__pwnC).toBe(0)
  })

  it('a CAMELCASE name written as an attribute would fold to a live one', () => {
    // Why `isEventHandlerAttr` refuses the camelCase spelling at an attribute
    // sink as well: `setAttribute` lowercases a qualified name on an HTML
    // element, so `onClick` becomes a live `onclick`. Asserted on a bare element
    // so the claim is about the PLATFORM, not about our guard …
    const raw = document.createElement('div')
    document.body.append(raw)
    W.__pwnD = 0
    raw.setAttribute('onClick', 'window.__pwnD = 1')
    raw.dispatchEvent(new Event('click', { bubbles: true }))
    expect(raw.getAttributeNames()).toContain('onclick')
    expect(W.__pwnD, 'platform: a camelCase handler attribute folds and runs').toBe(1)
    // … and here is our guard refusing to create that situation.
    const guarded = document.createElement('div')
    document.body.append(guarded)
    W.__pwnE = 0
    _setAttr(guarded, 'onClick', 'window.__pwnE = 1')
    guarded.dispatchEvent(new Event('click', { bubbles: true }))
    expect(guarded.getAttributeNames()).not.toContain('onclick')
    expect(W.__pwnE).toBe(0)
  })

  it('the SVG SMIL vocabulary is refused too', () => {
    const el = document.createElementNS(SVG_NS, 'animate')
    for (const name of ['onbegin', 'onend', 'onrepeat']) {
      applyProps(el, { [name]: 'window.__pwnF = 1' } as never)
      expect(el.getAttribute(name), `${name} is an SVG handler`).toBeNull()
    }
  })

  it('vendor-legacy onmousewheel (Chromium compiles it) is refused on both client paths', () => {
    const btn = document.createElement('button')
    document.body.append(btn)
    expect('onmousewheel' in btn, 'premise: Chromium defines the handler').toBe(true)
    applyProps(btn, { onmousewheel: 'window.__pwnG = 1' } as never)
    expect(btn.getAttribute('onmousewheel')).toBeNull()
    _setAttr(btn, 'onmousewheel', 'window.__pwnG = 1')
    expect(btn.getAttribute('onmousewheel')).toBeNull()
  })

  it('MathML elements are guarded too (their interface defines the global handlers)', () => {
    const mi = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mi')
    document.body.append(mi)
    W.__pwnH = 0
    _setAttr(mi, 'onclick', 'window.__pwnH = 1')
    mi.dispatchEvent(new Event('click', { bubbles: true }))
    expect(mi.getAttribute('onclick')).toBeNull()
    expect(W.__pwnH).toBe(0)
  })

  // The client decides "is this a handler?" by asking the ELEMENT (`key in el`)
  // instead of shipping `EVENT_HANDLER_ATTRS`. This is the load-bearing proof
  // that the two agree where it matters: EVERY `on*` handler the engine defines
  // on each element family is refused by both client sinks.
  it('every on* handler the element defines is refused (h() and compiled)', () => {
    const els: Element[] = [
      ...['div', 'body', 'video', 'input', 'dialog', 'button', 'form', 'img'].map((t) =>
        document.createElement(t),
      ),
      ...['svg', 'animate', 'rect'].map((t) => document.createElementNS(SVG_NS, t)),
      document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mi'),
    ]
    let checked = 0
    for (const el of els) {
      const names = new Set<string>()
      for (let o: object | null = el; o; o = Object.getPrototypeOf(o)) {
        for (const n of Object.getOwnPropertyNames(o)) {
          if (n.length > 2 && n.startsWith('on') && n.charCodeAt(2) >= 97 && n.charCodeAt(2) <= 122)
            names.add(n)
        }
      }
      for (const n of names) {
        applyProps(el, { [n]: 'x' } as never)
        _setAttr(el, n, 'x')
        expect(el.getAttribute(n), `${el.localName}.${n}`).toBeNull()
        checked++
      }
    }
    expect(checked, 'the enumeration must not silently collapse').toBeGreaterThan(500)
  })

  it('ordinary attributes and the camelCase PROP still work (controls)', () => {
    const rect = svgRect()
    applyProps(rect, { width: '10', height: '5' } as never)
    expect(rect.getAttribute('width')).toBe('10')

    const btn = document.createElement('button')
    document.body.append(btn)
    let fired = 0
    applyProps(btn, { onClick: () => fired++ } as never)
    const expando = (btn as unknown as Record<string, unknown>).__ev_click
    expect(typeof expando, 'the documented camelCase prop binds a real listener').toBe('function')
    ;(expando as (e: Event) => void)(new Event('click'))
    expect(fired).toBe(1)

    // `once`/`onyx` are ordinary data, not handlers.
    const el = document.createElement('div')
    _setAttr(el, 'once', 'x')
    expect(el.getAttribute('once')).toBe('x')
  })
})
