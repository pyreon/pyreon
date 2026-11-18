/**
 * Real-Chromium twin of `child-text-parity.test.tsx` (#4386), for the client
 * sinks. The DOM's own coercion is environment-dependent (happy-dom writes `''`
 * for `textContent = 0`, Chromium writes `"0"`), so the sinks must coerce with
 * the shared rule themselves; this proves they do in a real browser, including
 * a reactive update from text to an array and back.
 *
 * The compiled sinks are called the way the compiler emits them (the happy-dom
 * twin locks that emit through the real `transformJSX`).
 */
import { _childText, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { _bindText, _setChild, _setChildAt, bindPolymorphicText, mount } from '../index'

const VALUES: [string, () => unknown, string][] = [
  ["['a', 'b']", () => ['a', 'b'], 'ab'],
  ["['a', null, 'b']", () => ['a', null, 'b'], 'ab'],
  ["['a', false, true, 0]", () => ['a', false, true, 0], 'a0'],
  ['true', () => true, ''],
  ['false', () => false, ''],
  ['null', () => null, ''],
  ['0', () => 0, '0'],
  ['1n', () => BigInt(1), '1'],
  ['{ toString }', () => ({ toString: () => 'T' }), 'T'],
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

describe('client text sinks apply the shared child-text rule in Chromium (#4386)', () => {
  for (const [name, get, want] of VALUES) {
    it(name, () => {
      expect(_childText(get())).toBe(want)

      const a = host()
      _setChild(a, get())
      expect(a.textContent).toBe(want)

      const b = host()
      b.innerHTML = '<i></i><!----><i></i>'
      _setChildAt(b, b.childNodes[1] as ChildNode, get())
      expect(b.textContent).toBe(want)

      const c = host()
      const t = document.createTextNode(' ')
      c.appendChild(t)
      _bindText(get as never, t)
      expect(c.textContent).toBe(want)

      const d = host()
      const t2 = document.createTextNode(' ')
      d.appendChild(t2)
      bindPolymorphicText(get as never, t2, d)
      expect(d.textContent).toBe(want)

      const e = host()
      mount(h('span', null, get() as never), e)
      expect(e.textContent).toBe(want)
    })
  }

  it('a signal moving text → array → text keeps ONE text node on the direct tier', async () => {
    const s = signal<unknown>('x')
    const el = host()
    const t = document.createTextNode(' ')
    el.appendChild(t)
    _bindText(s, t)
    s.set(['a', 'b'])
    await flush()
    expect(el.textContent).toBe('ab')
    expect(el.childNodes.length).toBe(1)
    expect(el.firstChild).toBe(t)
    s.set('y')
    await flush()
    expect(el.textContent).toBe('y')
    expect(el.firstChild).toBe(t)
  })
})
