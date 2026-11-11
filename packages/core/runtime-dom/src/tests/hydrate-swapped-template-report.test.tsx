/**
 * A compiled template that cannot adopt its server node is swapped for a
 * client clone; the report names the FIRST place the two differ (a `tag` for a
 * different element or a missing/extra one, a `text` for different text), at
 * the compiled path. Server HTML is written by hand, because the shapes that
 * matter are exactly the ones a correct server never emits (a stale CDN page,
 * a different build). The client side is real `transformJSX` output.
 */
import { transformJSX } from '@pyreon/compiler'
import { _fuse, _lc, For, Fragment, h } from '@pyreon/core'
import { _bind, signal, renderEffect } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindProp,
  _bindText,
  _bindSpread,
  _mountChild,
  _mountSlot,
  _setAttr,
  _setChild,
  _setChildAt,
  _setClass,
  _setHtml,
  _setStyle,
  _setStyleOnce,
  _setValue,
  _textSlot,
  _tpl,
  hydrateRoot,
} from '../index'
import { bindPolymorphicText } from '../mount'
import { onHydrationMismatch } from '../hydration-debug'

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  renderEffect,
  _bindText,
  _bindProp,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setStyleOnce,
  _setAttr,
  _setClass,
  _bindSpread,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  _mountChild,
  _setHtml,
  _setValue,
  _fuse,
  _lc,
  bindPolymorphicText,
  h,
  Fragment,
  For,
  signal,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const lowerResidualJsx = (code: string) =>
  transformSync(code, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

/**
 * Every runtime helper the emit IMPORTS must be in `RUNTIME_DEPS`, or the
 * compiled body hits a free variable and `new Function` throws a
 * `ReferenceError` the moment that line runs.
 *
 * That used to be SILENT here. The throw lands inside `hydrateComponent`'s
 * try/catch, which logs and returns `[noop, domNode]` — and until #3505 nothing
 * swept the server DOM the failed hydration never claimed, so the page still
 * showed the SERVER nodes and every assertion below passed while the client
 * build had crashed. Three specs in this file were green for exactly that
 * reason (`_setChild` / `_setChildAt` missing from the map). Assert the deps
 * instead of discovering them.
 */
function assertDepsCover(code: string): void {
  for (const m of code.matchAll(/^import\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/gm)) {
    for (const raw of (m[1] ?? '').split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim()
      if (name && !DEP_NAMES.includes(name)) {
        throw new Error(
          `[harness] the emit imports "${name}" but RUNTIME_DEPS does not provide it — ` +
            `add it, or this spec asserts the server DOM after a crashed client build`,
        )
      }
    }
  }
}

function build(source: string, globals: Record<string, unknown>, ssr: boolean): () => unknown {
  const { code } = ssr
    ? transformJSX(source, 'test.tsx', { ssr: true })
    : transformJSX(source, 'test.tsx')
  assertDepsCover(code)
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  return fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
}

/** Every element + text node under `host`, document order. */
function snapshot(host: HTMLElement): Node[] {
  const out: Node[] = []
  const walk = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n)
  return out
}

const stripComments = (html: string) => html.replace(/<!--[^>]*-->/g, '')

/** Render the SSR emit, then hydrate the CLIENT emit over it. */
async function ssrThenHydrate(
  source: string,
  globals: Record<string, unknown> = {},
): Promise<{
  host: HTMLElement
  before: Node[]
  retained: () => number
  dispose: () => void
}> {
  const html = await renderToString(h(build(source, globals, true) as never, null) as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const before = snapshot(host)
  const dispose = hydrateRoot(host, h(build(source, globals, false) as never, null))
  return {
    host,
    before,
    retained: () => {
      const after = new Set(snapshot(host))
      return before.filter((n) => after.has(n)).length
    },
    dispose,
  }
}

const hosts: HTMLElement[] = []
const track = <T extends { host: HTMLElement }>(r: T): T => {
  hosts.push(r.host)
  return r
}

afterEach(() => {
  for (const h of hosts.splice(0)) h.remove()
})



const disposers: Array<() => void> = []
afterEach(() => {
  for (const d of disposers.splice(0)) d()
})

interface Report {
  type: string
  expected: unknown
  actual: unknown
  path: string
}

/** Hydrate the compiled `source` over hand-written server HTML; return what was reported. */
function reportsFor(source: string, serverHtml: string): { reports: Report[]; host: HTMLElement } {
  const host = document.createElement('div')
  host.innerHTML = serverHtml
  document.body.appendChild(host)
  hosts.push(host)
  const reports: Report[] = []
  const off = onHydrationMismatch((c) => {
    reports.push({ type: c.type, expected: c.expected, actual: c.actual, path: c.path })
  })
  const unmount = hydrateRoot(host, h(build(source, {}, false) as never, null))
  off()
  disposers.push(unmount)
  return { reports, host }
}

const APP = (body: string) => `function App() { return ${body} }`

describe('a swapped compiled template reports where the server DOM differs', () => {
  it('reports a different element as a tag mismatch at the container path', () => {
    const { reports } = reportsFor(APP('<div class="c"><p>hi</p></div>'), '<section class="c"><p>hi</p></section>')
    expect(reports).toEqual([{ type: 'tag', expected: 'div', actual: 'section', path: 'root > div' }])
  })

  it('reports a text node where the server had no node at all (empty container)', () => {
    const { reports } = reportsFor(APP('<div class="c"><p>hi</p></div>'), '')
    expect(reports.length).toBe(1)
    expect(reports[0]).toMatchObject({ type: 'tag', expected: 'div', actual: 'null' })
  })

  it('reports a non-element server node by its node type', () => {
    const { reports } = reportsFor(APP('<div class="c"><p>hi</p></div>'), 'just text')
    expect(reports[0]).toMatchObject({ type: 'tag', expected: 'div', actual: 3 })
  })

  it('reports differing text inside the same element', () => {
    const { reports } = reportsFor(APP('<div class="c"><p>fresh</p></div>'), '<div class="c"><p>stale</p></div>')
    expect(reports).toEqual([{ type: 'text', expected: 'fresh', actual: 'stale', path: 'root > div > p > text' }])
  })

  it('reports client text where the server has an element', () => {
    const { reports } = reportsFor(APP('<div class="c"><p>hi</p></div>'), '<div class="c"><p><b>hi</b></p></div>')
    expect(reports[0]).toMatchObject({ type: 'text', expected: 'hi', actual: 'b' })
  })

  it('reports client text where the server has nothing', () => {
    const { reports } = reportsFor(APP('<div class="c"><p>hi</p></div>'), '<div class="c"><p></p></div>')
    expect(reports[0]).toMatchObject({ type: 'text', expected: 'hi', actual: 'null' })
  })

  it('reports a client element where the server has text', () => {
    const { reports } = reportsFor(APP('<div class="c"><p><b>x</b></p></div>'), '<div class="c"><p>x</p></div>')
    expect(reports[0]).toMatchObject({ type: 'tag', expected: 'b', actual: 'text' })
  })

  it('reports a client element the server never rendered', () => {
    const { reports } = reportsFor(APP('<div class="c"><p><b>x</b></p></div>'), '<div class="c"><p></p></div>')
    expect(reports[0]).toMatchObject({ type: 'tag', expected: 'b', actual: 'null' })
  })

  it('reports an extra server element the client does not render', () => {
    const { reports } = reportsFor(
      APP('<div class="c"><p><b>x</b></p></div>'),
      '<div class="c"><p><b>x</b><i>y</i></p></div>',
    )
    expect(reports[0]).toMatchObject({ type: 'tag', expected: 'null', actual: 'i' })
  })

  it('names the deepest first difference through nested elements', () => {
    const { reports } = reportsFor(
      APP('<div class="c"><section><p>a</p><p>b2</p></section></div>'),
      '<div class="c"><section><p>a</p><p>b1</p></section></div>',
    )
    expect(reports).toEqual([
      { type: 'text', expected: 'b2', actual: 'b1', path: 'root > div > section > p > text' },
    ])
  })

  it('reports nothing for a faithful server page (the control)', () => {
    const { reports, host } = reportsFor(APP('<div class="c"><p>hi</p></div>'), '<div class="c"><p>hi</p></div>')
    expect(reports).toEqual([])
    expect(host.textContent).toBe('hi')
  })
})
