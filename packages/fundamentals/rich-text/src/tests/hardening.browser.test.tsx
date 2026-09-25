import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { RichText } from '../components/rich-text'
import { createRichTextEditor } from '../editor'
import type { JSONContent } from '../types'

const doc = (text: string): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

async function waitForView(editor: ReturnType<typeof createRichTextEditor>): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (editor.view() !== null) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('editor view never mounted')
}

describe('@pyreon/rich-text hardening', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('an instance unmounted and re-mounted into a NEW container renders there', async () => {
    const editor = createRichTextEditor({ content: '<p>keep me</p>' })
    const first = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    first.unmount()
    const second = mountInBrowser(h(RichText, { instance: editor }))
    await flush()
    await new Promise((r) => setTimeout(r, 50))
    expect(second.container.querySelector('[contenteditable]')).not.toBeNull()
    expect(second.container.textContent).toContain('keep me')
    second.unmount()
    editor.dispose()
  })

  it('json.set is not an undo step', async () => {
    const editor = createRichTextEditor({ content: '<p>typed</p>' })
    const { unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    editor.json.set(doc('loaded draft'))
    await flush()
    expect(editor.canUndo()).toBe(false)
    editor.undo()
    expect(editor.text()).toBe('loaded draft')
    unmount()
    editor.dispose()
  })

  it('a json.set that throws does not leave later edits un-synced', async () => {
    const editor = createRichTextEditor({ content: '<p>a</p>' })
    const { unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    const e = editor.view.peek()!
    const real = e.chain.bind(e)
    e.chain = () => {
      throw new Error('boom')
    }
    expect(() => editor.json.set(doc('x'))).toThrow('boom')
    e.chain = real
    e.commands.insertContentAt(1, 'Z')
    await flush()
    expect(JSON.stringify(editor.json())).toContain('Z')
    unmount()
    editor.dispose()
  })

  it('placeholder renders on an empty document and is exposed as aria-placeholder', async () => {
    const editor = createRichTextEditor({ placeholder: 'Write something…' })
    const { container, unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    await flush()
    const ce = query(container, '[contenteditable]')
    expect(ce.getAttribute('aria-placeholder')).toBe('Write something…')
    const empty = query(container, '.is-editor-empty')
    expect(empty.getAttribute('data-placeholder')).toBe('Write something…')
    expect(getComputedStyle(empty, '::before').content).toContain('Write something')
    editor.json.set(doc('text'))
    await flush()
    expect(container.querySelector('.is-editor-empty')).toBeNull()
    unmount()
    editor.dispose()
  })

  it('setContent(html) on a mounted editor parses HTML and is not an undo step', async () => {
    const editor = createRichTextEditor({ content: '<p>a</p>' })
    const { container, unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    editor.setContent('<h2>Heading</h2><p>body</p>')
    await flush()
    expect(container.querySelector('h2')?.textContent).toBe('Heading')
    expect(editor.json().content?.[0]?.type).toBe('heading')
    expect(editor.canUndo()).toBe(false)
    unmount()
    editor.dispose()
  })

  it('readOnly: true mounts a non-editable surface', async () => {
    const editor = createRichTextEditor({ content: '<p>ro</p>', readOnly: true })
    const { container, unmount } = mountInBrowser(h(RichText, { instance: editor }))
    await waitForView(editor)
    expect(container.querySelector('[contenteditable="false"]')).not.toBeNull()
    unmount()
    editor.dispose()
  })
})
