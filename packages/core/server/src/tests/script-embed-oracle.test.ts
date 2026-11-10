// @vitest-environment node
/**
 * Breakout + round-trip ORACLE for every executable `<script>window.X=…</script>`
 * state embed the server emits: loader data (`buildScripts`, `buildScriptsFast`,
 * `renderPage`) and the store-state twin (`renderPage` via the dehydrate bridge).
 *
 * Seeded hostile payloads (script-closing / comment-opening strings, U+2028 and
 * U+2029, own `__proto__` keys at every depth, mixed case, keys that LOOK like a
 * `"__proto__":` token inside string contents) are embedded in a full HTML page
 * and parsed by parse5, a spec-compliant HTML tokenizer. For each case:
 *   - no element other than the expected scripts appears (no breakout);
 *   - each script's text, EVALUATED as JavaScript, yields a value with exactly
 *     the shape `JSON.parse` gives — the same own keys at every level and only
 *     `Object.prototype` / `Array.prototype` as prototypes. A JS object literal
 *     treats a `"__proto__":` key as a prototype setter, so an embed that is a
 *     bare JSON literal drops the key and grafts its value into the chain.
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { createRouter, RouterView, stringifyLoaderDataForScript } from '@pyreon/router'
import { parse } from 'parse5'
import { afterEach, describe, expect, test } from 'vitest'
import { buildClientEntryTag, buildScripts, buildScriptsFast } from '../html'
import { renderPage } from '../render-page'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const HOSTILE_STRINGS = [
  'plain',
  '</script><img src=x onerror=alert(1)>',
  '</SCRIPT\t><img src=x>',
  '<!--<script>',
  '<!--<script></script><img src=x>',
  '<script>',
  '-->',
  '</',
  'a\u2028b\u2029c',
  '"__proto__":{"admin":true}',
  '\\"__proto__\\":',
  'back\\',
  '"',
  '',
]
const KEYS = [
  '__proto__',
  '__PROTO__',
  '__proto__ ',
  ' __proto__',
  'constructor',
  'prototype',
  'toString',
  '</script>',
  '<!--',
  '"__proto__":',
  '\\',
  'k\u2028',
  'name',
  'id',
]

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)] as T
}

function value(r: () => number, depth: number): unknown {
  const k = Math.floor(r() * 7)
  if (depth > 3 && k > 3) return pick(r, HOSTILE_STRINGS)
  switch (k) {
    case 0:
      return pick(r, HOSTILE_STRINGS)
    case 1:
      return Math.floor(r() * 1000) - 500
    case 2:
      return r() > 0.5 ? null : true
    case 3:
      return Array.from({ length: Math.floor(r() * 4) }, () => value(r, depth + 1))
    default:
      return object(r, depth + 1)
  }
}

/** Builds with JSON.parse so an own `__proto__` key is a real own key (as in loader data from `res.json()`). */
function object(r: () => number, depth: number): Record<string, unknown> {
  const n = Math.floor(r() * 4) + (depth === 0 ? 1 : 0)
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    parts.push(`${JSON.stringify(pick(r, KEYS))}:${JSON.stringify(value(r, depth))}`)
  }
  return JSON.parse(`{${parts.join(',')}}`) as Record<string, unknown>
}

/** Same own keys (in order), same values, and only the standard prototypes, at every depth. */
function assertSameShape(actual: unknown, expected: unknown, path: string): void {
  if (expected === null || typeof expected !== 'object') {
    expect(actual, path).toBe(expected)
    return
  }
  expect(actual !== null && typeof actual === 'object', `${path} is an object`).toBe(true)
  const a = actual as object
  if (Array.isArray(expected)) {
    expect(Array.isArray(a), `${path} is an array`).toBe(true)
    expect(Object.getPrototypeOf(a), `${path} prototype`).toBe(Array.prototype)
  } else {
    expect(Object.getPrototypeOf(a), `${path} prototype`).toBe(Object.prototype)
  }
  const keys = Object.keys(expected)
  expect(Object.keys(a), `${path} own keys`).toEqual(keys)
  for (const key of keys) {
    const own = Object.getOwnPropertyDescriptor(a, key)
    assertSameShape(own?.value, Object.getOwnPropertyDescriptor(expected, key)?.value, `${path}[${JSON.stringify(key)}]`)
  }
}

interface P5Node {
  nodeName: string
  tagName?: string
  value?: string
  childNodes?: P5Node[]
  content?: P5Node
}

function elements(node: P5Node, out: P5Node[] = []): P5Node[] {
  if (node.tagName) out.push(node)
  for (const c of node.childNodes ?? []) elements(c, out)
  if (node.content) elements(node.content, out)
  return out
}

/**
 * Parse `scriptsHtml` as body content, assert it is exactly `scriptCount` script
 * elements (plus an optional module entry script) and evaluate the inline ones.
 */
function evaluateEmbed(scriptsHtml: string, inlineCount: number): Record<string, unknown> {
  const doc = parse(`<!doctype html><html><head></head><body>${scriptsHtml}</body></html>`) as unknown as P5Node
  const els = elements(doc)
  const unexpected = els.filter((e) => !['html', 'head', 'body', 'script'].includes(e.tagName ?? ''))
  expect(unexpected.map((e) => e.tagName), 'elements outside the script embed').toEqual([])
  const inline = els.filter((e) => e.tagName === 'script' && (e.childNodes?.length ?? 0) > 0)
  expect(inline.length, 'inline script count').toBe(inlineCount)
  const win: Record<string, unknown> = {}
  for (const s of inline) {
    const text = (s.childNodes ?? []).map((c) => c.value ?? '').join('')
    // The script runs as classic script text: evaluate exactly what the browser would.
    new Function('window', text)(win)
  }
  return win
}

const CASES = 300

describe('inline state embed — breakout + round-trip oracle', () => {
  test('stringifyLoaderDataForScript in the store-state template', () => {
    const r = rng(0x5eed)
    for (let i = 0; i < CASES; i++) {
      const input = { store: object(r, 0), other: object(r, 0) }
      const html = `<script>window.__PYREON_STORE_STATE__=${stringifyLoaderDataForScript(input)}</script>`
      const win = evaluateEmbed(html, 1)
      assertSameShape(win.__PYREON_STORE_STATE__, JSON.parse(JSON.stringify(input)), `case ${i}`)
    }
  })

  test('buildScripts and buildScriptsFast (loader data)', () => {
    const r = rng(0xc0ffee)
    const entry = buildClientEntryTag('/entry.js')
    for (let i = 0; i < CASES; i++) {
      const input = { '/users': object(r, 0), '/users/:id': object(r, 0) }
      const expected = JSON.parse(JSON.stringify(input))
      for (const html of [buildScripts('/entry.js', input), buildScriptsFast(entry, input, 'n0nce')]) {
        const win = evaluateEmbed(html, 1)
        assertSameShape(win.__PYREON_LOADER_DATA__, expected, `case ${i}`)
      }
    }
  })

  test('the payload stays JSON text when no own __proto__ key exists', () => {
    const input = { a: ['</script>', '<!--', '\u2028'], b: { constructor: 1, prototype: 2 } }
    expect(JSON.parse(stringifyLoaderDataForScript(input))).toEqual(input)
  })
})

describe('renderPage — loader data and store state keep an own __proto__ key', () => {
  interface Bridge {
    __PYREON_DEHYDRATE_STORES__?: () => Record<string, Record<string, unknown>>
  }
  afterEach(() => {
    delete (globalThis as Bridge).__PYREON_DEHYDRATE_STORES__
  })

  const Page: ComponentFn = () => h('main', null, 'hi')

  test('seeded payloads through the real page pipeline', async () => {
    const r = rng(0xbadc0de)
    for (let i = 0; i < 40; i++) {
      const loaderResult = object(r, 0)
      const storeState = { session: object(r, 0) }
      ;(globalThis as Bridge).__PYREON_DEHYDRATE_STORES__ = () => storeState
      const router = createRouter({
        routes: [{ path: '/', component: Page, loader: async () => loaderResult }],
        mode: 'history',
        url: '/',
      })
      const result = await renderPage(() => h(RouterView, null), router as never, '/')
      if (result.kind !== 'html') throw new Error('expected html')
      const win = evaluateEmbed(result.loaderScript, 2)
      assertSameShape(win.__PYREON_LOADER_DATA__, JSON.parse(JSON.stringify({ '/': loaderResult })), `loader ${i}`)
      assertSameShape(win.__PYREON_STORE_STATE__, JSON.parse(JSON.stringify(storeState)), `store ${i}`)
    }
  })

  test('a user-keyed map holding "__proto__" hydrates with the key intact', async () => {
    const byName = JSON.parse('{"alice":{"admin":false},"__proto__":{"admin":true}}') as Record<string, unknown>
    const router = createRouter({
      routes: [{ path: '/', component: Page, loader: async () => ({ byName }) }],
      mode: 'history',
      url: '/',
    })
    const result = await renderPage(() => h(RouterView, null), router as never, '/')
    if (result.kind !== 'html') throw new Error('expected html')
    const win = evaluateEmbed(result.loaderScript, 1)
    const client = (win.__PYREON_LOADER_DATA__ as Record<string, { byName: Record<string, { admin: boolean } | undefined> }>)['/']!
      .byName
    expect(Object.keys(client)).toEqual(['alice', '__proto__'])
    // A missing user must not inherit the smuggled entry's fields.
    expect(client.bob).toBeUndefined()
    expect('admin' in client).toBe(false)
  })
})
