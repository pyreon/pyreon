/**
 * Real-browser twin of `reactive-number-text-unconverted.test.tsx`: every
 * reactive text sink renders the ECMAScript `ToString` text of a number that
 * the DOM converted itself, for the same value matrix as the static sinks
 * (`number-text-unconverted.browser.test.tsx`), and a number whose text did
 * not change is not rewritten. Runs in Chromium in CI; it was also run in
 * Firefox and WebKit by pointing the browser config at them.
 *
 * The sinks are called the way the compiler emits them (the happy-dom twin
 * locks that emit through the real `transformJSX`).
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import { _bindProp, _bindText, mount } from '../index'
import { bindPolymorphicText } from '../mount'

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
  ['null', null, ''],
  ['true', true, ''],
  ["['a', 1]", ['a', 1], 'a1'],
]

const cleanups: (() => void)[] = []
const hosts: HTMLElement[] = []

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  for (const el of hosts.splice(0)) el.remove()
})

function textHost(): [HTMLElement, Text] {
  const el = document.createElement('span')
  const t = document.createTextNode(' ')
  el.append(t)
  document.body.appendChild(el)
  hosts.push(el)

  return [el, t]
}

/** Every reactive sink, bound to `s`. */
function bindAll(s: ReturnType<typeof signal<unknown>>): HTMLElement[] {
  const out: HTMLElement[] = []
  const [a, ta] = textHost()
  cleanups.push(_bindText(s, ta))
  const [b, tb] = textHost()
  cleanups.push(_bindText((() => s()) as never, tb))
  const [c, tc] = textHost()
  cleanups.push(bindPolymorphicText(() => s() as never, tc, c))
  const [d, td] = textHost()
  const props = {}
  Object.defineProperty(props, 'n', { get: () => s(), enumerable: true, configurable: true })
  cleanups.push(_bindProp(props, 'n', td, d))
  const e = document.createElement('div')
  document.body.appendChild(e)
  hosts.push(e)
  cleanups.push(mount(h('span', null, () => s() as never), e))
  out.push(a, b, c, d, e)

  return out
}

describe('reactive text sinks render a number with the DOM conversion', () => {
  for (const [name, v, want] of VALUES) {
    it(name, () => {
      const s = signal<unknown>(1)
      const els = bindAll(s)
      for (const el of els) expect(el.textContent).toBe('1')
      s.set(v)
      for (const el of els) expect(el.textContent).toBe(want)
    })
  }

  it('a value whose text does not change is not rewritten', () => {
    const s = signal<unknown>(1)
    const els = bindAll(s)
    const records: MutationRecord[] = []
    const mo = new MutationObserver((l) => records.push(...l))
    for (const el of els) mo.observe(el, { characterData: true, subtree: true, childList: true })
    s.set('1')
    s.set(1)
    s.set(0)
    s.set(-0)
    mo.takeRecords().forEach((r) => records.push(r))
    mo.disconnect()
    for (const el of els) expect(el.textContent).toBe('0')
    // Only `1` → `0` changed the text: one record per sink.
    expect(records.length).toBe(els.length)
  })
})
