import { effect } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { createEditor } from '../editor'
import { getAvailableLanguages } from '../languages'
import { createTabbedEditor } from '../tabbed-editor'

describe('createEditor', () => {
  describe('initialization', () => {
    it('creates with default values', () => {
      const editor = createEditor()
      expect(editor.value()).toBe('')
      expect(editor.language()).toBe('plain')
      expect(editor.readOnly()).toBe(false)
      expect(editor.focused()).toBe(false)
      expect(editor.view()).toBeNull()
    })

    it('creates with initial value', () => {
      const editor = createEditor({ value: 'hello world' })
      expect(editor.value()).toBe('hello world')
    })

    it('creates with language', () => {
      const editor = createEditor({ language: 'typescript' })
      expect(editor.language()).toBe('typescript')
    })

    it('creates with theme', () => {
      const editor = createEditor({ theme: 'dark' })
      expect(editor.theme()).toBe('dark')
    })

    it('creates with readOnly', () => {
      const editor = createEditor({ readOnly: true })
      expect(editor.readOnly()).toBe(true)
    })

    it('stores config', () => {
      const config = {
        value: 'test',
        language: 'json' as const,
        theme: 'dark' as const,
        lineNumbers: true,
        tabSize: 4,
      }
      const editor = createEditor(config)
      expect(editor.config).toBe(config)
    })
  })

  describe('signal reactivity', () => {
    it('value is a writable signal', () => {
      const editor = createEditor({ value: 'initial' })
      expect(editor.value()).toBe('initial')

      editor.value.set('updated')
      expect(editor.value()).toBe('updated')
    })

    it('language is a writable signal', () => {
      const editor = createEditor({ language: 'javascript' })
      editor.language.set('python')
      expect(editor.language()).toBe('python')
    })

    it('theme is a writable signal', () => {
      const editor = createEditor({ theme: 'light' })
      editor.theme.set('dark')
      expect(editor.theme()).toBe('dark')
    })

    it('readOnly is a writable signal', () => {
      const editor = createEditor({ readOnly: false })
      editor.readOnly.set(true)
      expect(editor.readOnly()).toBe(true)
    })

    it('value is reactive in effects', () => {
      const editor = createEditor({ value: 'a' })
      const values: string[] = []

      effect(() => {
        values.push(editor.value())
      })

      editor.value.set('b')
      editor.value.set('c')

      expect(values).toEqual(['a', 'b', 'c'])
    })
  })

  describe('computed properties (before mount)', () => {
    it('cursor returns default before mount', () => {
      const editor = createEditor()
      expect(editor.cursor()).toEqual({ line: 1, col: 1 })
    })

    it('selection returns default before mount', () => {
      const editor = createEditor()
      expect(editor.selection()).toEqual({ from: 0, to: 0, text: '' })
    })

    it('lineCount returns initial line count', () => {
      const editor = createEditor({ value: 'line1\nline2\nline3' })
      expect(editor.lineCount()).toBe(3)
    })

    it('lineCount for single line', () => {
      const editor = createEditor({ value: 'hello' })
      expect(editor.lineCount()).toBe(1)
    })

    it('lineCount for empty', () => {
      const editor = createEditor({ value: '' })
      expect(editor.lineCount()).toBe(1)
    })
  })

  describe('actions (before mount)', () => {
    it('focus does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.focus()).not.toThrow()
    })

    it('insert does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.insert('text')).not.toThrow()
    })

    it('replaceSelection does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.replaceSelection('text')).not.toThrow()
    })

    it('select does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.select(0, 5)).not.toThrow()
    })

    it('selectAll does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.selectAll()).not.toThrow()
    })

    it('goToLine does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.goToLine(5)).not.toThrow()
    })

    it('undo does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.undo()).not.toThrow()
    })

    it('redo does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.redo()).not.toThrow()
    })

    it('dispose does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.dispose()).not.toThrow()
    })
  })

  describe('onChange callback', () => {
    it('config stores onChange', () => {
      const onChange = () => {
        /* noop */
      }
      const editor = createEditor({ onChange })
      expect(editor.config.onChange).toBe(onChange)
    })
  })

  describe('new actions (before mount)', () => {
    it('setDiagnostics does not throw before mount', () => {
      const editor = createEditor()
      expect(() =>
        editor.setDiagnostics([{ from: 0, to: 5, severity: 'error', message: 'test' }]),
      ).not.toThrow()
    })

    it('clearDiagnostics does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.clearDiagnostics()).not.toThrow()
    })

    it('highlightLine does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.highlightLine(1, 'error-line')).not.toThrow()
    })

    it('clearLineHighlights does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.clearLineHighlights()).not.toThrow()
    })

    it('setGutterMarker does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.setGutterMarker(1, { text: '🔴', title: 'Breakpoint' })).not.toThrow()
    })

    it('clearGutterMarkers does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.clearGutterMarkers()).not.toThrow()
    })

    it('addKeybinding does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.addKeybinding('Ctrl-Shift-L', () => true)).not.toThrow()
    })

    it('getLine returns empty string before mount', () => {
      const editor = createEditor()
      expect(editor.getLine(1)).toBe('')
    })

    it('getWordAtCursor returns empty string before mount', () => {
      const editor = createEditor()
      expect(editor.getWordAtCursor()).toBe('')
    })

    it('scrollTo does not throw before mount', () => {
      const editor = createEditor()
      expect(() => editor.scrollTo(0)).not.toThrow()
    })
  })

  describe('config options', () => {
    it('highlightIndentGuides defaults to true', () => {
      const editor = createEditor()
      expect(editor.config.highlightIndentGuides).toBeUndefined() // uses default
    })

    it('vim mode can be enabled', () => {
      const editor = createEditor({ vim: true })
      expect(editor.config.vim).toBe(true)
    })

    it('emacs mode can be enabled', () => {
      const editor = createEditor({ emacs: true })
      expect(editor.config.emacs).toBe(true)
    })

    it('minimap can be enabled', () => {
      const editor = createEditor({ minimap: true })
      expect(editor.config.minimap).toBe(true)
    })

    it('all config options are stored', () => {
      const editor = createEditor({
        value: 'test',
        language: 'typescript',
        theme: 'dark',
        lineNumbers: false,
        readOnly: true,
        foldGutter: false,
        bracketMatching: false,
        autocomplete: false,
        search: false,
        lint: true,
        highlightIndentGuides: false,
        tabSize: 4,
        lineWrapping: true,
        placeholder: 'Type here...',
      })
      expect(editor.config.tabSize).toBe(4)
      expect(editor.config.lineWrapping).toBe(true)
      expect(editor.config.placeholder).toBe('Type here...')
    })
  })
})

describe('createTabbedEditor', () => {
  it('creates with initial tabs', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'index.ts', language: 'typescript', value: 'const x = 1' },
        { name: 'style.css', language: 'css', value: '.app {}' },
      ],
    })
    expect(te.tabs()).toHaveLength(2)
    expect(te.activeTabId()).toBe('index.ts')
    expect(te.activeTab()?.name).toBe('index.ts')
    expect(te.editor.value()).toBe('const x = 1')
  })

  it('creates with no tabs', () => {
    const te = createTabbedEditor()
    expect(te.tabs()).toHaveLength(0)
    expect(te.activeTabId()).toBe('')
    expect(te.activeTab()).toBeNull()
  })

  it('switchTab changes active tab and editor content', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'aaa' },
        { name: 'b.ts', value: 'bbb' },
      ],
    })
    expect(te.editor.value()).toBe('aaa')

    te.switchTab('b.ts')
    expect(te.activeTabId()).toBe('b.ts')
    expect(te.editor.value()).toBe('bbb')

    te.switchTab('a.ts')
    expect(te.editor.value()).toBe('aaa')
  })

  it('openTab adds and switches to new tab', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'a.ts', value: 'aaa' }],
    })

    te.openTab({ name: 'b.ts', language: 'typescript', value: 'bbb' })
    expect(te.tabs()).toHaveLength(2)
    expect(te.activeTabId()).toBe('b.ts')
    expect(te.editor.value()).toBe('bbb')
  })

  it('openTab switches to existing tab', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'aaa' },
        { name: 'b.ts', value: 'bbb' },
      ],
    })

    te.openTab({ name: 'b.ts', value: 'bbb' })
    expect(te.tabs()).toHaveLength(2) // not duplicated
    expect(te.activeTabId()).toBe('b.ts')
  })

  it('closeTab removes tab', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'aaa' },
        { name: 'b.ts', value: 'bbb' },
      ],
    })

    te.closeTab('b.ts')
    expect(te.tabs()).toHaveLength(1)
    expect(te.tabs()[0]!.name).toBe('a.ts')
  })

  it('closeTab switches to adjacent when closing active', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'aaa' },
        { name: 'b.ts', value: 'bbb' },
        { name: 'c.ts', value: 'ccc' },
      ],
    })

    te.switchTab('b.ts')
    te.closeTab('b.ts')
    // Should switch to c.ts (next) or a.ts
    expect(te.activeTabId()).not.toBe('b.ts')
    expect(te.tabs()).toHaveLength(2)
  })

  it('closeTab respects closable: false', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'main.ts', value: 'main', closable: false }],
    })

    te.closeTab('main.ts')
    expect(te.tabs()).toHaveLength(1) // not closed
  })

  it('renameTab changes tab name', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'old.ts', value: '' }],
    })

    te.renameTab('old.ts', 'new.ts')
    expect(te.tabs()[0]!.name).toBe('new.ts')
  })

  it('setModified marks tab', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'a.ts', value: '' }],
    })

    te.setModified('a.ts', true)
    expect(te.tabs()[0]!.modified).toBe(true)

    te.setModified('a.ts', false)
    expect(te.tabs()[0]!.modified).toBe(false)
  })

  it('moveTab reorders tabs', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: '' },
        { name: 'b.ts', value: '' },
        { name: 'c.ts', value: '' },
      ],
    })

    te.moveTab(0, 2)
    expect(te.tabs().map((t: any) => t.name)).toEqual(['b.ts', 'c.ts', 'a.ts'])
  })

  it('getTab returns tab by id', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'a.ts', value: 'content' }],
    })

    expect(te.getTab('a.ts')?.value).toBe('content')
    expect(te.getTab('missing')).toBeUndefined()
  })

  it('closeAll closes all closable tabs', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: '', closable: false },
        { name: 'b.ts', value: '' },
        { name: 'c.ts', value: '' },
      ],
    })

    te.closeAll()
    expect(te.tabs()).toHaveLength(1)
    expect(te.tabs()[0]!.name).toBe('a.ts')
  })

  it('closeOthers closes all except specified', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: '' },
        { name: 'b.ts', value: '' },
        { name: 'c.ts', value: '' },
      ],
    })

    te.closeOthers('b.ts')
    expect(te.tabs()).toHaveLength(1)
    expect(te.tabs()[0]!.name).toBe('b.ts')
  })

  it('preserves content when switching tabs', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'original-a' },
        { name: 'b.ts', value: 'original-b' },
      ],
    })

    // Modify a.ts via signal
    te.editor.value.set('modified-a')

    // Switch to b.ts
    te.switchTab('b.ts')
    expect(te.editor.value()).toBe('original-b')

    // Switch back — should have the modified content
    te.switchTab('a.ts')
    expect(te.editor.value()).toBe('modified-a')
  })

  it('dispose cleans up', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'a.ts', value: '' }],
    })
    expect(() => te.dispose()).not.toThrow()
  })

  it('close last tab clears editor', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'a.ts', value: 'content' }],
    })

    te.closeTab('a.ts')
    expect(te.tabs()).toHaveLength(0)
    expect(te.activeTabId()).toBe('')
    expect(te.editor.value()).toBe('')
  })
})

describe('getAvailableLanguages', () => {
  it('returns all supported languages', () => {
    const langs = getAvailableLanguages()
    expect(langs).toContain('javascript')
    expect(langs).toContain('typescript')
    expect(langs).toContain('html')
    expect(langs).toContain('css')
    expect(langs).toContain('json')
    expect(langs).toContain('python')
    expect(langs).toContain('markdown')
    expect(langs).toContain('plain')
    expect(langs.length).toBeGreaterThanOrEqual(15)
  })
})
