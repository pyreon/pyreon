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
let report: (() => void) | null = null
const NativeIO = globalThis.IntersectionObserver

beforeEach(() => {
  observed = []
  report = null
  globalThis.IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) {
      // The first report a real observer delivers after layout: every target,
      // none intersecting (the stage is not laid out in happy-dom).
      report = () =>
        cb(
          observed.map((target) => ({ target, isIntersecting: false }) as IntersectionObserverEntry),
          this as unknown as IntersectionObserver,
        )
    }

    observe(t: Element) {
      observed.push(t)
    }

    disconnect() {}
    unobserve(t: Element) {
      observed = observed.filter((o) => o !== t)
    }

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
  report?.()
  cleanup()

  return observed.map((t) => t.id || t.localName)
}

// Reading computed style while the islands are set up forces a synchronous
// style recalc + layout of the whole document before the first paint (10 ms of
// a 17 ms task on pyreon.dev's home page). The targets are resolved in the
// observer's first report instead, after the browser's own layout.
describe('visible trigger setup', () => {
  it('reads no computed style until the observer reports', () => {
    const spy = vi.spyOn(globalThis, 'getComputedStyle')
    try {
      document.body.innerHTML =
        '<section id="stage"><pyreon-island style="display:contents"><b id="a">x</b></pyreon-island></section>'
      const el = query<HTMLElement>(document, 'pyreon-island')
      el.setAttribute('data-component', 'Isle')
      el.setAttribute('data-props', '{}')
      el.setAttribute('data-hydrate', 'visible')
      const cleanup = hydrateIslands({ Isle: async () => ({ default: () => null }) })
      expect(spy).not.toHaveBeenCalled()
      expect(observed.map((t) => t.localName)).toEqual(['pyreon-island'])
      report?.()
      expect(spy).toHaveBeenCalled()
      expect(observed.map((t) => t.id)).toEqual(['a'])
      cleanup()
    } finally {
      spy.mockRestore()
    }
  })
})

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
