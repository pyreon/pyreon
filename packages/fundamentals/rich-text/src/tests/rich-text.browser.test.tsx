import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { bindRichTextToSignal } from '../bind-signal'
import { RichText } from '../components/rich-text'
import { createRichTextEditor } from '../editor'
import type { JSONContent } from '../types'

// Real-Chromium smoke for @pyreon/rich-text.
//
// TipTap/ProseMirror lean on a real DOM — contenteditable, selection,
// transactions, content parsing. happy-dom doesn't honor any of that. This
// suite proves the editor mounts, the signal-backed document round-trips, and
// changes flow both directions (editor -> signal, signal -> editor).

const doc = (text: string): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

// _mount lazy-imports @tiptap/* (dynamic import), so the view appears a few
// microtasks after mount. Poll until it's live.
async function waitForView(
  editor: ReturnType<typeof createRichTextEditor>,
  tries = 60,
): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (editor.view() !== null) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('editor view never mounted')
}

describe('rich-text editor in real browser', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('mounts a TipTap editor with the initial content', async () => {
    const editor = createRichTextEditor({ content: '<p>Hello world</p>' })
    const { container, unmount } = mountInBrowser(
      h(RichText, { instance: editor, style: 'min-height: 8rem' }),
    )
    await waitForView(editor)
    await flush()

    // TipTap renders a contenteditable ProseMirror surface.
    const ce = container.querySelector('[contenteditable="true"]')
    expect(ce).not.toBeNull()
    expect(editor.text()).toContain('Hello world')
    expect(container.textContent).toContain('Hello world')
    editor.dispose()
    unmount()
  })

  it('sets a default accessible name and role on the content area', async () => {
    const editor = createRichTextEditor({ content: '<p>x</p>' })
    const { container, unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    await flush()

    const ce = container.querySelector('[contenteditable="true"]') as HTMLElement
    expect(ce.getAttribute('role')).toBe('textbox')
    expect(ce.getAttribute('aria-multiline')).toBe('true')
    expect(ce.getAttribute('aria-label')).toBe('Rich text editor')
    editor.dispose()
    unmount()
  })

  it('ariaLabel overrides the content-area accessible name', async () => {
    const editor = createRichTextEditor({ content: '<p>x</p>', ariaLabel: 'Post body' })
    const { container, unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    await flush()

    expect(
      container.querySelector('[contenteditable="true"]')?.getAttribute('aria-label'),
    ).toBe('Post body')
    editor.dispose()
    unmount()
  })

  it('json.set replaces the rendered content (signal -> editor)', async () => {
    const editor = createRichTextEditor({ content: '<p>before</p>' })
    const { container, unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    await flush()
    expect(container.textContent).toContain('before')

    editor.json.set(doc('after'))
    await flush()
    expect(container.textContent).toContain('after')
    expect(container.textContent).not.toContain('before')
    expect(editor.text()).toContain('after')
    editor.dispose()
    unmount()
  })

  it('a command chain edits the document (editor -> signal)', async () => {
    const editor = createRichTextEditor({ content: '<p>plain</p>' })
    const { unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    await flush()

    // Select all + bold via the TipTap chain; the document JSON should gain a
    // bold mark, and the editor.json signal should reflect the change.
    editor.chain()?.selectAll().toggleBold().run()
    await flush()
    const json = JSON.stringify(editor.json())
    expect(json).toContain('bold')
    editor.dispose()
    unmount()
  })

  it('isActive reflects marks at the selection (toolbar primitive)', async () => {
    const editor = createRichTextEditor({ content: '<p>plain</p>' })
    const { unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    await flush()

    // Mark (bold) — the primary toolbar case.
    expect(editor.isActive('bold')).toBe(false)
    editor.chain()?.selectAll().toggleBold().run()
    await flush()
    expect(editor.isActive('bold')).toBe(true)

    // Node with attrs (heading level 2). Convert the block, then place a
    // collapsed cursor inside it so isActive resolves the enclosing node.
    editor.chain()?.selectAll().setHeading({ level: 2 }).setTextSelection(2).run()
    await flush()
    expect(JSON.stringify(editor.json())).toContain('"level":2')
    expect(editor.isActive('heading', { level: 2 })).toBe(true)
    expect(editor.isActive('heading', { level: 3 })).toBe(false)
    editor.dispose()
    unmount()
  })

  it('editable signal toggles the live editor read-only state', async () => {
    const editor = createRichTextEditor({ content: '<p>x</p>' })
    const { container, unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    await flush()

    const ce = container.querySelector('[contenteditable]') as HTMLElement
    expect(ce.getAttribute('contenteditable')).toBe('true')
    expect(editor.editable()).toBe(true)

    editor.editable.set(false)
    await flush()
    expect(ce.getAttribute('contenteditable')).toBe('false')
    expect(editor.editable()).toBe(false)

    editor.editable.set(true)
    await flush()
    expect(ce.getAttribute('contenteditable')).toBe('true')
    editor.dispose()
    unmount()
  })

  it('undo / redo round-trip a content change', async () => {
    const editor = createRichTextEditor({ content: '<p>start</p>' })
    const { container, unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    await flush()

    editor.chain()?.selectAll().insertContent('changed').run()
    await flush()
    expect(container.textContent).toContain('changed')
    expect(editor.canUndo()).toBe(true)

    editor.undo()
    await flush()
    expect(container.textContent).toContain('start')
    expect(container.textContent).not.toContain('changed')

    editor.redo()
    await flush()
    expect(container.textContent).toContain('changed')
    editor.dispose()
    unmount()
  })

  it('wordCount + characterCount reflect the live document', async () => {
    const editor = createRichTextEditor({ content: '<p>one two three</p>' })
    const { unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    await flush()

    expect(editor.wordCount()).toBe(3)
    expect(editor.characterCount()).toBe('one two three'.length)
    editor.dispose()
    unmount()
  })

  it('two-way binds an external signal (bindRichTextToSignal, json)', async () => {
    const editor = createRichTextEditor({ content: '<p>seed</p>' })
    const { container, unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    await flush()

    const draft = signal<JSONContent>(editor.json())
    const binding = bindRichTextToSignal({ editor, signal: draft })

    // External write flows into the rendered editor.
    draft.set(doc('from-signal'))
    await flush()
    expect(container.textContent).toContain('from-signal')

    // Editor write flows back to the external signal.
    editor.json.set(doc('from-editor'))
    await flush()
    expect(JSON.stringify(draft())).toContain('from-editor')

    binding.dispose()
    editor.dispose()
    unmount()
  })
})
