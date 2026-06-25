import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
// Import from the package index so `index.ts` + the registerSingleton sentinel
// are exercised (and the public surface is the unit under test).
import {
  bindRichTextToSignal,
  createRichTextEditor,
  type JSONContent,
  type RichTextEditor,
} from '../index'

// A minimal fake editor exposing only what `bindRichTextToSignal` touches —
// lets the html-format `external → editor` (setContent) + error branches run
// without a real TipTap mount (those need a real DOM, covered by the browser
// suite). `view.peek()` returns a fake TipTap view; `html()`/`json` are inert.
const fakeEditor = (
  view: { getHTML: () => string; commands: { setContent: (v: string) => void } } | null,
): RichTextEditor =>
  ({
    view: { peek: () => view },
    html: () => view?.getHTML() ?? '',
    json: Object.assign(() => EMPTY, { set: () => {}, peek: () => EMPTY }),
  }) as unknown as RichTextEditor

const doc = (text: string): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

const EMPTY: JSONContent = { type: 'doc', content: [] }

describe('createRichTextEditor (pre-mount, no TipTap)', () => {
  it('starts with an empty document and the configured signals', () => {
    const editor = createRichTextEditor()
    expect(editor.json()).toEqual(EMPTY)
    // Pre-mount the engine is not loaded, so computeds use the configured fallbacks.
    expect(editor.html()).toBe('')
    expect(editor.text()).toBe('')
    expect(editor.isEmpty()).toBe(true)
    expect(editor.characterCount()).toBe(0)
    expect(editor.canUndo()).toBe(false)
    expect(editor.canRedo()).toBe(false)
    expect(editor.view()).toBeNull()
    expect(editor.chain()).toBeNull()
  })

  it('json.set replaces the document before mount', () => {
    const editor = createRichTextEditor({ content: doc('initial') })
    expect(editor.json()).toEqual(doc('initial'))
    editor.json.set(doc('replaced'))
    expect(editor.json()).toEqual(doc('replaced'))
  })

  it('html computed falls back to a string content config before mount', () => {
    const editor = createRichTextEditor({ content: '<p>Hi</p>' })
    expect(editor.html()).toBe('<p>Hi</p>')
  })

  it('focus / blur / undo / redo / dispose are no-ops before mount', () => {
    const editor = createRichTextEditor()
    expect(() => editor.focus()).not.toThrow()
    expect(() => editor.blur()).not.toThrow()
    expect(() => editor.undo()).not.toThrow()
    expect(() => editor.redo()).not.toThrow()
    expect(() => editor.dispose()).not.toThrow()
    expect(editor.view()).toBeNull()
  })

  it('wordCount is 0 and isActive is false before mount', () => {
    const editor = createRichTextEditor({ content: '<p>two words</p>' })
    // Pre-mount the engine is not loaded — counts/active fall back.
    expect(editor.wordCount()).toBe(0)
    expect(editor.isActive('bold')).toBe(false)
    expect(editor.isActive('heading', { level: 2 })).toBe(false)
  })

  it('editable defaults from config and is a writable signal before mount', () => {
    const editor = createRichTextEditor()
    expect(editor.editable()).toBe(true)
    editor.editable.set(false)
    expect(editor.editable()).toBe(false)

    const ro = createRichTextEditor({ editable: false })
    expect(ro.editable()).toBe(false)
  })
})

describe('bindRichTextToSignal (json format)', () => {
  it('syncs the external signal INTO the editor on bind', () => {
    const ext = signal(doc('A'))
    const editor = createRichTextEditor()
    const binding = bindRichTextToSignal({ editor, signal: ext })
    expect(editor.json()).toEqual(doc('A'))
    binding.dispose()
  })

  it('propagates editor → external', () => {
    const ext = signal(EMPTY)
    const editor = createRichTextEditor()
    const binding = bindRichTextToSignal({ editor, signal: ext })
    editor.json.set(doc('B'))
    expect(ext()).toEqual(doc('B'))
    binding.dispose()
  })

  it('propagates external → editor', () => {
    const ext = signal(EMPTY)
    const editor = createRichTextEditor()
    const binding = bindRichTextToSignal({ editor, signal: ext })
    ext.set(doc('C'))
    expect(editor.json()).toEqual(doc('C'))
    binding.dispose()
  })

  it('dispose() stops both directions', () => {
    const ext = signal(EMPTY)
    const editor = createRichTextEditor()
    const binding = bindRichTextToSignal({ editor, signal: ext })
    binding.dispose()
    editor.json.set(doc('after-dispose'))
    expect(ext()).toEqual(EMPTY)
  })

  it('routes write errors to onError instead of throwing', () => {
    const errors: Error[] = []
    // A SignalLike whose set throws — the editor → external direction hits it.
    const bad = Object.assign(() => EMPTY, {
      set: () => {
        throw new Error('boom')
      },
    })
    const editor = createRichTextEditor()
    expect(() =>
      bindRichTextToSignal({ editor, signal: bad, onError: (e) => errors.push(e) }),
    ).not.toThrow()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.message).toBe('boom')
  })
})

describe('bindRichTextToSignal (html format)', () => {
  it('mirrors the editor HTML into the external string signal', () => {
    const editor = createRichTextEditor({ content: '<p>hi</p>' })
    const ext = signal('')
    const binding = bindRichTextToSignal({ editor, signal: ext, format: 'html' })
    // Pre-mount, editor.html() falls back to the configured string; the
    // editor → external direction copies it. (view is null so the
    // external → editor setContent branch is a safe no-op.)
    expect(ext()).toBe('<p>hi</p>')
    binding.dispose()
  })

  it('external → editor calls setContent on a live view when HTML differs', () => {
    const calls: string[] = []
    const editor = fakeEditor({
      getHTML: () => '<p>old</p>',
      commands: { setContent: (v) => calls.push(v) },
    })
    const ext = signal('<p>new</p>')
    const binding = bindRichTextToSignal({ editor, signal: ext, format: 'html' })
    expect(calls).toEqual(['<p>new</p>'])
    binding.dispose()
  })

  it('routes setContent errors to onError (external → editor)', () => {
    const errors: Error[] = []
    const editor = fakeEditor({
      getHTML: () => '<p>old</p>',
      commands: {
        setContent: () => {
          throw new Error('set fail')
        },
      },
    })
    const ext = signal('<p>new</p>')
    expect(() =>
      bindRichTextToSignal({ editor, signal: ext, format: 'html', onError: (e) => errors.push(e) }),
    ).not.toThrow()
    expect(errors.some((e) => e.message === 'set fail')).toBe(true)
  })
})
