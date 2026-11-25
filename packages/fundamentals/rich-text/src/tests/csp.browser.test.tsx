/**
 * #4825 (rich-text arm) — the editor under a strict Content Security Policy,
 * in real Chromium.
 *
 * The page carries `style-src 'self' 'nonce-…'` (no `'unsafe-inline'`), set
 * through a `<meta http-equiv>` before any editor mounts; a CSP cannot be lifted
 * once applied, so this whole file runs under it. Two inline `<style>` elements
 * are in play: TipTap's base CSS (`data-tiptap-style`) and the placeholder rule.
 *
 *   1. control — the default injection IS refused (proves the harness sees it);
 *   2. `nonce` — both are accepted, and the placeholder style applies;
 *   3. `injectStyles: false` + `styles.css` as a `<link>` — nothing injected,
 *      no violation, the placeholder style applies from the file.
 * Plus the drift lock: `styles.css` contains TipTap's injected base CSS verbatim.
 */
import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { RichText } from '../components/rich-text'
import { createRichTextEditor } from '../editor'
import type { RichTextConfig } from '../types'

const NONCE = 'pyreon-rich-text-csp-test'
const INJECTED = 'style[data-tiptap-style], style[data-pyreon-rich-text-placeholder]'
const violations: SecurityPolicyViolationEvent[] = []

beforeAll(() => {
  const meta = document.createElement('meta')
  meta.httpEquiv = 'Content-Security-Policy'
  meta.content = `style-src 'self' 'nonce-${NONCE}'`
  document.head.appendChild(meta)
  document.addEventListener('securitypolicyviolation', (e) => violations.push(e))
})

let cleanup: (() => void) | undefined

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  for (const el of document.head.querySelectorAll(`${INJECTED}, link[data-test-rich-text-css]`)) el.remove()
  document.body.innerHTML = ''
  violations.length = 0
})

async function mountEditor(config: RichTextConfig): Promise<HTMLElement> {
  violations.length = 0
  const editor = createRichTextEditor({ placeholder: 'Write…', ...config })
  const { container, unmount } = mountInBrowser(h(RichText, { instance: editor }))
  cleanup = () => {
    unmount()
    editor.dispose()
  }
  for (let i = 0; i < 100 && editor.view() === null; i++) await new Promise((r) => setTimeout(r, 10))
  if (editor.view() === null) throw new Error('editor view never mounted')
  await flush()
  await new Promise((r) => setTimeout(r, 100))

  return query<HTMLElement>(container, '.is-editor-empty')
}

const cssUrl = new URL('../../styles.css', import.meta.url).href
const placeholderContent = (el: HTMLElement) => getComputedStyle(el, '::before').content

describe('rich-text under CSP style-src without unsafe-inline (#4825)', () => {
  it('control: the default inline <style> elements are refused', async () => {
    const empty = await mountEditor({})
    expect(violations.length).toBeGreaterThan(0)
    expect(placeholderContent(empty)).not.toContain('Write')
  })

  it('`nonce` — TipTap and placeholder styles are accepted and apply', async () => {
    const empty = await mountEditor({ nonce: NONCE })
    expect(document.head.querySelectorAll(INJECTED)).toHaveLength(2)
    expect(violations.map((v) => v.effectiveDirective)).toEqual([])
    expect(placeholderContent(empty)).toContain('Write')
  })

  it('`injectStyles: false` + `@pyreon/rich-text/styles.css` — no violation, the file applies', async () => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = cssUrl
    link.setAttribute('data-test-rich-text-css', '')
    const loaded = new Promise<void>((resolve, reject) => {
      link.onload = () => resolve()
      link.onerror = () => reject(new Error('styles.css failed to load'))
    })
    document.head.appendChild(link)
    await loaded

    const empty = await mountEditor({ injectStyles: false })
    expect(document.head.querySelectorAll(INJECTED)).toHaveLength(0)
    expect(violations.map((v) => `${v.effectiveDirective} ${v.blockedURI}`)).toEqual([])
    expect(placeholderContent(empty)).toContain('Write')
    // TipTap's base rules come from the file too.
    expect(getComputedStyle(query<HTMLElement>(document.body, '.ProseMirror')).whiteSpace).toBe('break-spaces')
  })

  it('drift lock: styles.css carries the base CSS TipTap injects, verbatim', async () => {
    await mountEditor({ nonce: NONCE })
    const injected = document.head.querySelector('style[data-tiptap-style]')?.textContent ?? ''
    expect(injected.length).toBeGreaterThan(100)
    // Ask for the stylesheet itself — without `Accept: text/css` the dev server
    // answers with its JS module wrapper for the CSS.
    const file = await (await fetch(cssUrl, { headers: { Accept: 'text/css' } })).text()
    expect(file).toContain(injected)
  })
})
