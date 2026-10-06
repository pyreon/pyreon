/**
 * Regression lock — explicit `{' '}` in COMPILED templates (#3832, compiled arm).
 *
 * The compiled `_tpl` path has its own whitespace handling (the verifier's
 * `matchDomAgainstTemplate`, plan replay, mount slots) — these specs compile
 * REAL JSX through `transformJSX` and assert both the final HTML and node
 * RETENTION, so a fix that merely rebuilds would not pass.
 */
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, _fuse, h } from '@pyreon/core'
import { _bind, signal, renderEffect } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindText,
  _bindProp,
  _mountSlot,
  _textSlot,
  _setAttr,
  _setClass,
  _setStyle,
  _tpl,
  hydrateRoot,
  onHydrationMismatch,
} from '../index'
import { bindPolymorphicText } from '../mount'

// ─── Counter sink ────────────────────────────────────────────────────────────
const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }
let counts: Record<string, number>
let prevSink: typeof g.__pyreon_count__
beforeEach(() => {
  counts = {}
  prevSink = g.__pyreon_count__
  g.__pyreon_count__ = (name, n = 1) => {
    counts[name] = (counts[name] ?? 0) + n
  }
})
afterEach(() => {
  g.__pyreon_count__ = prevSink
  document.body.innerHTML = ''
})
const tplAdopted = () => counts['runtime.tpl.adopt'] ?? 0

// ─── Real-transform harness ──────────────────────────────────────────────────
const RUNTIME_DEPS = {
  _fuse,
  _tpl,
  _bind,
  renderEffect,
  _bindText,
  _bindProp,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _mountSlot,
  _textSlot,
  bindPolymorphicText,
  h,
  Fragment,
  For,
  signal,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

/** The Pyreon transform leaves COMPONENT JSX for the app's downstream jsx
 * pass — lower it to h() so `new Function` can evaluate. */
const lowerResidualJsx = (code: string) =>
  transformSync(code, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

function compileApp(source: string, globals: Record<string, unknown> = {}): () => unknown {
  const { code } = transformJSX(source, 'test.tsx')
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

/** How many of the pre-hydration nodes are still in the tree afterwards. */
function retained(before: Node[], host: HTMLElement): number {
  const after = new Set(snapshot(host))
  return before.filter((n) => after.has(n)).length
}


/** SSR `tree`, hydrate `client` over it, and report what happened. */
async function roundTrip(tree: unknown, client: string) {
  const html = await renderToString(tree as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const before = snapshot(host)
  const App = compileApp(client)
  const dispose = hydrateRoot(host, h(App as never, null))
  return { html, host, before, dispose, out: host.innerHTML, kept: retained(before, host) }
}


const CASES: Array<[string, unknown, string]> = [
  [
    'static elements around {" "}',
    () => h('div', null, h('i', null, 'x'), ' ', h('b', null, 'y')),
    `const App = () => <div><i>x</i>{' '}<b>y</b></div>`,
  ],
  [
    'leading and trailing {" "}',
    () => h('div', null, ' ', h('i', null, 'x'), ' '),
    `const App = () => <div>{' '}<i>x</i>{' '}</div>`,
  ],
  [
    '{" "} between element and reactive slot',
    () => h('div', null, h('i', null, 'x'), ' ', () => 'v', ' ', h('b', null, 'y')),
    `const App = () => { const s = signal('v'); return <div><i>x</i>{' '}{s()}{' '}<b>y</b></div> }`,
  ],
  [
    'component then {" "} then element',
    () => h('div', null, h('span', null, 'One'), ' ', h('span', null, 'Two')),
    `const First = () => <span>One</span>
     const App = () => <div><First />{' '}<span>Two</span></div>`,
  ],
  [
    'multi-space {"  "}',
    () => h('p', null, h('i', null, 'x'), '  ', h('b', null, 'y')),
    `const App = () => <p><i>x</i>{'  '}<b>y</b></p>`,
  ],
]

describe('compiled explicit whitespace hydrates in place', () => {
  for (const [name, mk, client] of CASES) {
    it(name, async () => {
      const mismatches: string[] = []
      const off = onHydrationMismatch((c) => mismatches.push(`${c.type}:${c.expected}|${c.actual}`))
      const { html, host, before, dispose, kept } = await roundTrip((mk as () => never)(), client)
      off()
      const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '')
      expect(strip(host.innerHTML)).toBe(strip(html))
      expect(mismatches).toEqual([])
      expect(kept).toBe(before.length)
      expect(tplAdopted()).toBeGreaterThan(0)
      dispose()
    })
  }
})
