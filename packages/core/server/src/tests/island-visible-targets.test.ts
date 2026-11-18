// @vitest-environment happy-dom
/**
 * Which elements the `visible` trigger observes (#4435), under happy-dom with a
 * recording IntersectionObserver. happy-dom has no layout and no real
 * observer, so this locks only the TARGET SELECTION; whether those targets
 * actually intersect in a browser is `island-visible-targets.browser.test.tsx`.
 */
import { query } from '@pyreon/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hydrateIslands } from '../client'

let observed: Element[] = []
const NativeIO = globalThis.IntersectionObserver

beforeEach(() => {
  observed = []
  globalThis.IntersectionObserver = class {
    observe(t: Element) {
      observed.push(t)
    }

    disconnect() {}
    unobserve() {}

    takeRecords() {
      return []
    }
  } as unknown as typeof IntersectionObserver
})

afterEach(() => {
  globalThis.IntersectionObserver = NativeIO
  document.body.innerHTML = ''
})

const run = (html: string) => {
  document.body.innerHTML = `<section id="stage">${html}</section>`
  const el = query<HTMLElement>(document, 'pyreon-island')
  el.setAttribute('data-component', 'Isle')
  el.setAttribute('data-props', '{}')
  el.setAttribute('data-hydrate', 'visible')
  const cleanup = hydrateIslands({ Isle: async () => ({ default: () => null }) })
  cleanup()

  return observed.map((t) => t.id || t.localName)
}

describe('visible trigger targets', () => {
  it('a boxed island is observed itself', () => {
    expect(run('<pyreon-island><p id="a">x</p></pyreon-island>')).toEqual(['pyreon-island'])
  })

  it('walks through display: contents at any depth to the first boxed elements', () => {
    expect(
      run(
        '<pyreon-island style="display:contents"><div style="display:contents"><b id="a">x</b><span style="display:contents"><i id="b">y</i></span></div><u id="c">z</u></pyreon-island>',
      ),
    ).toEqual(['a', 'b', 'c'])
  })

  it('a hidden element is still a target (it intersects once it gets a box)', () => {
    expect(run('<pyreon-island style="display:contents"><div id="a" style="display:none">x</div></pyreon-island>')).toEqual(['a'])
  })

  it('no element to observe: the nearest boxed ancestor, with one dev warning per page', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(run('<div style="display:contents"><pyreon-island style="display:contents">text</pyreon-island></div>')).toEqual([
        'stage',
      ])
      observed = []
      expect(run('<pyreon-island style="display:contents"></pyreon-island>')).toEqual(['stage'])
      const msgs = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("hydrate: 'visible'"))
      expect(msgs).toHaveLength(1)
      expect(msgs[0]).toMatch(/^\[Pyreon\] island "Isle"/)
    } finally {
      warn.mockRestore()
    }
  })
})
