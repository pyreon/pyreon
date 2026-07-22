/**
 * `@pyreon/rich-text/webview` — host-builder contract + `<RichTextWebView>` emit.
 * The bridge is exercised against REAL TipTap in webview.browser.test.tsx.
 */
import { describe, expect, it, vi } from 'vitest'
import { WebView } from '@pyreon/primitives'
import { RichTextWebView, buildRichTextHostHtml } from '../webview'

describe('buildRichTextHostHtml', () => {
  it('waits for window.TT + wires the forward/reverse bridge + loop guard', () => {
    const html = buildRichTextHostHtml()
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('id="pyreon-richtext"')
    expect(html).toContain('function waitTT(')
    expect(html).toContain('window.TT.createEditor(')
    expect(html).toContain("window.addEventListener('pyreondata', apply)") // forward
    expect(html).toContain('onUpdate: function (json)') // reverse
    expect(html).toContain('if (s === lastPushed) return') // loop guard
    expect(html).toContain('editor.setEditable(cur.editable)') // editable
  })

  it('inlines tiptapScript over tiptapSrc', () => {
    const html = buildRichTextHostHtml({ tiptapScript: 'window.TT={}', tiptapSrc: 'x.js' })
    expect(html).toContain('window.TT={}')
    expect(html).not.toContain('x.js')
  })
})

describe('<RichTextWebView>', () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] }
  it('emits a <WebView> with the host + state as reactive data', () => {
    const vnode = RichTextWebView({ state: { content: doc } })
    expect(vnode.type).toBe(WebView)
    expect((vnode.props as { html: string }).html).toContain('createEditor')
    expect((vnode.props as { data: unknown }).data).toEqual({ content: doc })
    expect('onMessage' in (vnode.props as object)).toBe(false)
  })

  it('unwraps an accessor state', () => {
    const vnode = RichTextWebView({ state: () => ({ content: doc }) })
    expect((vnode.props as { data: unknown }).data).toEqual({ content: doc })
  })

  it('wires onChange through onMessage, parsing { content }', () => {
    const onChange = vi.fn()
    const vnode = RichTextWebView({ state: { content: null }, onChange })
    ;(vnode.props as { onMessage: (m: string) => void }).onMessage(JSON.stringify({ content: doc }))
    expect(onChange).toHaveBeenCalledWith(doc)
  })
})
