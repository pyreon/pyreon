/**
 * The client twin of `ssr-attr-guards`. `syncDom` writes the same tags the
 * serializer refuses, through three paths — a newly created tag, a patched
 * existing tag, and the `<html>`/`<body>` attribute sync — and each one calls
 * `isHeadAttrSafe` for its own reason: an unsafe name reaches `setAttribute`,
 * which THROWS on a structurally-invalid name and takes the whole head sync
 * down, and a handler name would install a live listener rather than merely
 * printing a byte the server had refused.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HeadContextValue, HeadTag } from '../context'
import { syncDom } from '../dom'

const tag = (t: string, props: Record<string, string>, key = `${t}:1`): HeadTag =>
  ({ tag: t, props, key }) as unknown as HeadTag

const ctx = (tags: HeadTag[], htmlAttrs?: Record<string, string>): HeadContextValue =>
  ({
    resolve: () => tags,
    resolveTitleTemplate: () => undefined,
    resolveHtmlAttrs: () => htmlAttrs ?? {},
    resolveBodyAttrs: () => ({}),
  }) as unknown as HeadContextValue

describe('syncDom attribute guard', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    for (const a of [...document.documentElement.attributes]) {
      document.documentElement.removeAttribute(a.name)
    }
  })

  it('refuses an unsafe attribute on a NEWLY created tag', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // `onclick`, not `onload`: the client asks the element which names are
    // handlers (`isElementEventHandlerAttr`), and happy-dom's <meta> does not
    // define `onload` — Chromium's does. The `onload` case is asserted in real
    // Chromium in head.browser.test.tsx.
    expect(() => syncDom(ctx([tag('meta', { name: 'ok', onclick: 'alert(1)' })]))).not.toThrow()
    const el = document.head.querySelector('meta')
    expect(el?.getAttribute('name')).toBe('ok')
    expect(el?.hasAttribute('onclick')).toBe(false)
    warn.mockRestore()
  })

  it('refuses an unsafe attribute when PATCHING an existing tag', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    syncDom(ctx([tag('meta', { name: 'ok' })]))
    syncDom(ctx([tag('meta', { name: 'ok', onerror: 'alert(1)' })]))
    const el = document.head.querySelector('meta')
    expect(el?.getAttribute('name')).toBe('ok')
    expect(el?.hasAttribute('onerror')).toBe(false)
    warn.mockRestore()
  })

  it('refuses an unsafe attribute in the <html> attribute sync', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => syncDom(ctx([], { lang: 'en', onclick: 'alert(1)' }))).not.toThrow()
    expect(document.documentElement.getAttribute('lang')).toBe('en')
    expect(document.documentElement.hasAttribute('onclick')).toBe(false)
    warn.mockRestore()
  })
})
