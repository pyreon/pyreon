// Two arms the rest of the suite never reached, which left this package below
// its own 98% branch threshold on main:
// - `loadLanguage` degrades to an unhighlighted editor SILENTLY in production
//   (the dev build names the cause), for a missing grammar and a failing one;
// - `<CodeWebView>` forwards its own `codemirrorScript` / `codemirrorSrc` into
//   the host page it builds.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadLanguage, registerLanguage } from '../languages'
import { CodeWebView } from '../webview'

describe('loadLanguage in production', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('an unregistered grammar returns no extension and does not warn', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await loadLanguage('no-such-grammar-prod')).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('a grammar that fails to load returns no extension and does not warn', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerLanguage('broken-grammar-prod', () => Promise.reject(new Error('boom')))
    expect(await loadLanguage('broken-grammar-prod')).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('in development the same failure names the grammar', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerLanguage('broken-grammar-dev', () => Promise.reject(new Error('boom')))
    expect(await loadLanguage('broken-grammar-dev')).toEqual([])
    expect(String(warn.mock.calls[0]?.[0])).toContain('broken-grammar-dev')
  })
})

describe('<CodeWebView> host options', () => {
  const html = (v: ReturnType<typeof CodeWebView>): string => (v.props as { html: string }).html

  it('inlines a bundled codemirrorScript', () => {
    expect(html(CodeWebView({ state: { value: '' }, codemirrorScript: 'window.__CM_MARKER__=1' }))).toContain('window.__CM_MARKER__=1')
  })

  it('loads a codemirrorSrc by URL', () => {
    expect(html(CodeWebView({ state: { value: '' }, codemirrorSrc: 'https://cdn.example/cm.js' }))).toContain('src="https://cdn.example/cm.js"')
  })
})
