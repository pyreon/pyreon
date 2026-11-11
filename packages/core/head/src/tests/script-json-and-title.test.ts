/**
 * Head serialisation of script and title text.
 *
 * 1. JSON data blocks (JSON-LD, speculation rules, import maps, any `+json` /
 *    `/json` type) are read back with `JSON.parse`. The generic body rewrite
 *    turned `<!--` into `<\!--`, which is not a JSON escape, so a JSON-LD block
 *    whose data contained `<!--` became unparseable and was dropped by
 *    crawlers. A seeded oracle embeds hostile data, parses the page with
 *    parse5 (a spec HTML tokenizer) and asserts there is no breakout element
 *    and the script text `JSON.parse`s back to the input.
 * 2. `titleTemplate` inserted the title as a replacement STRING, so `$'`,
 *    `` $` `` and `$&` in a user title expanded. Server and client share one
 *    funnel now; both are asserted.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { parse } from 'parse5'
import { beforeEach, describe, expect, test } from 'vitest'
import type { HeadTag } from '../context'
import { createHeadContext, HeadProvider, useHead } from '../index'
import { renderWithHead, serializeHead } from '../ssr'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const HOSTILE = [
  'plain',
  '</script><img src=x onerror=alert(1)>',
  '</SCRIPT\t><img src=x>',
  '<!--<script>',
  '<!--<script></script><img src=x>',
  '<script>',
  '<!--',
  '-->',
  '</style><img src=x>',
  'a\u2028b\u2029c',
  '\\',
  '"',
  '',
]
const JSON_TYPES = [
  'application/ld+json',
  'APPLICATION/LD+JSON',
  'application/json',
  'application/json; charset=utf-8',
  'speculationrules',
  'importmap',
  ' application/vnd.api+json ',
]

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)] as T
}

function value(r: () => number, depth: number): unknown {
  const k = Math.floor(r() * 5)
  if (depth > 3 || k < 2) return pick(r, HOSTILE)
  if (k === 2) return Array.from({ length: Math.floor(r() * 3) }, () => value(r, depth + 1))
  const o: Record<string, unknown> = {}
  // Keys get a suffix: Node 26.1's JSON.parse returns the wrong key for a
  // one-character ESCAPED key (`"\""`, `"\\"`, `"\n"`) once another one has been
  // parsed — an engine bug, not a serializer one, so keep keys longer than one
  // character.
  for (let i = 0; i < 3; i++) o[`${pick(r, HOSTILE)}#`] = value(r, depth + 1)
  return o
}

interface P5Node {
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
function parseHead(head: string): P5Node[] {
  const els = elements(parse(`<!doctype html><html><head>${head}</head><body></body></html>`) as unknown as P5Node)
  return els.filter((e) => !['html', 'head', 'body'].includes(e.tagName ?? ''))
}
const text = (el: P5Node) => (el.childNodes ?? []).map((c) => c.value ?? '').join('')

describe('serializeHead — JSON data blocks', () => {
  test('seeded hostile data round-trips through JSON.parse with no breakout', () => {
    const r = rng(0x1d)
    for (let i = 0; i < 400; i++) {
      const data = { '@type': 'Product', name: pick(r, HOSTILE), body: value(r, 0) }
      const type = pick(r, JSON_TYPES)
      const head = serializeHead([
        { tag: 'script', key: 'ld', props: { type }, children: JSON.stringify(data) } as HeadTag,
      ])
      const els = parseHead(head)
      expect(
        els.map((e) => e.tagName),
        `case ${i}`,
      ).toEqual(['script'])
      // Compare canonical JSON text (same keys, same order, same values): the
      // block must parse, and parse back to exactly what was serialised.
      expect(JSON.stringify(JSON.parse(text(els[0] as P5Node))), `case ${i} (${type})`).toBe(JSON.stringify(data))
    }
  })

  test('useHead({ jsonLd }) with <!-- in the data stays parseable', async () => {
    const data = { '@type': 'Article', headline: 'Use <!-- to comment in HTML', body: '</script><!--<script>' }
    function Page() {
      useHead({ jsonLd: data })
      return h('div', null)
    }
    const { head } = await renderWithHead(h(Page, null))
    const els = parseHead(head)
    const ld = els.filter((e) => e.tagName === 'script')
    expect(ld).toHaveLength(1)
    expect(JSON.parse(text(ld[0] as P5Node))).toEqual(data)
  })

  test('executable scripts and styles keep the generic rewrite and stay contained', () => {
    const r = rng(0x2e)
    for (let i = 0; i < 200; i++) {
      const payload = `${pick(r, HOSTILE)}${pick(r, HOSTILE)}${pick(r, HOSTILE)}`
      for (const tag of [
        { tag: 'script', key: 's', children: `var x = ${JSON.stringify(payload)}` },
        { tag: 'script', key: 'm', props: { type: 'module' }, children: `export const x = ${JSON.stringify(payload)}` },
        { tag: 'style', key: 'c', children: `a::after{content:${JSON.stringify(payload)}}` },
      ] as HeadTag[]) {
        const els = parseHead(serializeHead([tag]))
        expect(
          els.map((e) => e.tagName),
          `case ${i} <${tag.tag}>`,
        ).toEqual([tag.tag])
        if (tag.tag === 'script') {
          // The script still means the same thing: `\/` and `\!` are identity escapes in a JS string.
          const src = text(els[0] as P5Node).replace(/^export const x = |^var x = /, '')
          expect(new Function(`return ${src}`)(), `case ${i}`).toBe(payload)
        }
      }
    }
  })
})

describe('titleTemplate — $-patterns in the title are literal', () => {
  const TITLE = "Sale $' and $` and $& and $$"

  test('server', async () => {
    expect(serializeHead([{ tag: 'title', key: 'title', children: TITLE } as HeadTag], '%s | Shop')).toBe(
      "<title>Sale $' and $` and $&amp; and $$ | Shop</title>",
    )
    function Layout() {
      useHead({ titleTemplate: '%s — %s' })
      return h('div', null, h(Page, null))
    }
    function Page() {
      useHead({ title: TITLE })
      return h('span', null)
    }
    const { head } = await renderWithHead(h(Layout, null))
    expect(head).toContain(`<title>${TITLE.replace('&', '&amp;')} — ${TITLE.replace('&', '&amp;')}</title>`)
  })

  describe('client', () => {
    beforeEach(() => {
      for (const el of document.head.querySelectorAll('[data-pyreon-head]')) el.remove()
      document.title = ''
    })

    test('document.title', () => {
      const container = document.createElement('div')
      document.body.appendChild(container)
      function Layout() {
        useHead({ titleTemplate: '%s | Shop' })
        return h('div', null, h(Page, null))
      }
      function Page() {
        useHead({ title: TITLE })
        return h('span', null)
      }
      const cleanup = mount(h(HeadProvider, { context: createHeadContext(), children: h(Layout, null) }), container)
      expect(document.title).toBe(`${TITLE} | Shop`)
      cleanup()
    })
  })
})
