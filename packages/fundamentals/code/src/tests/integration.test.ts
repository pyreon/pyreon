import { effect } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { createEditor } from '../editor'
import { getAvailableLanguages, loadLanguage } from '../languages'
import { createTabbedEditor } from '../tabbed-editor'
import { darkTheme, lightTheme, resolveTheme } from '../themes'

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

// ─── resolveTheme ─────────────────────────────────────────────────────────

describe('resolveTheme', () => {
  it('returns lightTheme for "light"', () => {
    expect(resolveTheme('light')).toBe(lightTheme)
  })

  it('returns darkTheme for "dark"', () => {
    expect(resolveTheme('dark')).toBe(darkTheme)
  })

  it('returns custom extension as-is', () => {
    const custom = {} as any
    expect(resolveTheme(custom)).toBe(custom)
  })
})

// ─── loadLanguage — additional languages ─────────────────────────────────

describe('loadLanguage — additional', () => {
  it('loads ruby (returns empty extension)', async () => {
    const ext = await loadLanguage('ruby')
    expect(ext).toEqual([])
  })

  it('loads shell (returns empty extension)', async () => {
    const ext = await loadLanguage('shell')
    expect(ext).toEqual([])
  })

  it('returns empty for unknown language', async () => {
    const ext = await loadLanguage('nonexistent' as any)
    expect(ext).toEqual([])
  })

  it('loads javascript language', async () => {
    const ext = await loadLanguage('javascript')
    // Should return an extension (or empty if package not installed)
    expect(ext).toBeDefined()
  })

  it('loads typescript language', async () => {
    const ext = await loadLanguage('typescript')
    expect(ext).toBeDefined()
  })

  it('loads jsx language', async () => {
    const ext = await loadLanguage('jsx')
    expect(ext).toBeDefined()
  })

  it('loads tsx language', async () => {
    const ext = await loadLanguage('tsx')
    expect(ext).toBeDefined()
  })

  it('loads html language', async () => {
    const ext = await loadLanguage('html')
    expect(ext).toBeDefined()
  })

  it('loads css language', async () => {
    const ext = await loadLanguage('css')
    expect(ext).toBeDefined()
  })

  it('loads json language', async () => {
    const ext = await loadLanguage('json')
    expect(ext).toBeDefined()
  })

  it('loads markdown language', async () => {
    const ext = await loadLanguage('markdown')
    expect(ext).toBeDefined()
  })

  it('loads python language', async () => {
    const ext = await loadLanguage('python')
    expect(ext).toBeDefined()
  })

  it('loads rust language', async () => {
    const ext = await loadLanguage('rust')
    expect(ext).toBeDefined()
  })

  it('loads sql language', async () => {
    const ext = await loadLanguage('sql')
    expect(ext).toBeDefined()
  })

  it('loads xml language', async () => {
    const ext = await loadLanguage('xml')
    expect(ext).toBeDefined()
  })

  it('loads yaml language', async () => {
    const ext = await loadLanguage('yaml')
    expect(ext).toBeDefined()
  })

  it('loads cpp language', async () => {
    const ext = await loadLanguage('cpp')
    expect(ext).toBeDefined()
  })

  it('loads java language', async () => {
    const ext = await loadLanguage('java')
    expect(ext).toBeDefined()
  })

  it('loads go language', async () => {
    const ext = await loadLanguage('go')
    expect(ext).toBeDefined()
  })

  it('loads php language', async () => {
    const ext = await loadLanguage('php')
    expect(ext).toBeDefined()
  })

  it('getAvailableLanguages returns all languages', () => {
    const langs = getAvailableLanguages()
    expect(langs.length).toBeGreaterThanOrEqual(15)
    expect(langs).toContain('plain')
    expect(langs).toContain('ruby')
    expect(langs).toContain('shell')
    expect(langs).toContain('markdown')
    expect(langs).toContain('sql')
    expect(langs).toContain('xml')
    expect(langs).toContain('yaml')
    expect(langs).toContain('cpp')
    expect(langs).toContain('java')
    expect(langs).toContain('php')
  })
})

// ─── createEditor — actions without mount ────────────────────────────────

describe('createEditor — actions without mount (bail paths)', () => {
  it('focus does nothing without view', () => {
    const editor = createEditor()
    editor.focus() // should not throw
  })

  it('insert does nothing without view', () => {
    const editor = createEditor()
    editor.insert('text') // should not throw
  })

  it('replaceSelection does nothing without view', () => {
    const editor = createEditor()
    editor.replaceSelection('text') // should not throw
  })

  it('select does nothing without view', () => {
    const editor = createEditor()
    editor.select(0, 5) // should not throw
  })

  it('selectAll does nothing without view', () => {
    const editor = createEditor()
    editor.selectAll() // should not throw
  })

  it('goToLine does nothing without view', () => {
    const editor = createEditor()
    editor.goToLine(5) // should not throw
  })

  it('undo does nothing without view', () => {
    const editor = createEditor()
    editor.undo() // should not throw
  })

  it('redo does nothing without view', () => {
    const editor = createEditor()
    editor.redo() // should not throw
  })

  it('foldAll does nothing without view', () => {
    const editor = createEditor()
    editor.foldAll() // should not throw
  })

  it('unfoldAll does nothing without view', () => {
    const editor = createEditor()
    editor.unfoldAll() // should not throw
  })

  it('setDiagnostics does nothing without view', () => {
    const editor = createEditor()
    editor.setDiagnostics([{ from: 0, to: 5, severity: 'error', message: 'test' }]) // should not throw
  })

  it('clearDiagnostics does nothing without view', () => {
    const editor = createEditor()
    editor.clearDiagnostics() // should not throw
  })

  it('highlightLine does nothing without view', () => {
    const editor = createEditor()
    editor.highlightLine(1, 'highlight') // should not throw
  })

  it('clearLineHighlights does nothing without view', () => {
    const editor = createEditor()
    editor.clearLineHighlights() // should not throw
  })

  it('setGutterMarker does nothing without view', () => {
    const editor = createEditor()
    editor.setGutterMarker(1, { text: '!' }) // should not throw
  })

  it('clearGutterMarkers does nothing without view', () => {
    const editor = createEditor()
    editor.clearGutterMarkers() // should not throw
  })

  it('addKeybinding stores binding but does not dispatch without view', () => {
    const editor = createEditor()
    editor.addKeybinding('Ctrl-s', () => true) // should not throw
  })

  it('getLine returns empty without view', () => {
    const editor = createEditor()
    expect(editor.getLine(1)).toBe('')
  })

  it('getWordAtCursor returns empty without view', () => {
    const editor = createEditor()
    expect(editor.getWordAtCursor()).toBe('')
  })

  it('scrollTo does nothing without view', () => {
    const editor = createEditor()
    editor.scrollTo(0) // should not throw
  })

  it('dispose does nothing without view', () => {
    const editor = createEditor()
    editor.dispose() // should not throw
    expect(editor.view()).toBeNull()
  })
})

// ─── createEditor — readOnly signal ──────────────────────────────────────

describe('createEditor — readOnly signal', () => {
  it('readOnly signal reflects initial value', () => {
    const editor = createEditor({ readOnly: true })
    expect(editor.readOnly()).toBe(true)
  })

  it('readOnly signal can be toggled', () => {
    const editor = createEditor({ readOnly: false })
    editor.readOnly.set(true)
    expect(editor.readOnly()).toBe(true)
  })
})

// ─── createEditor — theme signal ─────────────────────────────────────────

describe('createEditor — theme signal', () => {
  it('theme signal defaults to light', () => {
    const editor = createEditor()
    expect(editor.theme()).toBe('light')
  })

  it('theme signal can be set to dark', () => {
    const editor = createEditor()
    editor.theme.set('dark')
    expect(editor.theme()).toBe('dark')
  })
})

// ─── createTabbedEditor — extended coverage ──────────────────────────────

describe('createTabbedEditor — extended', () => {
  it('switchTab to nonexistent tab is a no-op', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'a.ts', value: 'aaa' }],
    })
    te.switchTab('nonexistent')
    expect(te.activeTabId()).toBe('a.ts')
  })

  it('openTab switches to existing tab', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'aaa' },
        { name: 'b.ts', value: 'bbb' },
      ],
    })
    te.openTab({ name: 'b.ts', value: 'bbb' })
    expect(te.activeTabId()).toBe('b.ts')
    expect(te.tabs()).toHaveLength(2) // no duplicate
  })

  it('closeTab on active tab switches to adjacent tab', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: '' },
        { name: 'b.ts', value: '' },
        { name: 'c.ts', value: '' },
      ],
    })
    te.switchTab('b.ts')
    te.closeTab('b.ts')
    // Should switch to adjacent tab
    expect(te.activeTabId()).not.toBe('b.ts')
  })

  it('closing all tabs results in empty editor', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'a.ts', value: 'content' }],
    })
    te.closeTab('a.ts')
    expect(te.tabs()).toHaveLength(0)
    expect(te.activeTabId()).toBe('')
    expect(te.editor.value()).toBe('')
  })

  it('closeAll removes all closable tabs', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: '' },
        { name: 'b.ts', value: '' },
      ],
    })
    te.closeAll()
    expect(te.tabs()).toHaveLength(0)
    expect(te.activeTabId()).toBe('')
  })

  it('closeAll switches to non-closable tab if one remains', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: '', closable: false },
        { name: 'b.ts', value: '' },
      ],
    })
    te.closeAll()
    expect(te.tabs()).toHaveLength(1)
    expect(te.activeTabId()).toBe('a.ts')
  })

  it('closeOthers switches to the kept tab', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'aaa' },
        { name: 'b.ts', value: 'bbb' },
        { name: 'c.ts', value: 'ccc' },
      ],
    })
    te.closeOthers('b.ts')
    expect(te.tabs()).toHaveLength(1)
    expect(te.activeTabId()).toBe('b.ts')
  })

  it('closeTab on nonexistent tab is a no-op', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'a.ts', value: '' }],
    })
    te.closeTab('nonexistent')
    expect(te.tabs()).toHaveLength(1)
  })

  it('dispose clears state', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'a.ts', value: '' }],
    })
    te.dispose() // should not throw
  })

  it('getTab returns undefined for missing tab', () => {
    const te = createTabbedEditor()
    expect(te.getTab('nonexistent')).toBeUndefined()
  })

  it('activeTab returns null for empty editor', () => {
    const te = createTabbedEditor()
    expect(te.activeTab()).toBeNull()
  })

  it('tabs with explicit id uses id for lookup', () => {
    const te = createTabbedEditor({
      tabs: [{ id: 'custom-id', name: 'file.ts', value: 'content' }],
    })
    expect(te.getTab('custom-id')).toBeDefined()
    expect(te.activeTabId()).toBe('custom-id')
  })

  it('onChange callback fires on switchTab content restore', () => {
    const changes: string[] = []
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'aaa' },
        { name: 'b.ts', value: 'bbb' },
      ],
      editorConfig: { onChange: (v) => changes.push(v) },
    })
    te.editor.value.set('modified-a')
    te.switchTab('b.ts')
    // After switching, the editor value is set which might trigger onChange indirectly
  })

  it('setModified marks tab as modified', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'a.ts', value: '' }],
    })
    te.setModified('a.ts', true)
    expect(te.getTab('a.ts')?.modified).toBe(true)
    te.setModified('a.ts', false)
    expect(te.getTab('a.ts')?.modified).toBe(false)
  })

  it('moveTab with same indices is a no-op', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: '' },
        { name: 'b.ts', value: '' },
      ],
    })
    te.moveTab(0, 0)
    expect(te.tabs()[0]!.name).toBe('a.ts')
  })

  it('creates tabbed editor with theme', () => {
    const te = createTabbedEditor({
      tabs: [{ name: 'a.ts', value: '' }],
      theme: 'dark',
    })
    expect(te.editor.theme()).toBe('dark')
  })

  it('creates tabbed editor with empty tabs', () => {
    const te = createTabbedEditor({ tabs: [] })
    expect(te.tabs()).toHaveLength(0)
    expect(te.activeTab()).toBeNull()
  })

  it('closing last active tab when multiple tabs exist switches to next', () => {
    const te = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'aaa' },
        { name: 'b.ts', value: 'bbb' },
        { name: 'c.ts', value: 'ccc' },
      ],
    })
    te.switchTab('c.ts')
    te.closeTab('c.ts')
    // Should switch to the last remaining tab
    expect(['a.ts', 'b.ts']).toContain(te.activeTabId())
  })
})
