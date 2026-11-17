/**
 * #4385 D, the report half. A FIXED child on a template placeholder
 * (`<li><b />{r.name}<i /></li>` lowers to `_setChildAt`) is now a
 * `<!--$-->…<!--/$-->` range in the server HTML, which the client adopts
 * through the slot hydrator. Adoption must not cost the mismatch report: when
 * the server's value differs, the element is still adopted, the text is
 * corrected, and the divergence is reported.
 *
 * Real compiler on both sides, both SSR paths (h() and `_ssr`), the real
 * `renderToString` and `hydrateRoot`.
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { For, Fragment, h } from '@pyreon/core'
import * as server from '@pyreon/runtime-server'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as dom from '../index'
import { hydrateRoot, mount, onHydrationMismatch } from '../index'

const underscored = (m: object) => Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith('_')))

function compile(src: string, scope: Record<string, unknown>, ssr: boolean, ssrTemplate = false): () => unknown {
  const { code } = transformJSX(src, 'case.tsx', ssr ? { ssr: true, ssrTemplate } : {})
  const js = transformSync(code.replace(/^import[^\n]*\n/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const deps = { ...underscored(core), ...underscored(ssr ? server : dom), h, Fragment, For, ...scope }

  return new Function(...Object.keys(deps), `${js}\nreturn App`)(...Object.values(deps)) as () => unknown
}

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

async function roundTrip(src: string, serverScope: Record<string, unknown>, clientScope: Record<string, unknown>, ssrTemplate: boolean) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  host.innerHTML = await renderToString(h(compile(src, serverScope, true, ssrTemplate) as never, null) as never)
  const serverHtml = host.innerHTML
  const before = [...host.querySelectorAll('*')]
  const reports: string[] = []
  const off = onHydrationMismatch((m) => reports.push(`${m.type}: ${String(m.expected)} vs ${String(m.actual)}`))
  try {
    hydrateRoot(host, h(compile(src, clientScope, false) as never, null))
  } finally {
    off()
  }
  const fresh = document.createElement('div')
  mount(h(compile(src, clientScope, false) as never, null), fresh)
  const strip = (s: string) => s.replace(/<!--[^>]*-->/g, '')

  return {
    serverHtml,
    reports,
    replaced: before.filter((n) => !host.contains(n)).map((n) => n.tagName.toLowerCase()),
    html: strip(host.innerHTML),
    freshHtml: strip(fresh.innerHTML),
  }
}

const ELEMENT = 'const App = () => <li><b />{v}<i /></li>'
const ROWS = 'const App = () => <ul><For each={rows} by={(r) => r.id}>{(r) => <li><b />{r.name}<i /></li>}</For></ul>'
const rowsOf = (...names: unknown[]) => names.map((name, i) => ({ id: i + 1, name }))

describe('a fixed child on a placeholder: adopted, and a divergence is still reported (#4385 D)', () => {
  for (const ssrTemplate of [false, true]) {
    const path = ssrTemplate ? '_ssr' : 'h()'

    it(`${path}: the premise, the server brackets the fixed child and the client lowers it to _setChildAt`, async () => {
      expect(transformJSX(ELEMENT, 'case.tsx').code).toContain('_setChildAt(__root, __p0, v)')
      const r = await roundTrip(ELEMENT, { v: 'same' }, { v: 'same' }, ssrTemplate)
      expect(r.serverHtml).toBe('<li><b></b><!--$-->same<!--/$--><i></i></li>')
      expect(r.replaced).toEqual([])
      expect(r.reports).toEqual([])
      expect(r.html).toBe(r.freshHtml)
    })

    it(`${path}: a differing value in an element is corrected in place and reported`, async () => {
      const r = await roundTrip(ELEMENT, { v: 'server' }, { v: 'client' }, ssrTemplate)
      expect(r.replaced).toEqual([])
      expect(r.html).toBe('<li><b></b>client<i></i></li>')
      expect(r.html).toBe(r.freshHtml)
      expect(r.reports).toEqual(['text: client vs server'])
    })

    it(`${path}: a differing value in <For> rows is reported per row, every row adopted`, async () => {
      const r = await roundTrip(ROWS, { rows: rowsOf('s1', 's2') }, { rows: rowsOf('c1', 'c2') }, ssrTemplate)
      expect(r.replaced).toEqual([])
      expect(r.html).toBe(r.freshHtml)
      expect(r.reports).toEqual(['text: c1 vs s1', 'text: c2 vs s2'])
    })

    it(`${path}: null and false render nothing on both sides, and agree`, async () => {
      for (const v of [null, false, undefined]) {
        const r = await roundTrip(ELEMENT, { v }, { v }, ssrTemplate)
        expect(r.serverHtml).toBe('<li><b></b><!--$--><!--/$--><i></i></li>')
        expect(r.html).toBe('<li><b></b><i></i></li>')
        expect(r.html).toBe(r.freshHtml)
        expect(r.replaced).toEqual([])
        expect(r.reports).toEqual([])
      }
    })
  }
})
