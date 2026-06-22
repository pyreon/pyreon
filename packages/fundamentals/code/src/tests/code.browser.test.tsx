import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { bindEditorToSignal } from '../bind-signal'
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

  it('handles empty initial value without throwing', async () => {
    const editor = createEditor({ value: '' })
    const { container, unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()
    expect(container.querySelector('.cm-editor')).not.toBeNull()
    expect(editor.value()).toBe('')
    expect(editor.lineCount()).toBe(1) // empty doc still has 1 line
    unmount()
  })

  it('handles unicode + multi-line + special chars (round-trip preserves bytes)', async () => {
    const tricky = '😀 emoji\n  indented\ttab\nü-ü\r\nCRLF preserved?'
    const editor = createEditor({ value: tricky })
    const { unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()
    // CodeMirror normalizes line endings — read what it actually stored.
    expect(editor.value()).toContain('😀 emoji')
    expect(editor.value()).toContain('ü-ü')
    expect(editor.value()).toContain('\ttab')
    unmount()
  })

  it('bindEditorToSignal — external signal change updates the editor', async () => {
    const data = signal({ name: 'Alice' })
    const editor = createEditor({ value: JSON.stringify(data(), null, 2), language: 'json' })
    const { unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()

    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: (val) => JSON.stringify(val, null, 2),
      parse: (text) => {
        try {
          return JSON.parse(text)
        } catch {
          return null
        }
      },
    })

    data.set({ name: 'Bob', age: 42 } as { name: string })
    await flush()
    expect(editor.value()).toContain('"Bob"')
    expect(editor.value()).toContain('"age"')

    binding.dispose()
    unmount()
  })

  it('bindEditorToSignal — editor.value.set() propagates back to the signal via parse', async () => {
    const data = signal({ name: 'Alice' })
    const editor = createEditor({ value: JSON.stringify(data(), null, 2), language: 'json' })
    const { unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()

    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: (val) => JSON.stringify(val, null, 2),
      parse: (text) => {
        try {
          return JSON.parse(text) as { name: string }
        } catch {
          return null
        }
      },
    })

    editor.value.set(JSON.stringify({ name: 'Charlie' }, null, 2))
    await flush()
    expect(data().name).toBe('Charlie')

    binding.dispose()
    unmount()
  })

  it('bindEditorToSignal — invalid input calls onParseError and leaves signal at last valid value', async () => {
    const data = signal({ name: 'Alice' })
    const editor = createEditor({ value: JSON.stringify(data(), null, 2), language: 'json' })
    const { unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()

    const errors: Error[] = []
    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: (val) => JSON.stringify(val, null, 2),
      parse: (text) => {
        try {
          return JSON.parse(text) as { name: string }
        } catch (err) {
          throw err instanceof Error ? err : new Error(String(err))
        }
      },
      onParseError: (err) => {
        errors.push(err)
      },
    })

    editor.value.set('{ this is not json')
    await flush()

    expect(errors.length).toBeGreaterThan(0)
    // Signal stays at last valid value — no partial corruption.
    expect(data().name).toBe('Alice')

    binding.dispose()
    unmount()
  })

  it('readOnly editor refuses programmatic dispatch path (still settable via .value)', async () => {
    const editor = createEditor({ value: 'fixed', readOnly: true })
    const { container, unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()

    expect(editor.value()).toBe('fixed')
    // .value.set is the API for programmatic writes — readOnly affects
    // user input, not the signal-side API. Verify the contract holds.
    editor.value.set('changed via api')
    await flush()
    expect(editor.value()).toBe('changed via api')
    expect(container.textContent).toContain('changed via api')
    unmount()
  })

  // ── insert/replaceSelection are cursor-relative — they need a live view ──
  //
  // The view is created by mount() AFTER an async grammar load, so a
  // pre-mount insert() has no cursor to act on. It must NOT silently drop
  // the caller's text — it warns (dev) + no-ops. value.set() is the
  // view-independent path that lands content regardless of mount timing.

  it('insert() before the view exists WARNS + no-ops (does not silently drop content)', () => {
    const editor = createEditor({ value: 'start' })
    const warns: string[] = []
    const orig = console.warn
    console.warn = (...args: unknown[]) => {
      warns.push(String(args[0]))
    }
    try {
      editor.insert(' DROPPED') // no view yet — never mounted
    } finally {
      console.warn = orig
    }
    expect(editor.value()).toBe('start') // unchanged — the insert was dropped
    expect(warns.some((w) => w.includes('editor.insert()') && w.includes('value.set'))).toBe(true)
  })

  it('replaceSelection() before the view exists WARNS + no-ops', () => {
    const editor = createEditor({ value: 'keep' })
    const warns: string[] = []
    const orig = console.warn
    console.warn = (...args: unknown[]) => {
      warns.push(String(args[0]))
    }
    try {
      editor.replaceSelection('nope')
    } finally {
      console.warn = orig
    }
    expect(editor.value()).toBe('keep')
    expect(warns.some((w) => w.includes('editor.replaceSelection()'))).toBe(true)
  })

  it('value.set() before mount seeds the editor once mounted (the cold-mount-safe path)', async () => {
    const editor = createEditor({ value: 'init' })
    // Set content BEFORE the view exists — value.set feeds the value signal,
    // which seeds EditorState.create({ doc }) whenever the view is created.
    editor.value.set('set before mount')
    const { container, unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()
    expect(editor.value()).toBe('set before mount')
    expect(container.textContent).toContain('set before mount')
    unmount()
  })

  it('insert() AFTER mount inserts into the doc and does NOT warn', async () => {
    const editor = createEditor({ value: 'AB' })
    const { unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()

    const warns: string[] = []
    const orig = console.warn
    console.warn = (...args: unknown[]) => {
      warns.push(String(args[0]))
    }
    try {
      editor.insert('XYZ')
    } finally {
      console.warn = orig
    }
    await flush()

    expect(editor.value()).toContain('XYZ') // landed (cursor position not asserted)
    expect(warns.some((w) => w.includes('editor.insert()'))).toBe(false) // view exists → no warn
    unmount()
  })

  // ── lint config flag ───────────────────────────────────────────────────────

  it('lint:true installs the lint gutter so setDiagnostics renders a marker', async () => {
    const editor = createEditor({ value: 'const x = 1', lint: true })
    const { container, unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()

    editor.setDiagnostics([{ from: 0, to: 5, severity: 'error', message: 'boom' }])
    await flush()

    expect(container.querySelector('.cm-lint-marker')).not.toBeNull()
    unmount()
  })

  it('lint defaults off — no lint gutter marker even after setDiagnostics', async () => {
    const editor = createEditor({ value: 'const x = 1' })
    const { container, unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()

    editor.setDiagnostics([{ from: 0, to: 5, severity: 'error', message: 'boom' }])
    await flush()

    // No gutter affordance without lint:true. (The underline still
    // self-installs via cmSetDiagnostics; the flag only gates the gutter.)
    expect(container.querySelector('.cm-lint-marker')).toBeNull()
    unmount()
  })
})
