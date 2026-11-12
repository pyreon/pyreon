/**
 * REAL CHROMIUM lock for #4466: a camelCase HTML IDL prop (`tabIndex`) on an
 * SVG or MathML element must land as the attribute the HTML parser would give
 * it (`tabindex`). `setAttribute` keeps the case on a foreign element, so the
 * element got a `tabIndex` attribute Chromium ignores: not focusable, not in
 * the tab order, `el.tabIndex === -1`. happy-dom does not reproduce it.
 *
 * The compiled `_tpl` bodies below are exactly what `transformJSX` emits for
 *   <svg><g id="c" tabIndex={t()} /></svg>
 * (asserted in `foreign-attr-case.test.tsx`), since the compiler cannot run in
 * the page.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { _bindDirect, _setAttr, _tpl, hydrateRoot, mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  document.body.innerHTML = ''
})

function host(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('camelCase HTML props on SVG/MathML elements (real Chromium, #4466)', () => {
  it('the premise: a camelCase tabIndex attribute on SVG is ignored', () => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('tabIndex', '0')
    expect(g.getAttributeNames()).toEqual(['tabIndex'])
    expect(g.tabIndex).toBe(-1)
  })

  it('h() path: tabIndex on an SVG <g> becomes a focusable tabindex', () => {
    const root = host()
    const dispose = mount(
      h('svg', { width: 10, height: 10 }, h('g', { id: 'probe', tabIndex: 0 }, h('rect', { width: 5, height: 5 }))),
      root,
    )
    const g = root.querySelector<SVGGElement>('#probe')!
    expect(g.getAttributeNames().sort()).toEqual(['id', 'tabindex'])
    expect(g.tabIndex).toBe(0)
    g.focus()
    expect(document.activeElement).toBe(g)
    dispose()
  })

  it('h() path: a reactive tabIndex updates and removes the same attribute', () => {
    const root = host()
    const t = signal<number | undefined>(0)
    const dispose = mount(h('svg', null, h('g', { id: 'r', tabIndex: () => t() })), root)
    const g = root.querySelector<SVGGElement>('#r')!
    t.set(-1)
    expect(g.getAttribute('tabindex')).toBe('-1')
    t.set(undefined)
    expect(g.getAttributeNames()).toEqual(['id'])
    dispose()
  })

  it('compiled path: _setAttr writes tabindex, and removal finds it', () => {
    const t = signal<number | undefined>(0)
    const root = host()
    const dispose = mount(
      _tpl('<svg><g id="c"></g></svg>', (__root) => {
        const __e0 = __root.firstElementChild!
        return _bindDirect(t, (v) => _setAttr(__e0, 'tabIndex', v))
      }) as never,
      root,
    )
    const g = root.querySelector<SVGGElement>('#c')!
    expect(g.getAttributeNames().sort()).toEqual(['id', 'tabindex'])
    g.focus()
    expect(document.activeElement).toBe(g)
    t.set(undefined)
    expect(g.getAttributeNames()).toEqual(['id'])
    dispose()
  })

  it('the parser-cased SVG attributes keep their case on both paths', () => {
    const root = host()
    const vb = signal('0 0 40 20')
    const dispose = mount(
      h('svg', { id: 'a', viewBox: () => vb(), preserveAspectRatio: 'none' }),
      root,
    )
    const svg = root.querySelector<SVGSVGElement>('#a')!
    expect(svg.viewBox.baseVal.width).toBe(40)
    expect(svg.preserveAspectRatio.baseVal.align).toBe(SVGPreserveAspectRatio.SVG_PRESERVEASPECTRATIO_NONE)
    const e = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    _setAttr(e, 'viewBox', '0 0 30 10')
    expect(e.viewBox.baseVal.width).toBe(30)
    dispose()
  })

  it('MathML: tabIndex on <mi> is a working tabindex', () => {
    const root = host()
    const dispose = mount(h('math', null, h('mi', { id: 'm', tabIndex: 0 }, 'x')), root)
    const mi = root.querySelector<MathMLElement>('#m')!
    expect(mi.getAttributeNames().sort()).toEqual(['id', 'tabindex'])
    expect(mi.tabIndex).toBe(0)
    dispose()
  })

  it('hydration: a reactive tabIndex on a server-rendered <g> keeps ONE attribute', () => {
    const root = host()
    root.innerHTML = '<svg><g id="h" tabindex="0"></g></svg>'
    const g = root.querySelector('#h')!
    const t = signal(0)
    const dispose = hydrateRoot(root, h('svg', null, h('g', { id: 'h', tabIndex: () => t() })))
    t.set(-1)
    expect(root.querySelector('#h')).toBe(g)
    expect(g.getAttributeNames().sort()).toEqual(['id', 'tabindex'])
    expect(g.getAttribute('tabindex')).toBe('-1')
    dispose()
  })
})
