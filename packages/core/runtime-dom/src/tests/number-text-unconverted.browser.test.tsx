/**
 * Real-browser twin of `number-text-unconverted.test.tsx`: the static text
 * sinks hand a number to the DOM unconverted (JS-side `String(n)` grows V8's
 * ~64 KB Number→String cache for good), and the DOM's own conversion renders
 * the ECMAScript `ToString` text for every value, in the browser rather than
 * in happy-dom (whose `textContent = 0` writes nothing, fixed for the unit
 * tests in `vitest.setup.ts`).
 *
 * `_setChild` and the `h()` sole-child fast path write `textContent = n` on an
 * empty element: the cheapest of the DOM's text writes in Chromium. This file
 * also runs in Firefox and WebKit when the browser config is pointed at them.
 *
 * The sinks are called the way the compiler emits them (the happy-dom twin
 * locks that emit through the real `transformJSX`).
 */
import { h } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { _bindProp, _setChild, _setChildAt, mount } from '../index'

const VALUES: [string, unknown, string][] = [
  ['0', 0, '0'],
  ['-0', -0, '0'],
  ['NaN', Number.NaN, 'NaN'],
  ['Infinity', Number.POSITIVE_INFINITY, 'Infinity'],
  ['-Infinity', Number.NEGATIVE_INFINITY, '-Infinity'],
  ['4242', 4242, '4242'],
  ['-7', -7, '-7'],
  ['2 ** 53', 2 ** 53, '9007199254740992'],
  ['1.5', 1.5, '1.5'],
  ['0.1 + 0.2', 0.1 + 0.2, '0.30000000000000004'],
  ['1e21', 1e21, '1e+21'],
  ['1e-7', 1e-7, '1e-7'],
  ['10n', BigInt(10), '10'],
  ["'abc'", 'abc', 'abc'],
  ["''", '', ''],
  ["'0'", '0', '0'],
]

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

function host(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  hosts.push(el)

  return el
}

describe('static text sinks render a number with the DOM conversion', () => {
  for (const [name, v, want] of VALUES) {
    it(name, () => {
      // `_setChild` on a fresh, empty element (a compiled `<td>{row.id}</td>`).
      const a = host()
      _setChild(a, v)
      expect(a.textContent).toBe(want)
      expect(a.childNodes.length).toBe(want === '' ? 0 : 1)

      // `_setChildAt` at a compiled `<!>` placeholder between siblings.
      const b = host()
      b.append(document.createElement('i'))
      const ph = document.createComment('')
      b.append(ph, document.createElement('i'))
      _setChildAt(b, ph, v)
      expect(b.textContent).toBe(want)

      // `_bindProp` over a plain data prop, into the compiled text node.
      const c = host()
      const t = document.createTextNode(' ')
      c.append(t)
      _bindProp({ n: v }, 'n', t, c)
      expect(c.textContent).toBe(want)

      // `h()`: the sole-child fast path and the among-siblings path.
      const d = host()
      mount(h('span', null, v as never), d)
      expect(d.querySelector('span')!.textContent).toBe(want)
      const e = host()
      mount(h('span', null, h('i', null), v as never), e)
      expect(e.querySelector('span')!.textContent).toBe(want)
    })
  }
})

describe('the DOM receives the number itself', () => {
  it('_setChild and the h() sole child write textContent with a number', () => {
    const d = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!
    const seen: string[] = []
    Object.defineProperty(Node.prototype, 'textContent', {
      ...d,
      set(this: Node, v: unknown) {
        seen.push(typeof v)
        d.set!.call(this, v)
      },
    })
    try {
      const a = host()
      _setChild(a, 0)
      const b = host()
      mount(h('b', null, 7), b)
      expect(seen).toEqual(['number', 'number'])
      expect(a.textContent).toBe('0')
      expect(b.textContent).toBe('7')
    } finally {
      Object.defineProperty(Node.prototype, 'textContent', d)
    }
  })
})
