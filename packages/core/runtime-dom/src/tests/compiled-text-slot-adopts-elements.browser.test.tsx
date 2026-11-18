/**
 * Real-Chromium twin of `compiled-text-slot-adopts-elements.test.tsx` (#4385),
 * where the symptom was found (pyreon.dev's comparison table rebuilt every
 * row's cell at hydration). The binds are the compiler's emit for A and C (the
 * happy-dom twin locks the emit through `transformJSX`); the server HTML is
 * what `renderToString` produces for them.
 */
import { h } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { _textSlot, _tpl, bindPolymorphicText, hydrateRoot, onHydrationMismatch } from '../index'

const Code = (p: { children?: unknown }) => h('code', null, p.children as never)
const parts = () => ['a ', h(Code, null, 'x'), ' b']

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

function hydrateOver(serverHtml: string, App: () => unknown) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  host.innerHTML = serverHtml
  const before = [...host.querySelectorAll('*')]
  const reports: string[] = []
  const off = onHydrationMismatch((m) => reports.push(`${m.type}: ${String(m.expected)} vs ${String(m.actual)}`))
  try {
    hydrateRoot(host, h(App as never, null))
  } finally {
    off()
  }

  return { host, replaced: before.filter((n) => !host.contains(n)), reports }
}

describe('a compiled text slot holding elements is adopted in Chromium (#4385)', () => {
  it('A: sole slot (verifier parks a placeholder)', () => {
    // <span>{parts(rows[0])}</span>
    const App = () =>
      _tpl('<span> </span>', (__root) => {
        const __t0 = __root.firstChild as Text
        return bindPolymorphicText(() => parts(), __t0, __root)
      })
    const r = hydrateOver('<span>a <code>x</code> b</span>', App)
    expect(r.replaced).toEqual([])
    expect(r.reports).toEqual([])
    expect(r.host.textContent).toBe('a x b')
  })

  it('C: trailing slot after a static sibling (`_textSlot` parks the range)', () => {
    // <span><b />{parts(rows[0])}</span>
    const App = () =>
      _tpl('<span><b></b><!></span>', (__root) => {
        const __p0 = (__root.firstChild as ChildNode).nextSibling as ChildNode
        const __t0 = _textSlot(__root, __p0)
        return bindPolymorphicText(() => parts(), __t0, __root)
      })
    const r = hydrateOver('<span><b></b><!--$-->a <code>x</code> b<!--/$--></span>', App)
    expect(r.replaced).toEqual([])
    expect(r.reports).toEqual([])
    expect(r.host.textContent).toBe('a x b')
  })
})
