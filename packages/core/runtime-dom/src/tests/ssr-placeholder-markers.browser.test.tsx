/**
 * Real-Chromium twin of `ssr-placeholder-markers.test.tsx` (#4385 case D).
 * A fixed child the client template lowers to a `<!>` placeholder now has its
 * own `<!--$-->…<!--/$-->` range in the server HTML, so hydration adopts the
 * element instead of swapping in a clone. The page can run neither the
 * compiler nor `renderToString`, so the cases carry the real client emit and
 * server HTML; the happy-dom twin fails if either drifts.
 */
import { For, Fragment, h } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { _mountChild, _mountSlot, _setChild, _setChildAt, _tpl, hydrateRoot, mount, onHydrationMismatch } from '../index'
import { PLACEHOLDER_RANGE_CASES, type PlaceholderRangeCase } from './_placeholder-range-cases'

const SCOPE = {
  flag: 'Before',
  vNode: h('b', null, 'n'),
  rows: [
    { id: 1, name: 'one' },
    { id: 2, name: 'two' },
  ],
}

const DEPS = { _mountChild, _mountSlot, _setChild, _setChildAt, _tpl, For, Fragment, h, ...SCOPE }

function compiledApp(c: PlaceholderRangeCase): () => unknown {
  return new Function(...Object.keys(DEPS), `${c.compiled}\nreturn App`)(...Object.values(DEPS)) as () => unknown
}

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

describe('a fixed child on a client placeholder is adopted in Chromium (#4385 D)', () => {
  for (const c of PLACEHOLDER_RANGE_CASES) {
    it(c.name, () => {
      const host = document.createElement('div')
      document.body.appendChild(host)
      hosts.push(host)
      host.innerHTML = c.server
      const before = [...host.querySelectorAll('*')]
      const reports: string[] = []
      const off = onHydrationMismatch((m) => reports.push(`${m.type}: ${String(m.expected)} vs ${String(m.actual)}`))
      try {
        hydrateRoot(host, h(compiledApp(c) as never, null))
      } finally {
        off()
      }
      expect(before.filter((n) => !host.contains(n))).toEqual([])
      expect(reports).toEqual([])
      const fresh = document.createElement('div')
      mount(h(compiledApp(c) as never, null), fresh)
      const strip = (s: string) => s.replace(/<!--[^>]*-->/g, '')
      expect(strip(host.innerHTML)).toBe(strip(fresh.innerHTML))
    })
  }
})
