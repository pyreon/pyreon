/**
 * #4386: one text rule for a child value on every render path.
 *
 * A JSX child value in a text position is rendered by up to ten different
 * pieces of code: the `h()` mount, the compiled setters (`_setChild`,
 * `_setChildAt`), the compiled bindings (`_bindText` direct and fallback tiers,
 * `bindPolymorphicText`, a fused text run), SSR (`renderToString` and
 * `renderToStream`, the `_ssr` holes) and hydration. They coerced on their own
 * and disagreed:
 *
 *   value                 compiled text sinks   SSR / h()    hydrated
 *   ['a', 'b']            a,b                   ab           a,b
 *   ['a', null, 'b']      a,,b                  ab           a,,b
 *   ['a', false, true, 0] a,false,true,0        atrue0       a0 (h(): `true` swept)
 *   true                  true                  true         true
 *   literal {true}        '' (compiler bakes)   true         '' (swap)
 *   false at a mid slot   false                 ''           false
 *   1n, Date, {toString}  String(v)             TypeError    —
 *
 * Booleans now render nothing on every path, the documented contract
 * (`docs/.../core.md`: "Booleans, null, undefined -- rendered as nothing") that
 * the compiler already applied to a literal `{true}`.
 *
 * The rule now lives in `@pyreon/core` (`_isStructuralChild` / `_childText`)
 * and every path uses it. This file asserts, for every value kind × every
 * render shape, that a fresh client mount, the SSR string (both renderers) and
 * the hydrated DOM have the same text, and that the text is the rule's.
 *
 * Every shape is compiled through the REAL `transformJSX` (client and SSR
 * emit): vitest's own JSX transform never emits `_tpl` or the compiled text
 * sinks, so it cannot reproduce any of this.
 */
import { transformJSX } from '@pyreon/compiler'
import { _childText, _fuse, For, Fragment, h } from '@pyreon/core'
import { _bind, renderEffect, signal } from '@pyreon/reactivity'
import { renderToStream, renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _bindProp,
  _bindText,
  _mountSlot,
  _setChild,
  _setChildAt,
  _textSlot,
  _tpl,
  hydrateRoot,
  mount,
  onHydrationMismatch,
} from '../index'
import { bindPolymorphicText } from '../mount'

const DEPS = {
  _tpl,
  _bind,
  renderEffect,
  _setChild,
  _setChildAt,
  _bindText,
  _bindProp,
  _mountSlot,
  _textSlot,
  bindPolymorphicText,
  _fuse,
  h,
  Fragment,
  For,
  signal,
}

const lower = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

function build(src: string, get: () => unknown, ssr: boolean): { App: () => unknown; code: string } {
  const { code } = transformJSX(src, 'case.tsx', ssr ? { ssr: true } : {})
  for (const m of code.matchAll(/^import\s*\{([^}]*)\}/gm)) {
    for (const name of (m[1] ?? '').split(',').map((x) => x.trim().split(/\s+as\s+/).pop()!)) {
      if (name && !(name in DEPS)) throw new Error(`[harness] emit imports "${name}"; add it to DEPS`)
    }
  }
  const fn = new Function(...Object.keys(DEPS), 'get', `${lower(code)}\nreturn App`)

  return { App: fn(...Object.values(DEPS), get) as () => unknown, code }
}

/** Value kinds, with the text the rule gives each. */
const VALUES: { name: string; get: () => unknown; text: string }[] = [
  { name: "['a', 'b']", get: () => ['a', 'b'], text: 'ab' },
  { name: "['a', null, 'b']", get: () => ['a', null, 'b'], text: 'ab' },
  { name: "[['a', 'b'], 'c']", get: () => [['a', 'b'], 'c'], text: 'abc' },
  { name: "['a', false, true, 0]", get: () => ['a', false, true, 0], text: 'a0' },
  { name: '[]', get: () => [], text: '' },
  { name: 'null', get: () => null, text: '' },
  { name: 'undefined', get: () => undefined, text: '' },
  { name: 'true', get: () => true, text: '' },
  { name: 'false', get: () => false, text: '' },
  { name: '0', get: () => 0, text: '0' },
  { name: 'NaN', get: () => Number.NaN, text: 'NaN' },
  { name: '1n', get: () => BigInt(1), text: '1' },
  { name: 'Date', get: () => new Date(0), text: String(new Date(0)) },
  { name: '{ toString }', get: () => ({ toString: () => 'T' }), text: 'T' },
  { name: 'escaped text', get: () => ['<b>', '&'], text: '<b>&' },
]

/** Render shapes, named by the sink the client compile lowers them to. */
/**
 * `adopts: false` — the root element is re-created on hydration rather than
 * adopted, with identical text and no report. That is #4385 (a static mid
 * `<!>` slot has no SSR range, so the adoption verifier refuses the template),
 * not the text rule; the assertion flips there.
 */
const SHAPES: { name: string; src: string; sink: RegExp | null; adopts?: false }[] = [
  { name: '_bindText (fallback tier)', src: 'const App = () => <span>{get()}</span>', sink: /_bindText\(get,/ },
  {
    name: '_bindText (direct tier)',
    src: 'const s = signal(get()); const App = () => <span>{s()}</span>',
    sink: /_bindText\(s,/,
  },
  { name: 'bindPolymorphicText', src: 'const App = () => <span>{get(1)}</span>', sink: /bindPolymorphicText\(/ },
  {
    name: '_setChild',
    src: 'const App = () => { const v = get(); return <span>{v}</span> }',
    sink: /_setChild\(__root, v\)/,
  },
  {
    name: '_setChildAt',
    src: 'const App = () => { const v = get(); return <span><i />{v}<i /></span> }',
    sink: /_setChildAt\(/,
    adopts: false,
  },
  { name: 'fused text run', src: 'const App = () => <span>x{get()}</span>', sink: /_fuse\(/ },
  { name: 'h() accessor', src: 'const App = () => h("span", null, () => get())', sink: null },
  { name: 'h() static', src: 'const App = () => h("span", null, get())', sink: null },
  { name: 'literal {true}', src: 'const App = () => <span>{true}{get()}</span>', sink: null },
]

const stripMarkers = (s: string) => s.replace(/<!--[^>]*-->/g, '')

async function streamToString(vnode: unknown): Promise<string> {
  const reader = renderToStream(vnode as never).getReader()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out += value
  }
}

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

describe('a child value renders the same text on every path (#4386)', () => {
  for (const shape of SHAPES) {
    describe(shape.name, () => {
      it('lowers to the sink under test', () => {
        if (shape.sink === null) return
        expect(build(shape.src, () => 'x', false).code).toMatch(shape.sink)
      })

      for (const value of VALUES) {
        it(value.name, async () => {
          const prefix = shape.name === 'fused text run' ? 'x' : ''
          const want = prefix + value.text
          const client = build(shape.src, value.get, false)
          const server = build(shape.src, value.get, true)

          // Fresh client mount.
          const fresh = document.createElement('div')
          mount(h(client.App as never, null), fresh)
          expect(fresh.textContent).toBe(want)

          // Both SSR renderers.
          const html = await renderToString(h(server.App as never, null) as never)
          const streamed = await streamToString(h(server.App as never, null))
          expect(stripMarkers(streamed)).toBe(stripMarkers(html))
          const parsed = document.createElement('div')
          parsed.innerHTML = html
          expect(parsed.textContent).toBe(want)

          // Hydration: same text, nothing reported, the root element adopted.
          const host = document.createElement('div')
          document.body.appendChild(host)
          hosts.push(host)
          host.innerHTML = html
          const serverRoot = host.firstElementChild
          const reports: string[] = []
          const off = onHydrationMismatch((ctx) => reports.push(`${ctx.type}: ${ctx.expected} vs ${ctx.actual}`))
          try {
            hydrateRoot(host, h(client.App as never, null))
          } finally {
            off()
          }
          expect(host.textContent).toBe(want)
          expect(reports).toEqual([])
          if (shape.adopts !== false) expect(host.firstElementChild).toBe(serverRoot)
        })
      }
    })
  }
})

describe('_childText', () => {
  it('is the rule the table above asserts', () => {
    for (const v of VALUES) expect(_childText(v.get())).toBe(v.text)
  })
})
