import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { CodeEditor } from '../components/code-editor'
import { createEditor } from '../editor'

// Real-Chromium smoke for @pyreon/code.
//
// CodeMirror 6 leans on real measurement — line heights, scroll, IME,
// composition events, content-editable selection. happy-dom doesn't
// honor any of that. This suite proves the editor mounts, the
// signal-backed value round-trips, and changes flow both directions
// (editor -> signal, signal -> editor).

describe('code editor in real browser', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('mounts a CodeMirror editor with the initial value', async () => {
    const editor = createEditor({ value: 'const x = 1' })
    const { container, unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()

    // CodeMirror creates a .cm-editor wrapper.
    const cm = container.querySelector('.cm-editor')
    expect(cm).not.toBeNull()
    expect(editor.value()).toBe('const x = 1')
    // Content reaches the rendered DOM.
    expect(container.textContent).toContain('const x = 1')
    unmount()
  })

  it('writing through editor.value.set() updates the live editor', async () => {
    const editor = createEditor({ value: 'a' })
    const { container, unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()

    editor.value.set('changed')
    await flush()

    expect(editor.value()).toBe('changed')
    expect(container.textContent).toContain('changed')
    unmount()
  })

  it('exposes reactive cursor + lineCount signals', async () => {
    const editor = createEditor({ value: 'line1\nline2\nline3' })
    const { unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()

    expect(editor.lineCount()).toBe(3)
    editor.value.set('only one')
    await flush()
    expect(editor.lineCount()).toBe(1)
    unmount()
  })
})
