import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete"
import {
  redo as cmRedo,
  undo as cmUndo,
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands"
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language"
import { setDiagnostics as cmSetDiagnostics, lintKeymap } from "@codemirror/lint"
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search"
import { Compartment, EditorState, type Extension } from "@codemirror/state"
import {
  GutterMarker as CMGutterMarker,
  crosshairCursor,
  Decoration,
  type DecorationSet,
  drawSelection,
  dropCursor,
  EditorView,
  gutter,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
  rectangularSelection,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view"
import { computed, effect, signal } from "@pyreon/reactivity"
import { loadLanguage } from "./languages"
import { minimapExtension } from "./minimap"
import { resolveTheme } from "./themes"
import type { EditorConfig, EditorInstance, EditorLanguage, EditorTheme } from "./types"

/**
 * Create a reactive code editor instance.
 *
 * The editor state (value, language, theme, cursor, selection) is backed
 * by signals. The CodeMirror EditorView is created when mounted via
 * the `<CodeEditor>` component.
 *
 * @param config - Editor configuration
 * @returns A reactive EditorInstance
 *
 * @example
 * ```tsx
 * const editor = createEditor({
 *   value: 'const x = 1',
 *   language: 'typescript',
 *   theme: 'dark',
 * })
 *
 * editor.value()           // reactive
 * editor.value.set('new')  // updates editor
 *
 * <CodeEditor instance={editor} />
 * ```
 */
export function createEditor(config: EditorConfig = {}): EditorInstance {
  const {
    value: initialValue = "",
    language: initialLanguage = "plain",
    theme: initialTheme = "light",
    lineNumbers: showLineNumbers = true,
    readOnly: initialReadOnly = false,
    foldGutter: showFoldGutter = true,
    bracketMatching: enableBracketMatching = true,
    autocomplete: enableAutocomplete = true,
    search: _enableSearch = true,
    highlightIndentGuides: enableIndentGuides = true,
    vim: enableVim = false,
    emacs: enableEmacs = false,
    tabSize: configTabSize = 2,
    lineWrapping: enableLineWrapping = false,
    placeholder: placeholderText,
    minimap: enableMinimap = false,
    extensions: userExtensions = [],
    onChange,
  } = config

  // ── Reactive state ───────────────────────────────────────────────────

  const value = signal(initialValue)
  const language = signal<EditorLanguage>(initialLanguage)
  const theme = signal<EditorTheme>(initialTheme)
  const readOnly = signal(initialReadOnly)
  const focused = signal(false)
  const view = signal<EditorView | null>(null)

  // Internal version tracker for cursor/selection reactivity
  const docVersion = signal(0)

  // ── Compartments (for dynamic reconfiguration) ─────────────────────

  const languageCompartment = new Compartment()
  const themeCompartment = new Compartment()
  const readOnlyCompartment = new Compartment()
  const extraKeymapCompartment = new Compartment()
  const keyModeCompartment = new Compartment()

  // ── Computed ─────────────────────────────────────────────────────────

  const cursor = computed(() => {
    docVersion() // subscribe to changes
    const v = view.peek()
    if (!v) return { line: 1, col: 1 }
    const pos = v.state.selection.main.head
    const line = v.state.doc.lineAt(pos)
    return { line: line.number, col: pos - line.from + 1 }
  })

  const selection = computed(() => {
    docVersion()
    const v = view.peek()
    if (!v) return { from: 0, to: 0, text: "" }
    const sel = v.state.selection.main
    return {
      from: sel.from,
      to: sel.to,
      text: v.state.sliceDoc(sel.from, sel.to),
    }
  })

  const lineCount = computed(() => {
    docVersion()
    const v = view.peek()
    return v ? v.state.doc.lines : initialValue.split("\n").length
  })

  // ── Line highlight support ──────────────────────────────────────────

  const lineHighlights = new Map<number, string>()

  const lineHighlightField = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(editorView: EditorView) {
        this.decorations = this.buildDecos(editorView)
      }

      buildDecos(editorView: EditorView): DecorationSet {
        const ranges: Array<{ from: number; deco: any }> = []
        for (const [lineNum, cls] of lineHighlights) {
          if (lineNum >= 1 && lineNum <= editorView.state.doc.lines) {
            const lineInfo = editorView.state.doc.line(lineNum)
            ranges.push({
              from: lineInfo.from,
              deco: Decoration.line({ class: cls }),
            })
          }
        }
        return Decoration.set(
          ranges.sort((a, b) => a.from - b.from).map((d) => d.deco.range(d.from)),
        )
      }

      update(upd: ViewUpdate) {
        if (upd.docChanged || upd.viewportChanged) {
          this.decorations = this.buildDecos(upd.view)
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )

  // ── Gutter marker support ──────────────────────────────────────────

  const gutterMarkers = new Map<number, { class?: string; text?: string; title?: string }>()

  class CustomGutterMarker extends CMGutterMarker {
    markerText: string
    markerTitle: string
    markerClass: string

    constructor(opts: { class?: string; text?: string; title?: string }) {
      super()
      this.markerText = opts.text ?? ""
      this.markerTitle = opts.title ?? ""
      this.markerClass = opts.class ?? ""
    }

    override toDOM() {
      const el = document.createElement("span")
      el.textContent = this.markerText
      el.title = this.markerTitle
      if (this.markerClass) el.className = this.markerClass
      el.style.cssText = "cursor: pointer; display: inline-block; width: 100%; text-align: center;"
      return el
    }
  }

  const gutterMarkerExtension = gutter({
    class: "pyreon-code-gutter-markers",
    lineMarker: (gutterView, line) => {
      const lineNo = gutterView.state.doc.lineAt(line.from).number
      const marker = gutterMarkers.get(lineNo)
      if (!marker) return null
      return new CustomGutterMarker(marker)
    },
    initialSpacer: () => new CustomGutterMarker({ text: " " }),
  })

  // ── Build extensions ─────────────────────────────────────────────────

  function buildExtensions(langExt: Extension): Extension[] {
    const exts: Extension[] = [
      // Core
      history(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      highlightSelectionMatches(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      indentUnit.of(" ".repeat(configTabSize)),

      // Keymaps
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),

      // Dynamic compartments
      languageCompartment.of(langExt),
      themeCompartment.of(resolveTheme(initialTheme)),
      readOnlyCompartment.of(EditorState.readOnly.of(initialReadOnly)),
      extraKeymapCompartment.of([]),
      keyModeCompartment.of([]),

      // Update listener — sync CM changes to signal
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString()
          // Avoid infinite loop: only set if different
          if (newValue !== value.peek()) {
            value.set(newValue)
            onChange?.(newValue)
          }
          docVersion.update((v) => v + 1)
        }
        if (update.selectionSet) {
          docVersion.update((v) => v + 1)
        }
        if (update.focusChanged) {
          focused.set(update.view.hasFocus)
        }
      }),
    ]

    // Optional features
    if (showLineNumbers) exts.push(lineNumbers())
    if (showFoldGutter) exts.push(foldGutter())
    if (enableBracketMatching) exts.push(bracketMatching(), closeBrackets())
    if (enableAutocomplete) exts.push(autocompletion())
    if (enableLineWrapping) exts.push(EditorView.lineWrapping)
    // Indent guides via theme (CM6 doesn't have a built-in extension for this)
    if (enableIndentGuides) {
      exts.push(
        EditorView.theme({
          ".cm-line": {
            backgroundImage: "linear-gradient(to right, #e5e7eb 1px, transparent 1px)",
            backgroundSize: `${configTabSize}ch 100%`,
            backgroundPosition: "0 0",
          },
        }),
      )
    }
    if (placeholderText) exts.push(placeholderExt(placeholderText))
    if (enableMinimap) exts.push(minimapExtension())

    // Line highlight decoration support
    exts.push(lineHighlightField)
    // Gutter marker support
    exts.push(gutterMarkerExtension)

    // User extensions
    exts.push(...userExtensions)

    return exts
  }

  // ── Mount helper — called by CodeEditor component ────────────────────

  let mounted = false

  async function mount(parent: HTMLElement): Promise<void> {
    if (mounted) return

    const langExt = await loadLanguage(language.peek())
    const extensions = buildExtensions(langExt)

    const state = EditorState.create({
      doc: value.peek(),
      extensions,
    })

    const editorView = new EditorView({
      state,
      parent,
    })

    view.set(editorView)
    mounted = true

    // Sync signal → editor for value changes from outside
    effect(() => {
      const val = value()
      const v = view.peek()
      if (!v) return
      const current = v.state.doc.toString()
      if (val !== current) {
        v.dispatch({
          changes: { from: 0, to: current.length, insert: val },
        })
      }
    })

    // Sync language changes
    effect(() => {
      const lang = language()
      const v = view.peek()
      if (!v) return
      loadLanguage(lang).then((ext) => {
        v.dispatch({ effects: languageCompartment.reconfigure(ext) })
      })
    })

    // Sync theme changes
    effect(() => {
      const t = theme()
      const v = view.peek()
      if (!v) return
      v.dispatch({ effects: themeCompartment.reconfigure(resolveTheme(t)) })
    })

    // Sync readOnly changes
    effect(() => {
      const ro = readOnly()
      const v = view.peek()
      if (!v) return
      v.dispatch({
        effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(ro)),
      })
    })
  }

  // ── Actions ──────────────────────────────────────────────────────────

  function focus(): void {
    view.peek()?.focus()
  }

  function insert(text: string): void {
    const v = view.peek()
    if (!v) return
    const pos = v.state.selection.main.head
    v.dispatch({ changes: { from: pos, insert: text } })
  }

  function replaceSelection(text: string): void {
    const v = view.peek()
    if (!v) return
    v.dispatch(v.state.replaceSelection(text))
  }

  function select(from: number, to: number): void {
    const v = view.peek()
    if (!v) return
    v.dispatch({ selection: { anchor: from, head: to } })
  }

  function selectAll(): void {
    const v = view.peek()
    if (!v) return
    v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } })
  }

  function goToLine(line: number): void {
    const v = view.peek()
    if (!v) return
    const lineInfo = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines))
    v.dispatch({
      selection: { anchor: lineInfo.from },
      scrollIntoView: true,
    })
    v.focus()
  }

  function undo(): void {
    const v = view.peek()
    if (v) cmUndo(v)
  }

  function redo(): void {
    const v = view.peek()
    if (v) cmRedo(v)
  }

  function foldAll(): void {
    const v = view.peek()
    if (!v) return
    const { foldAll: foldAllCmd } = require("@codemirror/language")
    foldAllCmd(v)
  }

  function unfoldAll(): void {
    const v = view.peek()
    if (!v) return
    const { unfoldAll: unfoldAllCmd } = require("@codemirror/language")
    unfoldAllCmd(v)
  }

  // ── Diagnostics ────────────────────────────────────────────────────

  function setDiagnostics(diagnostics: import("./types").Diagnostic[]): void {
    const v = view.peek()
    if (!v) return
    v.dispatch(
      cmSetDiagnostics(
        v.state,
        diagnostics.map((d) => ({
          from: d.from,
          to: d.to,
          severity: d.severity === "hint" ? "info" : d.severity,
          message: d.message,
          ...(d.source != null ? { source: d.source } : {}),
        })),
      ),
    )
  }

  function clearDiagnostics(): void {
    const v = view.peek()
    if (!v) return
    v.dispatch(cmSetDiagnostics(v.state, []))
  }

  // ── Line highlights ────────────────────────────────────────────────

  function highlightLine(line: number, className: string): void {
    lineHighlights.set(line, className)
    // Force re-render of decorations
    const v = view.peek()
    if (v) v.dispatch({ effects: [] })
  }

  function clearLineHighlights(): void {
    lineHighlights.clear()
    const v = view.peek()
    if (v) v.dispatch({ effects: [] })
  }

  // ── Gutter markers ────────────────────────────────────────────────

  function setGutterMarker(line: number, marker: import("./types").GutterMarker): void {
    gutterMarkers.set(line, marker)
    const v = view.peek()
    if (v) v.dispatch({ effects: [] })
  }

  function clearGutterMarkers(): void {
    gutterMarkers.clear()
    const v = view.peek()
    if (v) v.dispatch({ effects: [] })
  }

  // ── Custom keybindings ─────────────────────────────────────────────

  const customKeybindings: Array<{ key: string; run: () => boolean }> = []

  function addKeybinding(key: string, handler: () => boolean | undefined): void {
    customKeybindings.push({
      key,
      run: () => {
        handler()
        return true
      },
    })
    const v = view.peek()
    if (!v) return
    v.dispatch({
      effects: extraKeymapCompartment.reconfigure(keymap.of(customKeybindings)),
    })
  }

  // ── Text queries ───────────────────────────────────────────────────

  function getLine(line: number): string {
    const v = view.peek()
    if (!v) return ""
    const clamped = Math.min(Math.max(1, line), v.state.doc.lines)
    return v.state.doc.line(clamped).text
  }

  function getWordAtCursor(): string {
    const v = view.peek()
    if (!v) return ""
    const pos = v.state.selection.main.head
    const line = v.state.doc.lineAt(pos)
    const col = pos - line.from
    const text = line.text

    // Find word boundaries
    let start = col
    let end = col
    while (start > 0 && /\w/.test(text[start - 1]!)) start--
    while (end < text.length && /\w/.test(text[end]!)) end++

    return text.slice(start, end)
  }

  function scrollTo(pos: number): void {
    const v = view.peek()
    if (!v) return
    v.dispatch({
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    })
  }

  // ── Vim / Emacs mode loading ───────────────────────────────────────

  async function loadKeyMode(): Promise<void> {
    const v = view.peek()
    if (!v) return

    // Use string concat to prevent Vite from statically analyzing these optional imports
    const vimPkg = "@replit/codemirror-" + "vim"
    const emacsPkg = "@replit/codemirror-" + "emacs"

    if (enableVim) {
      try {
        const mod = await import(/* @vite-ignore */ vimPkg)
        v.dispatch({
          effects: keyModeCompartment.reconfigure(mod.vim()),
        })
      } catch {
        /* @replit/codemirror-vim not installed */
      }
    }

    if (enableEmacs) {
      try {
        const mod = await import(/* @vite-ignore */ emacsPkg)
        v.dispatch({
          effects: keyModeCompartment.reconfigure(mod.emacs()),
        })
      } catch {
        /* @replit/codemirror-emacs not installed */
      }
    }
  }

  function dispose(): void {
    const v = view.peek()
    if (v) {
      v.destroy()
      view.set(null)
      mounted = false
    }
  }

  // ── Expose mount for component ─────────────────────────────────────

  const instance: EditorInstance & { _mount: typeof mount } = {
    value,
    language,
    theme,
    readOnly,
    cursor,
    selection,
    lineCount,
    focused,
    view,
    focus,
    insert,
    replaceSelection,
    select,
    selectAll,
    goToLine,
    undo,
    redo,
    foldAll,
    unfoldAll,
    setDiagnostics,
    clearDiagnostics,
    highlightLine,
    clearLineHighlights,
    setGutterMarker,
    clearGutterMarkers,
    addKeybinding,
    getLine,
    getWordAtCursor,
    scrollTo,
    config,
    dispose,
    _mount: async (parent: HTMLElement) => {
      await mount(parent)
      await loadKeyMode()
    },
  }

  return instance
}
