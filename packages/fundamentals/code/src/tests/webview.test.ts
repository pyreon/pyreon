/**
 * `@pyreon/code/webview` — host-builder contract + `<CodeWebView>` emit.
 * The bridge is exercised against REAL CodeMirror in webview.browser.test.tsx.
 */
import { describe, expect, it, vi } from 'vitest'
import { WebView } from '@pyreon/primitives'
import { CodeWebView, buildCodeHostHtml } from '../webview'

describe('buildCodeHostHtml', () => {
  it('produces a page that waits for window.CM, wires the forward/reverse bridge + loop guard', () => {
    const html = buildCodeHostHtml()
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('id="pyreon-code"')
    expect(html).toContain('function waitCM(')
    expect(html).toContain('new CM.EditorView(')
    expect(html).toContain("window.addEventListener('pyreondata', apply)") // forward
    expect(html).toContain('CM.EditorView.updateListener.of') // reverse
    expect(html).toContain('if (v === cur.value) return') // loop guard
    expect(html).toContain('roComp.reconfigure') // readOnly
    expect(html).toContain('langComp.reconfigure') // language
  })

  it('inlines codemirrorScript (self-contained) over codemirrorSrc', () => {
    const html = buildCodeHostHtml({ codemirrorScript: 'window.CM={}', codemirrorSrc: 'x.js' })
    expect(html).toContain('window.CM={}')
    expect(html).not.toContain('x.js')
  })
})

describe('<CodeWebView>', () => {
  it('emits a <WebView> with the host + state as reactive data', () => {
    // An app that hands over its engine hosts the page inline…
    const vnode = CodeWebView({ state: { value: 'const x = 1', language: 'javascript' }, codemirrorScript: 'window.CM = {}' })
    expect(vnode.type).toBe(WebView)
    expect((vnode.props as { html: string }).html).toContain('EditorView')
    expect((vnode.props as { data: unknown }).data).toEqual({ value: 'const x = 1', language: 'javascript' })
    expect('onMessage' in (vnode.props as object)).toBe(false)
    expect('src' in (vnode.props as object)).toBe(false)
  })

  it('without an engine, loads the conventional page `pyreon-native assets` builds (same name on every target)', () => {
    const vnode = CodeWebView({ state: { value: '' } })
    expect((vnode.props as { src: string }).src).toBe('pyreon-code-host.html')
    expect('html' in (vnode.props as object)).toBe(false)
  })

  it('unwraps an accessor state', () => {
    const vnode = CodeWebView({ state: () => ({ value: 'x' }) })
    expect((vnode.props as { data: unknown }).data).toEqual({ value: 'x' })
  })

  it('wires onChange through onMessage, reading the `v:` edit prefix (and the legacy JSON envelope)', () => {
    const onChange = vi.fn()
    const vnode = CodeWebView({ state: { value: '' }, onChange })
    ;(vnode.props as { onMessage: (m: string) => void }).onMessage('v:typed')
    expect(onChange).toHaveBeenLastCalledWith('typed')
    ;(vnode.props as { onMessage: (m: string) => void }).onMessage(JSON.stringify({ value: 'legacy' }))
    expect(onChange).toHaveBeenLastCalledWith('legacy')
  })

  // The reverse-bridge is a STRING channel — the native side hands over
  // whatever the hosted page posted. These two arms are what stops a malformed
  // or plain-text message from being silently dropped, and neither was covered.

  it('hands a non-JSON reverse message back verbatim rather than dropping it', () => {
    const onChange = vi.fn()
    const vnode = CodeWebView({ state: { value: '' }, onChange })
    ;(vnode.props as { onMessage: (m: string) => void }).onMessage('not json at all')
    expect(onChange).toHaveBeenCalledWith('not json at all')
  })

  it('ignores well-formed JSON whose `value` is not a string', () => {
    // Valid JSON, wrong shape: the guard must not forward a non-string to a
    // consumer typed for `string`.
    const onChange = vi.fn()
    const vnode = CodeWebView({ state: { value: '' }, onChange })
    ;(vnode.props as { onMessage: (m: string) => void }).onMessage(JSON.stringify({ value: 42 }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
