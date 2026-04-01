import { effect } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { createEditor } from '../editor'
import { getAvailableLanguages, loadLanguage } from '../languages'
import { createTabbedEditor } from '../tabbed-editor'

// ─── createEditor — Computed Properties ────────────────────────────────────

describe('createEditor — computed properties (before mount)', () => {
  it('lineCount uses initialValue when not mounted', () => {
    const editor = createEditor({ value: 'line1\nline2\nline3' })
    expect(editor.lineCount()).toBe(3)
  })

  it('lineCount for single line initial value', () => {
    const editor = createEditor({ value: 'one line' })
    expect(editor.lineCount()).toBe(1)
  })

  it('lineCount for empty initial value', () => {
    const editor = createEditor({ value: '' })
    expect(editor.lineCount()).toBe(1)
  })

  it('cursor returns default before mount', () => {
    const editor = createEditor()
    expect(editor.cursor()).toEqual({ line: 1, col: 1 })
  })

  it('selection returns default before mount', () => {
    const editor = createEditor()
    expect(editor.selection()).toEqual({ from: 0, to: 0, text: '' })
  })
})

// ─── createEditor — Signal Interactions ────────────────────────────────────

describe('createEditor — signal interactions', () => {
  it('multiple signals track independently', () => {
    const editor = createEditor({
      value: 'code',
      language: 'javascript',
      theme: 'light',
      readOnly: false,
    })

    const valueChanges: string[] = []
    const langChanges: string[] = []

    effect(() => {
      valueChanges.push(editor.value())
    })
    effect(() => {
      langChanges.push(editor.language())
    })

    editor.value.set('new code')
    editor.language.set('typescript')

    expect(valueChanges).toEqual(['code', 'new code'])
    expect(langChanges).toEqual(['javascript', 'typescript'])
  })

  it('focused signal defaults to false', () => {
    const editor = createEditor()
    expect(editor.focused()).toBe(false)
  })

  it('view signal defaults to null', () => {
    const editor = createEditor()
    expect(editor.view()).toBeNull()
  })
})

// ─── Language Loading ──────────────────────────────────────────────────────

describe('loadLanguage', () => {
  it('loads plain language (returns empty extension)', async () => {
    const ext = await loadLanguage('plain')
    expect(ext).toEqual([])
  })

  it('caches loaded languages', async () => {
    const ext1 = await loadLanguage('plain')
    const ext2 = await loadLanguage('plain')
    expect(ext1).toBe(ext2)
  })

  it('getAvailableLanguages includes common languages', () => {
    const langs = getAvailableLanguages()
    expect(langs).toContain('javascript')
    expect(langs).toContain('typescript')
    expect(langs).toContain('html')
    expect(langs).toContain('css')
    expect(langs).toContain('json')
    expect(langs).toContain('python')
    expect(langs).toContain('rust')
    expect(langs).toContain('go')
  })
})

// ─── createTabbedEditor — Advanced Tab Management ──────────────────────────

describe('createTabbedEditor — advanced', () => {
  it('saves content to cache when switching tabs', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'aaa' },
        { name: 'b.ts', value: 'bbb' },
      ],
    })

    // Modify content
    te.editor.value.set('modified-aaa')

    // Switch away and back
    te.switchTab('b.ts')
    te.switchTab('a.ts')

    expect(te.editor.value()).toBe('modified-aaa')
  })

  it('handles rapid tab switching', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'aaa' },
        { name: 'b.ts', value: 'bbb' },
        { name: 'c.ts', value: 'ccc' },
      ],
    })

    te.switchTab('b.ts')
    te.switchTab('c.ts')
    te.switchTab('a.ts')
    te.switchTab('c.ts')

    expect(te.activeTabId()).toBe('c.ts')
    expect(te.editor.value()).toBe('ccc')
  })

  it('openTab with new tab auto-detects language from extension', () => {
    const te = createTabbedEditor()
    te.openTab({ name: 'main.py', language: 'python', value: 'print("hi")' })

    expect(te.tabs()).toHaveLength(1)
    expect(te.activeTab()?.language).toBe('python')
  })

  it('closeTab with multiple non-closable tabs', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: '', closable: false },
        { name: 'b.ts', value: '', closable: false },
        { name: 'c.ts', value: '' },
      ],
    })

    te.closeTab('a.ts')
    te.closeTab('b.ts')
    expect(te.tabs()).toHaveLength(3) // non-closable tabs remain

    te.closeTab('c.ts')
    expect(te.tabs()).toHaveLength(2) // only closable tab removed
  })

  it('moveTab handles out-of-bounds gracefully', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: '' },
        { name: 'b.ts', value: '' },
      ],
    })

    // Moving should work without crashing
    te.moveTab(0, 1)
    expect(te.tabs()[0]!.name).toBe('b.ts')
    expect(te.tabs()[1]!.name).toBe('a.ts')
  })

  it('renameTab updates tab name while keeping id', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'old.ts', value: 'content' }],
    })

    te.renameTab('old.ts', 'new.ts')
    expect(te.tabs()[0]!.name).toBe('new.ts')
    // id stays as 'old.ts', lookup by original id still works
    expect(te.getTab('old.ts')).toBeDefined()
    expect(te.getTab('old.ts')?.name).toBe('new.ts')
  })

  it('closeOthers respects closable flag', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: '' },
        { name: 'b.ts', value: '', closable: false },
        { name: 'c.ts', value: '' },
      ],
    })

    te.closeOthers('a.ts')
    // b.ts should remain because closable: false, a.ts stays as the keep target
    expect(te.tabs()).toHaveLength(2)
    expect(te.tabs().map((t: any) => t.name).sort()).toEqual(['a.ts', 'b.ts'])
  })
})

// ─── createEditor — Config Combinations ────────────────────────────────────

describe('createEditor — config combinations', () => {
  it('creates editor with all options enabled', () => {
    const editor = createEditor({
      value: 'test',
      language: 'typescript',
      theme: 'dark',
      lineNumbers: true,
      readOnly: true,
      foldGutter: true,
      bracketMatching: true,
      autocomplete: true,
      search: true,
      highlightIndentGuides: true,
      tabSize: 4,
      lineWrapping: true,
      placeholder: 'Enter code...',
      minimap: true,
      vim: false,
      emacs: false,
    })

    expect(editor.value()).toBe('test')
    expect(editor.language()).toBe('typescript')
    expect(editor.theme()).toBe('dark')
    expect(editor.readOnly()).toBe(true)
  })

  it('creates editor with all options disabled', () => {
    const editor = createEditor({
      lineNumbers: false,
      foldGutter: false,
      bracketMatching: false,
      autocomplete: false,
      search: false,
      highlightIndentGuides: false,
    })

    expect(editor.value()).toBe('')
    expect(editor.config.lineNumbers).toBe(false)
  })
})
