/**
 * `<head>` is a serializer too, and it was the one with no guards at all.
 *
 * `serializeHead` wrote attribute NAMES raw (` ${k}="…"`) and never looked at a
 * URL, while `@pyreon/runtime-server` has run both checks on the same markup —
 * the same tags, rendered as elements — for as long as it has existed. So the
 * verdict on identical input depended on which renderer produced it.
 *
 * The predicates are imported from `@pyreon/core` rather than re-derived here;
 * these specs assert head now reaches the element renderer's verdict.
 */
import { describe, expect, it, vi } from 'vitest'
import type { HeadTag } from '../context'
import { serializeHead } from '../ssr'

const tag = (t: string, props: Record<string, string>): HeadTag =>
  ({ tag: t, props }) as unknown as HeadTag

describe('serializeHead attribute-name guard', () => {
  it('a name carrying breakout characters is DROPPED, not emitted', () => {
    // Pre-fix: `<meta name x="y" onload="z" />` — one key became three
    // attributes, the last an inline handler.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = serializeHead([tag('meta', { 'name x="y" onload': 'z' })])
    expect(html).toBe('<meta />')
    expect(html).not.toContain('onload')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could break HTML structure'))
    warn.mockRestore()
  })

  it.each([
    ['whitespace', 'a b'],
    ['quote', 'a"b'],
    ['single quote', "a'b"],
    ['equals', 'a=b'],
    ['gt', 'a>b'],
    ['lt', 'a<b'],
    ['slash', 'a/b'],
    ['newline', 'a\nb'],
    ['tab', 'a\tb'],
    ['NUL', 'a\u0000b'],
    ['DEL', 'a\u007Fb'],
    ['empty', ''],
  ])('drops a name containing %s', (_label, name) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(serializeHead([tag('meta', { [name]: 'v' })])).toBe('<meta />')
    warn.mockRestore()
  })

  it('an event-handler name is dropped on a head tag', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = serializeHead([tag('link', { rel: 'x', onload: 'alert(1)' })])
    expect(html).toBe('<link rel="x" />')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('event-handler attribute'))
    warn.mockRestore()
  })

  it('and so is an SVG-vocabulary handler name (the set is a union)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(serializeHead([tag('link', { rel: 'x', onbegin: 'alert(1)' })])).toBe('<link rel="x" />')
    warn.mockRestore()
  })

  it('ordinary names — including `data-*`, `once` and `onyx` — still render', () => {
    expect(serializeHead([tag('meta', { name: 'x', 'data-k': 'v', once: 'a', onyx: 'b' })])).toBe(
      '<meta name="x" data-k="v" once="a" onyx="b" />',
    )
  })
})

describe('serializeHead URL guard', () => {
  it('a javascript: href on <link> is DROPPED', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = serializeHead([tag('link', { rel: 'stylesheet', href: 'javascript:alert(1)' })])
    expect(html).toBe('<link rel="stylesheet" />')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unsafe URL'))
    warn.mockRestore()
  })

  it('a javascript: src on <script> is DROPPED', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(serializeHead([tag('script', { src: 'javascript:alert(1)' })])).toBe('<script></script>')
    warn.mockRestore()
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    '\tjavascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
  ])('drops %j', (payload) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(serializeHead([tag('link', { href: payload })])).toBe('<link />')
    warn.mockRestore()
  })

  it('ordinary URLs still render', () => {
    for (const ok of ['/f.ico', 'https://example.com/a.css', '#x', 'mailto:a@b.c']) {
      expect(serializeHead([tag('link', { href: ok })])).toBe(`<link href="${ok}" />`)
    }
  })

  it('a non-URL attribute is never URL-guarded (content may say anything)', () => {
    expect(serializeHead([tag('meta', { name: 'x', content: 'javascript:not-a-url' })])).toBe(
      '<meta name="x" content="javascript:not-a-url" />',
    )
  })
})

describe('the CLIENT renderer reaches the same verdict', () => {
  // Head has TWO renderers. Guarding only the string one would leave a hydrated
  // page writing what the server refused — and on the client a handler name is
  // not a byte divergence, it is a live listener.
  it('`isHeadAttrSafe` is the single predicate both call', async () => {
    const { isHeadAttrSafe } = await import('../attr-guard')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Refused
    expect(isHeadAttrSafe('name x="y" onload', 'z', 'meta')).toBe(false)
    expect(isHeadAttrSafe('', 'z', 'meta')).toBe(false)
    expect(isHeadAttrSafe('onload', 'alert(1)', 'link')).toBe(false)
    expect(isHeadAttrSafe('onbegin', 'alert(1)', 'link')).toBe(false)
    expect(isHeadAttrSafe('href', 'javascript:alert(1)', 'link')).toBe(false)
    expect(isHeadAttrSafe('src', 'javascript:alert(1)', 'script')).toBe(false)
    // Allowed
    expect(isHeadAttrSafe('rel', 'stylesheet', 'link')).toBe(true)
    expect(isHeadAttrSafe('href', '/a.css', 'link')).toBe(true)
    expect(isHeadAttrSafe('once', 'x', 'meta')).toBe(true)
    expect(isHeadAttrSafe('onyx', 'x', 'meta')).toBe(true)
    expect(isHeadAttrSafe('content', 'javascript:not-a-url', 'meta')).toBe(true)
    warn.mockRestore()
  })

  it('and it agrees with `serializeHead` on every one of those', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(serializeHead([tag('link', { rel: 'x', onload: 'alert(1)' })])).toBe('<link rel="x" />')
    expect(serializeHead([tag('link', { rel: 'x', href: '/a.css' })])).toBe(
      '<link rel="x" href="/a.css" />',
    )
    warn.mockRestore()
  })
})
