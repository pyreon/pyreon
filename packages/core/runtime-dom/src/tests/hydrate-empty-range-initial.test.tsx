/**
 * An accessor child whose server range is EMPTY but whose client value renders
 * anything is a divergence: the server page showed nothing, the client shows
 * something. Text was reported first (#4419); a structural value (an element,
 * an array, a component's output) used to mount silently (#4582). A value that
 * renders nothing (an empty string, null, false, an empty array, a component
 * returning null) is not reported. Driven through the real `h()` walk over
 * hand-written server HTML; the compiled twins are in
 * `_compiled-mismatch-cases.ts`.
 */
import { Fragment, h } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { hydrateRoot } from '../index'
import { onHydrationMismatch } from '../hydration-debug'

const hosts: HTMLElement[] = []
const disposers: Array<() => void> = []
afterEach(() => {
  for (const d of disposers.splice(0)) d()
  for (const x of hosts.splice(0)) x.remove()
})

function hydrateOver(serverHtml: string, child: () => unknown, vnode = h('div', null, 'x', child as never)) {
  const host = document.createElement('div')
  host.innerHTML = serverHtml
  document.body.appendChild(host)
  hosts.push(host)
  const reports: Array<{ type: string; expected: unknown; actual: unknown }> = []
  const off = onHydrationMismatch((c) => {
    reports.push({ type: c.type, expected: c.expected, actual: c.actual })
  })
  disposers.push(hydrateRoot(host, vnode))
  off()
  return { host, reports }
}

// Two children, so the accessor keeps its `<!--$-->` markers (a SOLE accessor child elides them).
const EMPTY = '<div>x<!--$--><!--/$--></div>'

describe('an empty server range against an accessor', () => {
  it('reports a number the client renders (the server showed nothing)', () => {
    const { host, reports } = hydrateOver(EMPTY, () => 42)
    expect(reports).toEqual([{ type: 'text', expected: '42', actual: '' }])
    expect(host.textContent).toBe('x42')
  })

  it('reports a non-empty string the client renders', () => {
    const { host, reports } = hydrateOver(EMPTY, () => 'hello')
    expect(reports).toEqual([{ type: 'text', expected: 'hello', actual: '' }])
    expect(host.textContent).toBe('xhello')
  })

  it.each([['an empty string', ''], ['null', null], ['false', false]])(
    'reports nothing when the client renders %s too',
    (_name, value) => {
      const { host, reports } = hydrateOver(EMPTY, () => value)
      expect(reports).toEqual([])
      expect(host.textContent).toBe('x')
    },
  )
})

const Panel = () => h('section', null, 'panel')
const Nothing = () => null

describe('an empty server range against a structural accessor value (#4582)', () => {
  it.each([
    ['an element', () => h('b', null, 'on'), 'b', 'xon'],
    ['a component', () => h(Panel, null), 'section', 'xpanel'],
    ['an array', () => [h('i', null, 'a'), 'b'], 'i', 'xab'],
    ['a fragment', () => h(Fragment, null, h('em', null, 'f')), 'em', 'xf'],
  ])('reports %s the client renders', (_name, value, tag, text) => {
    const { host, reports } = hydrateOver(EMPTY, value)
    expect(reports).toEqual([{ type: 'tag', expected: tag, actual: '' }])
    expect(host.textContent).toBe(text)
  })

  it('reports the leading text of an array', () => {
    const { reports } = hydrateOver(EMPTY, () => ['t', h('b', null, 'u')])
    expect(reports).toEqual([{ type: 'text', expected: 't', actual: '' }])
  })

  it.each([
    ['an empty array', () => []],
    ['a component that renders null', () => h(Nothing, null)],
  ])('reports nothing when the client renders %s', (_name, value) => {
    const { host, reports } = hydrateOver(EMPTY, value)
    expect(reports).toEqual([])
    expect(host.textContent).toBe('x')
  })

  it('reports an element mounted into an empty element whose sole child is the accessor', () => {
    const child = () => h('b', null, 'on')
    const { host, reports } = hydrateOver('<p></p>', child, h('p', null, child as never))
    expect(reports).toEqual([{ type: 'tag', expected: 'b', actual: '' }])
    expect(host.innerHTML).toContain('<b>on</b>')
  })

  it('reaches the handlers in production too', () => {
    const env = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const { reports } = hydrateOver(EMPTY, () => h('b', null, 'on'))
      expect(reports).toEqual([{ type: 'tag', expected: 'b', actual: '' }])
    } finally {
      if (env === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = env
    }
  })
})
