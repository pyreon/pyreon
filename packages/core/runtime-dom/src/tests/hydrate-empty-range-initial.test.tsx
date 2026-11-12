/**
 * An accessor child whose server range is EMPTY but whose client value renders
 * text is a divergence (#4419): the server page showed nothing, the client
 * shows something. A number is text; an empty string, null and false are not.
 * Driven through the real `h()` walk over hand-written server HTML.
 */
import { h } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { hydrateRoot } from '../index'
import { onHydrationMismatch } from '../hydration-debug'

const hosts: HTMLElement[] = []
const disposers: Array<() => void> = []
afterEach(() => {
  for (const d of disposers.splice(0)) d()
  for (const x of hosts.splice(0)) x.remove()
})

function hydrateOver(serverHtml: string, child: () => unknown) {
  const host = document.createElement('div')
  host.innerHTML = serverHtml
  document.body.appendChild(host)
  hosts.push(host)
  const reports: Array<{ type: string; expected: unknown; actual: unknown }> = []
  const off = onHydrationMismatch((c) => {
    reports.push({ type: c.type, expected: c.expected, actual: c.actual })
  })
  disposers.push(hydrateRoot(host, h('div', null, 'x', child as never)))
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
