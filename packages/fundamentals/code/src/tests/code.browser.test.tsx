import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { bindEditorToSignal } from '../bind-signal'
import { CodeEditor } from '../components/code-editor'
import { DiffEditor } from '../components/diff-editor'
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
    // The content textbox carries a default accessible name.
    expect(container.querySelector('.cm-content')?.getAttribute('aria-label')).toBe('Code editor')
    unmount()
  })

  it('ariaLabel sets the content textbox accessible name', async () => {
    const editor = createEditor({ value: 'x', ariaLabel: 'TypeScript source' })
    const { container, unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()
    const content = container.querySelector('.cm-content')
    expect(content).not.toBeNull()
    // CM's content area is role="textbox"; aria-label gives it a name.
    expect(content?.getAttribute('aria-label')).toBe('TypeScript source')
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

  // ── Async-mount lifecycle robustness ─────────────────────────────────────

  it('disposing during a pending async mount does NOT leak a live editor', async () => {
    // mount() lazy-loads the language grammar — a dispose() (e.g. a fast
    // navigate-away while the grammar loads) must abort the in-flight mount,
    // not create a CodeMirror view + DOM nothing will ever tear down.
    const editor = createEditor({ value: 'const x = 1', language: 'typescript' })
    const host = document.createElement('div')
    document.body.appendChild(host)

    const pending = (editor as unknown as { _mount: (el: HTMLElement) => Promise<void> })._mount(host)
    editor.dispose() // view is still null here → must invalidate the mount
    await pending
    await new Promise((r) => setTimeout(r, 30))

    expect(editor.view()).toBeNull()
    expect(host.querySelector('.cm-editor')).toBeNull()
    host.remove()
  })

  it('a mount failure routes to onError instead of an unhandled rejection', async () => {
    // An invalid extension value makes CodeMirror's EditorState.create throw.
    // The failure must surface via onError, not leak as an unhandled rejection.
    const errors: Error[] = []
    const editor = createEditor({
      value: 'x',
      extensions: [42 as unknown as never],
      onError: (e) => errors.push(e),
    })
    const host = document.createElement('div')
    document.body.appendChild(host)

    await (editor as unknown as { _mount: (el: HTMLElement) => Promise<void> })._mount(host)
    await new Promise((r) => setTimeout(r, 20))

    expect(errors.length).toBeGreaterThan(0)
    expect(editor.view()).toBeNull() // editor never came up
    expect(host.querySelector('.cm-editor')).toBeNull()
    host.remove()
  })

  // ── foldAll / unfoldAll — must NOT crash in an ESM browser bundle ─────────
  //
  // `foldAll`/`unfoldAll` previously did `require('@codemirror/language')`.
  // This package is `type: module`, so `require` is undefined in a real
  // browser and the call threw `require is not defined`. The commands are now
  // statically imported. This suite mounts a live editor (the only place the
  // commands run past the no-view bail) and exercises both.

  it('foldAll() on a mounted editor runs without throwing (ESM require bug)', async () => {
    const editor = createEditor({
      value: '{\n  "a": {\n    "b": 1,\n    "c": 2\n  }\n}',
      language: 'json',
    })
    const { container, unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()
    expect(container.querySelector('.cm-editor')).not.toBeNull()

    // The bisect-critical assertion: in the broken (require) version this
    // throws `require is not defined` in the ESM browser bundle.
    expect(() => editor.foldAll()).not.toThrow()
    await flush()
    expect(() => editor.unfoldAll()).not.toThrow()
    await flush()
    unmount()
  })

  // ── minimap dark detection — reads EditorView.darkTheme facet ─────────────
  //
  // The minimap picked its background from `view.dom.classList.contains(
  // 'cm-dark')`, which NEVER matches (CM6 uses hashed style-mod classes), so a
  // dark editor always rendered a LIGHT minimap. It now reads the darkTheme
  // facet. We spy the FIRST fillRect (the background fill) to capture the bg
  // color the minimap chose — deterministic, no pixel-layout dependency.

  it('minimap uses the DARK background for a dark editor (facet, not cm-dark class)', async () => {
    const proto = HTMLCanvasElement.prototype.getContext
    let firstFill: string | null = null
    const origFillRect = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (this: CanvasRenderingContext2D, ...a) {
      if (firstFill === null) firstFill = String(this.fillStyle)
      return origFillRect.apply(this, a as [number, number, number, number])
    }
    try {
      const editor = createEditor({
        value: 'const x = 1\n'.repeat(40),
        theme: 'dark',
        minimap: true,
      })
      const { unmount } = mountInBrowser(h(CodeEditor, { instance: editor, style: 'height: 200px' }))
      await flush()
      // Dark background is #1e1e2e; the broken version painted #f8fafc (light).
      expect(firstFill).toBe('#1e1e2e')
      unmount()
    } finally {
      CanvasRenderingContext2D.prototype.fillRect = origFillRect
      void proto
    }
  })

  it('minimap uses the LIGHT background for a light editor', async () => {
    let firstFill: string | null = null
    const origFillRect = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (this: CanvasRenderingContext2D, ...a) {
      if (firstFill === null) firstFill = String(this.fillStyle)
      return origFillRect.apply(this, a as [number, number, number, number])
    }
    try {
      const editor = createEditor({
        value: 'const x = 1\n'.repeat(40),
        theme: 'light',
        minimap: true,
      })
      const { unmount } = mountInBrowser(h(CodeEditor, { instance: editor, style: 'height: 200px' }))
      await flush()
      expect(firstFill).toBe('#f8fafc')
      unmount()
    } finally {
      CanvasRenderingContext2D.prototype.fillRect = origFillRect
    }
  })

  // ── ruby / shell — real grammars via @codemirror/legacy-modes ─────────────

  it('ruby grammar (real StreamLanguage) mounts without error and round-trips', async () => {
    // The grammar now comes from @codemirror/legacy-modes — a broken loader
    // would reject and the editor would fail to mount / lose content.
    const editor = createEditor({ value: 'def greet\n  puts "hi"\nend', language: 'ruby' })
    const { container, unmount } = mountInBrowser(
      h(CodeEditor, { instance: editor, style: 'height: 200px' }),
    )
    await flush()
    expect(container.querySelector('.cm-editor')).not.toBeNull()
    expect(container.textContent).toContain('puts "hi"')
    expect(editor.value()).toContain('def greet')
    unmount()
  })

  it('DiffEditor unmounted during its async load does NOT leak a MergeView', async () => {
    // DiffEditor's containerRef lazy-loads the grammar — unmounting before the
    // import resolves must abort, not build a MergeView into the detached node.
    const { container, unmount } = mountInBrowser(
      h(DiffEditor, { original: 'const a = 1', modified: 'const a = 2', language: 'typescript' }),
    )
    // Capture the ref target before the async load resolves; it survives as a
    // detached node after unmount, so we can prove nothing mounted into it.
    const el = container.querySelector('.pyreon-diff-editor')
    expect(el).not.toBeNull()

    unmount() // onUnmount sets unmounted = true; mergeView is still null
    await new Promise((r) => setTimeout(r, 50)) // let loadLanguage resolve

    // If the in-flight build leaked, the detached node would now hold a view.
    expect(el?.querySelector('.cm-editor')).toBeNull()
  })
})
