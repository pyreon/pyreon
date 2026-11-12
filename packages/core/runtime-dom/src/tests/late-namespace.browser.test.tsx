/**
 * REAL CHROMIUM lock for #4453: elements mounted after their `<svg>`/`<math>`
 * ancestor take the namespace of the parent they are inserted into, and HTML
 * below `<foreignObject>` is HTML. In Chromium a wrongly namespaced element is
 * not just mislabelled: an HTML `feDropShadow` is an inert unknown element and
 * an SVG `<div>` renders no box, so these assert rendering as well.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { LATE_CASES } from './_late-namespace-cases'

afterEach(() => {
  document.body.innerHTML = ''
})

function host(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

describe('late-mounted elements take their namespace from the parent (real Chromium, #4453)', () => {
  for (const c of LATE_CASES) {
    it(c.name, () => {
      const root = host()
      const dispose = c.run(root)
      for (const [selector, ns] of c.expect) {
        const el = root.querySelector(selector)
        expect(el, selector).not.toBeNull()
        expect(el!.namespaceURI, selector).toBe(ns)
      }
      dispose()
    })
  }

  it('a late feDropShadow is a real SVGFEDropShadowElement', () => {
    const root = host()
    const on = signal(false)
    const dispose = mount(
      h('svg', null, h('filter', { id: 'f' }, () => (on() ? h('feDropShadow', { dx: '1' }) : null))),
      root,
    )
    on.set(true)
    const el = root.querySelector('feDropShadow')!
    expect(el).toBeInstanceOf(SVGFEDropShadowElement)
    expect((el as SVGFEDropShadowElement).dx.baseVal).toBe(1)
    dispose()
  })

  it('a <div> inside <foreignObject> lays out as an HTML box', () => {
    const root = host()
    const dispose = mount(
      h(
        'svg',
        { width: 200, height: 100 },
        h(
          'foreignObject',
          { width: 200, height: 100 },
          h('div', { id: 'fo-div', style: 'width: 120px; height: 30px' }, 'html'),
        ),
      ),
      root,
    )
    const div = root.querySelector('#fo-div')!
    expect(div).toBeInstanceOf(HTMLDivElement)
    expect(div.getBoundingClientRect().width).toBe(120)
    dispose()
  })
})
