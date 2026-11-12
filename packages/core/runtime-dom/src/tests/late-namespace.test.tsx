/**
 * #4453 in happy-dom: element namespaces follow the parent, including for
 * content mounted after its foreign ancestor. Real-Chromium twin (rendering,
 * not just `namespaceURI`): `late-namespace.browser.test.tsx`.
 */
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, describe, expect, it } from 'vitest'
import { hydrateRoot } from '../index'
import { LATE_CASES, SVG_NS } from './_late-namespace-cases'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('late-mounted elements take their namespace from the parent (#4453)', () => {
  for (const c of LATE_CASES) {
    it(c.name, () => {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const dispose = c.run(host)
      for (const [selector, ns] of c.expect) {
        const el = host.querySelector(selector)
        expect(el, selector).not.toBeNull()
        expect(el!.namespaceURI, selector).toBe(ns)
      }
      dispose()
    })
  }

  it('the fresh mount after a hydration mismatch inside <svg> is SVG', async () => {
    // Server rendered a <rect>; the client renders an <feDropShadow> there, so
    // hydration falls back to a fresh mount of that subtree into the live <svg>.
    const server = await renderToString(h('svg', null, h('filter', null, h('rect', null))))
    const host = document.createElement('div')
    host.innerHTML = server
    document.body.appendChild(host)
    const dispose = hydrateRoot(host, h('svg', null, h('filter', null, h('feDropShadow', { dx: '2' }))))
    const el = host.querySelector('feDropShadow')
    expect(el).not.toBeNull()
    expect(el!.namespaceURI).toBe(SVG_NS)
    dispose()
  })
})
