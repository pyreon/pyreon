/**
 * `@pyreon/code` under a strict Content Security Policy, in real Chromium.
 *
 * CodeMirror writes its CSS into a `<style>` element in the document head
 * (style-mod uses a constructable stylesheet only inside a shadow root). Under
 * `style-src 'self' 'nonce-…'` that element is refused unless it carries the
 * nonce; `nonce` on `createEditor` / `<DiffEditor>` sets `EditorView.cspNonce`.
 * The control (no nonce, refused) is `csp-unnonced.browser.test.tsx`.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { beforeAll, describe, expect, it } from 'vitest'
import { CodeEditor } from '../components/code-editor'
import { DiffEditor } from '../components/diff-editor'
import { createEditor } from '../editor'
import { applyPolicy, NONCE, styleElementViolations, until } from './csp-harness'

beforeAll(applyPolicy)

describe('@pyreon/code under CSP with `nonce`', () => {
  it('createEditor({ nonce }) — no violation, and the base theme applies', async () => {
    const editor = createEditor({ value: 'const x = 1', language: 'typescript', nonce: NONCE })
    const { container, unmount } = mountInBrowser(h(CodeEditor, { instance: editor, style: 'height: 120px' }))
    await flush()
    await until(() => container.querySelector('.cm-editor') !== null)
    await new Promise((r) => setTimeout(r, 100))
    expect(styleElementViolations()).toEqual([])
    expect(getComputedStyle(container.querySelector('.cm-editor') as Element).display).toBe('flex')
    unmount()
  })

  it('<DiffEditor nonce> — side-by-side and inline, no violation', async () => {
    for (const inline of [false, true]) {
      const { container, unmount } = mountInBrowser(
        h(DiffEditor, { original: 'a\nb', modified: 'a\nc', inline, nonce: NONCE }),
      )
      await flush()
      await until(() => container.querySelector('.cm-editor') !== null)
      await new Promise((r) => setTimeout(r, 100))
      expect(styleElementViolations()).toEqual([])
      expect(getComputedStyle(container.querySelector('.cm-editor') as Element).display).toBe('flex')
      unmount()
    }
  })
})
