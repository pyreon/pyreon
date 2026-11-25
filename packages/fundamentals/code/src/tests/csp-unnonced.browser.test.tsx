/**
 * CONTROL for `csp.browser.test.tsx`, in real Chromium: without a `nonce`,
 * CodeMirror's injected `<style>` is refused under `style-src` without
 * `'unsafe-inline'` and the editor renders unstyled. Proves the harness sees
 * the bug, so the passing cases in the other file are not vacuous.
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { beforeAll, describe, expect, it } from 'vitest'
import { CodeEditor } from '../components/code-editor'
import { createEditor } from '../editor'
import { applyPolicy, styleElementViolations, until } from './csp-harness'

beforeAll(applyPolicy)

describe('@pyreon/code under CSP, no nonce (control)', () => {
  it('CodeMirror’s <style> is refused and the editor renders unstyled', async () => {
    const editor = createEditor({ value: 'const x = 1' })
    const { container, unmount } = mountInBrowser(h(CodeEditor, { instance: editor, style: 'height: 120px' }))
    await flush()
    await until(() => container.querySelector('.cm-editor') !== null)
    await until(() => styleElementViolations().length > 0)
    // `.cm-editor { display: flex }` is CodeMirror's base theme; refused, it stays a block.
    expect(getComputedStyle(container.querySelector('.cm-editor') as Element).display).not.toBe('flex')
    unmount()
  })
})
