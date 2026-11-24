/**
 * Real-Chromium twin of `setchild-empty-element-adoption.test.tsx` (#4599).
 * A compiled element whose content `_setChild` sets is empty in its template,
 * and the server renders a structural value there marker-less. The verifier
 * marks the element, `_setChild` claims it by identity and adopts the server's
 * nodes, so hydration keeps every server node instead of swapping in a clone.
 * A ref or spread sees the element empty; if it fills it, the value mounts
 * fresh after its nodes, as on a fresh render. The page
 * can run neither the compiler nor `renderToString`, so the cases carry the
 * real client emit and server HTML; the happy-dom twin fails if either drifts.
 */
import { _fuse, For, Fragment, h } from '@pyreon/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _applyProps, _mountChild, _ref, _setChild, _tpl, hydrateRoot, mount, onHydrationMismatch } from '../index'
import { SETCHILD_EMPTY_CASES, type SetChildEmptyCase } from './_setchild-empty-cases'

const SCOPE = {
  vNode: h('b', null, 'n'),
  vArr: ['t', h('b', null, 'n')],
  rows: [
    { id: 1, cell: h('b', null, 'one') },
    { id: 2, cell: ['t', h('i', null, 'two')] },
  ],
  clear: (el: Element | null) => {
    if (el !== null) el.textContent = ''
  },
  prepend: (el: Element | null) => {
    if (el !== null) el.prepend(document.createElement('i'))
  },
  hp: { dangerouslySetInnerHTML: { __html: '<i>h</i>' } },
  append: (el: Element | null) => {
    if (el !== null) el.append(document.createElement('i'))
  },
  rowsMix: [
    { id: 1, cell: 's' },
    { id: 2, cell: h('b', null, 'two') },
    { id: 3, cell: h('b', null, 'three') },
  ],
}

const DEPS = { _applyProps, _fuse, _mountChild, _ref, _setChild, _tpl, For, Fragment, h, ...SCOPE }

function compiledApp(code: string): () => unknown {
  return new Function(...Object.keys(DEPS), `${code}\nreturn App`)(...Object.values(DEPS)) as () => unknown
}

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

function hydrate(c: SetChildEmptyCase, serverHtml: string, code = c.compiled) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  host.innerHTML = serverHtml
  const before = [...host.querySelectorAll('*')]
  const reports: string[] = []
  const off = onHydrationMismatch((m) => reports.push(`${m.type}: ${String(m.expected)} vs ${String(m.actual)}`))
  // A throw inside hydration is caught and logged, leaving the server markup
  // un-hydrated: every case asserts that nothing was logged.
  const errors: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '))
  })
  try {
    hydrateRoot(host, h(compiledApp(code) as never, null))
  } finally {
    off()
    spy.mockRestore()
  }
  expect(errors).toEqual([])
  const fresh = document.createElement('div')
  mount(h(compiledApp(code) as never, null), fresh)
  const strip = (s: string) => s.replace(/<!--[^>]*-->/g, '')

  return {
    replaced: before.filter((n) => !host.contains(n)).map((n) => n.tagName.toLowerCase()),
    reports,
    html: strip(host.innerHTML),
    freshHtml: strip(fresh.innerHTML),
  }
}

describe('an empty `_setChild` element adopts the server structure in Chromium (#4599)', () => {
  for (const c of SETCHILD_EMPTY_CASES) {
    it(c.name, () => {
      const r = hydrate(c, c.server)
      // A ref or spread that puts nodes in the element (prepend, append,
      // innerHTML) makes the value mount fresh after them; a clearing ref
      // leaves it empty, so the server's nodes are put back and adopted.
      if (/prepends/.test(c.name)) expect(r.replaced).toEqual(['b'])
      else if (/dangerouslySetInnerHTML/.test(c.name)) expect(r.replaced).toEqual(['i'])
      else if (/appends/.test(c.name)) expect(r.replaced).toEqual(['b', 'b'])
      else expect(r.replaced).toEqual([])
      expect(r.reports).toEqual([])
      expect(r.html).toBe(r.freshHtml)
    })
  }

  it('a divergent server element is reported and replaced, never kept beside the client one', () => {
    const c = SETCHILD_EMPTY_CASES[0] as SetChildEmptyCase
    const r = hydrate(c, c.server.replace('<b>n</b>', '<i>n</i>'))
    expect(r.html).toBe(r.freshHtml)
    expect(r.reports[0]).toBe('tag: b vs i')
    expect(r.replaced).toEqual(['i'])
  })

  it('server structure the client leaves empty is swept and reported', () => {
    const c = SETCHILD_EMPTY_CASES[0] as SetChildEmptyCase
    const empty = c.compiled.replace('  _setChild(__e0, vNode);\n', '')
    const r = hydrate(c, c.server, empty)
    expect(r.html).toBe('<div><span></span></div>')
    expect(r.replaced).toEqual(['b'])
    expect(r.reports).toEqual(['text:  vs n'])
  })
})
