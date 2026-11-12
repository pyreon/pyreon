/**
 * Shared cases for #4453: an h() element takes its namespace from the parent
 * it is inserted into, so an element mounted AFTER its `<svg>`/`<math>`
 * ancestor (a reactive child, `<Show>`, a `<For>` row, a portal, the fresh
 * mount after a hydration mismatch) lands in the right namespace, and HTML
 * below `<foreignObject>` is HTML. Run by `late-namespace.test.tsx` (happy-dom)
 * and `late-namespace.browser.test.tsx` (real Chromium, where an HTML-namespaced
 * `feDropShadow` is inert and an SVG-namespaced `<div>` renders nothing).
 */
import { For, h, Portal, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

export const SVG_NS = 'http://www.w3.org/2000/svg'
export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'
export const HTML_NS = 'http://www.w3.org/1999/xhtml'

export interface LateCase {
  name: string
  /** Mounts into `host`, flips whatever makes the late content appear, returns the dispose. */
  run: (host: HTMLElement) => () => void
  /** `[selector, expected namespace]` pairs checked after `run`. */
  expect: [string, string][]
}

export const LATE_CASES: LateCase[] = [
  {
    name: 'reactive child: an SVG element outside the old tag list (feDropShadow)',
    run: (host) => {
      const on = signal(false)
      const dispose = mount(
        h('svg', null, h('filter', { id: 'f' }, () => (on() ? h('feDropShadow', { dx: '1' }) : null))),
        host,
      )
      on.set(true)
      return dispose
    },
    expect: [['feDropShadow', SVG_NS]],
  },
  {
    name: '<Show> inside an existing <svg> (feFuncA below feComponentTransfer)',
    run: (host) => {
      const on = signal(false)
      const dispose = mount(
        h(
          'svg',
          null,
          h(
            'filter',
            null,
            h(
              'feComponentTransfer',
              null,
              h(Show, { when: () => on() }, h('feFuncA', { type: 'linear' })),
            ),
          ),
        ),
        host,
      )
      on.set(true)
      return dispose
    },
    expect: [['feFuncA', SVG_NS]],
  },
  {
    name: '<For> rows appended later inside an existing <g>',
    run: (host) => {
      const items = signal<number[]>([])
      const dispose = mount(
        h(
          'svg',
          null,
          h(
            'g',
            null,
            h(For, { each: () => items(), by: (n: number) => n }, (n: number) =>
              h('switch', { 'data-n': String(n) }, h('rect', { width: 1, height: 1 })),
            ),
          ),
        ),
        host,
      )
      items.set([1, 2])
      return dispose
    },
    expect: [
      ['switch', SVG_NS],
      ['switch rect', SVG_NS],
    ],
  },
  {
    name: 'HTML below <foreignObject> is HTML (first pass)',
    run: (host) =>
      mount(h('svg', null, h('foreignObject', null, h('div', { class: 'fo' }, 'html'))), host),
    expect: [
      ['foreignObject', SVG_NS],
      ['div.fo', HTML_NS],
    ],
  },
  {
    name: 'HTML mounted later below <foreignObject> is HTML, and <svg> inside it is SVG again',
    run: (host) => {
      const on = signal(false)
      const dispose = mount(
        h(
          'svg',
          null,
          h('foreignObject', null, () =>
            on() ? h('p', { class: 'late' }, h('svg', null, h('circle', { r: 1 }))) : null,
          ),
        ),
        host,
      )
      on.set(true)
      return dispose
    },
    expect: [
      ['p.late', HTML_NS],
      ['p.late svg', SVG_NS],
      ['p.late circle', SVG_NS],
    ],
  },
  {
    name: 'a <Portal> into an SVG target creates SVG content',
    run: (host) => {
      const ns = 'http://www.w3.org/2000/svg'
      const target = document.createElementNS(ns, 'svg')
      target.setAttribute('id', 'portal-target')
      const app = document.createElement('div')
      host.append(app, target)
      return mount(h('div', null, h(Portal, { target }, h('mpath', { href: '#p' }))), app)
    },
    expect: [['#portal-target mpath', SVG_NS]],
  },
  {
    name: 'late MathML outside the old tag list (mstyle), and HTML below a text integration point',
    run: (host) => {
      const on = signal(false)
      const dispose = mount(
        h('math', null, () =>
          on() ? h('mstyle', null, h('mtext', null, h('span', { class: 'in-mtext' }, 'x'))) : null,
        ),
        host,
      )
      on.set(true)
      return dispose
    },
    expect: [
      ['mstyle', MATHML_NS],
      ['mtext', MATHML_NS],
      ['span.in-mtext', HTML_NS],
    ],
  },
  {
    name: 'a top-level <circle> in HTML content is HTML, as the parser makes it',
    run: (host) => mount(h('div', null, h('circle', { class: 'stray' })), host),
    expect: [['circle.stray', HTML_NS]],
  },
]
