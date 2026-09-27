import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeEditor } from '../components/code-editor'
import { DiffEditor } from '../components/diff-editor'
import { TabbedEditor } from '../components/tabbed-editor'
import { createEditor } from '../editor'
import { createTabbedEditor } from '../tabbed-editor'
import type { EditorInstance } from '../types'

async function until(pred: () => boolean, ms = 5000): Promise<void> {
  const start = Date.now()
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error('until(): timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}

type Mountable = EditorInstance & { _mount: (el: HTMLElement) => Promise<void> }

async function mounted(editor: EditorInstance): Promise<HTMLElement> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  await (editor as Mountable)._mount(el)
  return el
}

describe('@pyreon/code hardening', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('an instance unmounted and re-mounted into a NEW container renders there', async () => {
    const editor = createEditor({ value: 'remount me' })
    const first = mountInBrowser(h(CodeEditor, { instance: editor, style: 'height: 100px' }))
    await flush()
    await until(() => first.container.querySelector('.cm-editor') !== null)
    first.unmount()
    const second = mountInBrowser(h(CodeEditor, { instance: editor, style: 'height: 100px' }))
    await flush()
    await until(() => second.container.querySelector('.cm-editor') !== null, 2000).catch(() => {})
    expect(second.container.querySelector('.cm-editor')).not.toBeNull()
    expect(second.container.textContent).toContain('remount me')
    second.unmount()
    editor.dispose()
  })

  it('dispose() stops the post-mount sync effects (no pile-up across mount cycles)', async () => {
    const editor = createEditor({ value: 'x' }) as Mountable
    for (let i = 0; i < 3; i++) {
      await mounted(editor)
      editor.dispose()
    }
    await mounted(editor)
    const v = editor.view.peek()!
    const spy = vi.spyOn(v, 'dispatch')
    editor.theme.set('dark')
    // ONE live theme effect — the three disposed mounts must not still dispatch.
    expect(spy).toHaveBeenCalledTimes(1)
    editor.dispose()
  })

  it('highlightLine / setGutterMarker after mount re-render the decorations', async () => {
    const editor = createEditor({ value: 'a\nb\nc' })
    const el = await mounted(editor)
    editor.highlightLine(2, 'my-hl')
    await flush()
    expect(el.querySelector('.cm-line.my-hl')).not.toBeNull()
    editor.clearLineHighlights()
    await flush()
    expect(el.querySelector('.cm-line.my-hl')).toBeNull()
    editor.setGutterMarker(1, { text: '●', class: 'my-marker' })
    await flush()
    expect(el.querySelector('.my-marker')).not.toBeNull()
    editor.clearGutterMarkers()
    await flush()
    expect(el.querySelector('.my-marker')).toBeNull()
    editor.dispose()
  })

  it('setDiagnostics before mount is applied on mount', async () => {
    const editor = createEditor({ value: 'const x = 1', lint: true })
    editor.setDiagnostics([{ from: 0, to: 5, severity: 'error', message: 'pre-mount' }])
    const el = await mounted(editor)
    await flush()
    expect(el.querySelector('.cm-lintRange-error')).not.toBeNull()
    editor.dispose()
  })

  it('addKeybinding before mount is live after mount, respects the handler result, and beats defaults', async () => {
    const editor = createEditor({ value: 'abc' })
    const hits: string[] = []
    // Mod-a is selectAll in the default keymap — a custom binding must win.
    editor.addKeybinding('Mod-a', () => {
      hits.push('a')
      return true
    })
    // Mod-j is unbound on every platform. (Mod-y is redo on Linux/Windows with
    // `preventDefault: true`, so the scope handler reported "handled" there
    // no matter what our handler returned — a platform-dependent assertion.)
    editor.addKeybinding('Mod-j', () => {
      hits.push('j')
      return false
    })
    await mounted(editor)
    const v = editor.view.peek()!
    const { runScopeHandlers } = await import('@codemirror/view')
    const mac = /Mac|iPhone|iPad/.test(navigator.platform)
    const fire = (key: string) =>
      runScopeHandlers(v, new KeyboardEvent('keydown', { key, metaKey: mac, ctrlKey: !mac }), 'editor')
    expect(fire('a')).toBe(true)
    expect(hits).toEqual(['a'])
    expect(v.state.selection.main.empty).toBe(true)
    expect(fire('j')).toBe(false)
    expect(hits).toEqual(['a', 'j'])
    editor.dispose()
  })

  it('a slow language load that resolves after a newer language change does not win', async () => {
    const { registerLanguage } = await import('../languages')
    let releaseSlow!: () => void
    const slowGate = new Promise<void>((r) => (releaseSlow = r))
    const { EditorView } = await import('@codemirror/view')
    const slowMark = EditorView.editorAttributes.of({ 'data-lang': 'slow' })
    const fastMark = EditorView.editorAttributes.of({ 'data-lang': 'fast' })
    registerLanguage('slow-lang', () => slowGate.then(() => slowMark))
    registerLanguage('fast-lang', () => Promise.resolve(fastMark))
    const editor = createEditor({ value: 'x' })
    const el = await mounted(editor)
    editor.language.set('slow-lang' as never)
    editor.language.set('fast-lang' as never)
    await until(() => el.querySelector('[data-lang="fast"]') !== null)
    releaseSlow()
    await new Promise((r) => setTimeout(r, 50))
    expect(el.querySelector('.cm-editor')!.getAttribute('data-lang')).toBe('fast')
    editor.dispose()
  })

  it('a keystroke serialises the document once, not twice', async () => {
    const editor = createEditor({ value: 'hello' })
    await mounted(editor)
    const v = editor.view.peek()!
    const spy = vi.spyOn(Object.getPrototypeOf(v.state.doc), 'toString')
    // The update listener serialises once; the value→view effect must not
    // serialise a second time just to find it equal.
    v.dispatch({ changes: { from: 5, insert: '!' } })
    expect(editor.value()).toBe('hello!')
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1)
    spy.mockRestore()
    editor.dispose()
  })

  it('diagnoses both vim and emacs at once in dev', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const editor = createEditor({ value: 'x', vim: true, emacs: true })
    await mounted(editor)
    await (editor as unknown as { _mount: (e: HTMLElement) => Promise<void> })._mount(document.createElement('div'))
    expect(warn.mock.calls.some((c) => String(c[0]).includes('vim') && String(c[0]).includes('emacs'))).toBe(true)
    warn.mockRestore()
    editor.dispose()
  })

  it('indent guides follow the dark theme', async () => {
    const editor = createEditor({ value: '    x', theme: 'dark' })
    const el = await mounted(editor)
    const line = query(el, '.cm-line')
    expect(getComputedStyle(line).backgroundImage).not.toContain('229, 231, 235')
    editor.dispose()
  })
})

describe('@pyreon/code DiffEditor reactivity', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('reacts to a reactive theme prop and a reactive string `modified` prop', async () => {
    const theme = signal<'light' | 'dark'>('light')
    const modified = signal('b')
    const { container, unmount } = mountInBrowser(
      h(DiffEditor, {
        original: 'a',
        get modified() {
          return modified()
        },
        get theme() {
          return theme()
        },
        style: 'height: 200px',
      } as never),
    )
    await until(() => container.querySelectorAll('.cm-editor').length === 2)
    const bSide = container.querySelectorAll('.cm-editor')[1] as HTMLElement
    const lightBg = getComputedStyle(bSide).backgroundColor
    theme.set('dark')
    await flush()
    expect(getComputedStyle(bSide).backgroundColor).not.toBe(lightBg)
    modified.set('changed')
    await flush()
    expect(bSide.textContent).toContain('changed')
    unmount()
  })
})

describe('@pyreon/code tabbed editor', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps an undo history PER TAB — undo after a switch does not write the other tab', async () => {
    const tabbed = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'AAA' },
        { name: 'b.ts', value: 'BBB' },
      ],
    })
    const editor = tabbed.editor
    await mounted(editor)
    const v = () => editor.view.peek()!
    v().dispatch({ changes: { from: 3, insert: '1' } })
    expect(editor.value()).toBe('AAA1')
    tabbed.switchTab('b.ts')
    expect(editor.value()).toBe('BBB')
    editor.undo()
    // Nothing to undo in tab b — tab a's content must not leak in.
    expect(editor.value()).toBe('BBB')
    tabbed.switchTab('a.ts')
    expect(editor.value()).toBe('AAA1')
    editor.undo()
    expect(editor.value()).toBe('AAA')
    tabbed.dispose()
  })

  it('setModified only writes the tabs signal on an actual change', () => {
    const tabbed = createTabbedEditor({ tabs: [{ name: 'a.ts', value: 'A' }] })
    const before = tabbed.tabs.peek()
    tabbed.setModified('a.ts', false)
    expect(tabbed.tabs.peek()).toBe(before)
    tabbed.setModified('a.ts', true)
    expect(tabbed.tabs.peek()).not.toBe(before)
    const after = tabbed.tabs.peek()
    tabbed.setModified('a.ts', true)
    expect(tabbed.tabs.peek()).toBe(after)
  })

  it('renders an accessible tablist with keyboard navigation and a focusable close button', async () => {
    const tabbed = createTabbedEditor({
      tabs: [
        { name: 'a.ts', value: 'A' },
        { name: 'b.ts', value: 'B' },
        { name: 'c.ts', value: 'C' },
      ],
    })
    const { container, unmount } = mountInBrowser(h(TabbedEditor, { instance: tabbed, style: 'height: 200px' }))
    await flush()
    expect(container.querySelector('[role="tablist"]')).not.toBeNull()
    const tabs = [...container.querySelectorAll('[role="tab"]')] as HTMLElement[]
    expect(tabs).toHaveLength(3)
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false')
    // No interactive element nested inside a tab button.
    for (const t of tabs) expect(t.querySelector('button, [role="button"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Close a.ts"]')).not.toBeNull()

    tabs[0]!.focus()
    tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flush()
    expect(tabbed.activeTabId()).toBe('b.ts')
    const nowTabs = [...container.querySelectorAll('[role="tab"]')] as HTMLElement[]
    expect(document.activeElement).toBe(nowTabs[1])
    nowTabs[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await flush()
    expect(tabbed.activeTabId()).toBe('c.ts')
    unmount()
    tabbed.dispose()
  })
})
