import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import {
  redo as cmRedo,
  undo as cmUndo,
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import {
  bracketMatching,
  foldAll as cmFoldAll,
  unfoldAll as cmUnfoldAll,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import { lintGutter, setDiagnostics as cmSetDiagnostics, lintKeymap } from '@codemirror/lint'
import {
  openSearchPanel as cmOpenSearchPanel,
  highlightSelectionMatches,
  searchKeymap,
} from '@codemirror/search'
import { Compartment, EditorState, type Extension, Prec, StateEffect } from '@codemirror/state'
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
} from '@codemirror/view'
import { computed, type Effect, effect, signal } from '@pyreon/reactivity'
import { loadLanguage } from './languages'
import { minimapExtension } from './minimap'
import { resolveTheme } from './themes'
import type {
  Diagnostic,
  EditorConfig,
  EditorInstance,
  EditorLanguage,
  EditorTheme,
} from './types'

/**
 * Dispatched when an imperative decoration store (line highlights, gutter
 * markers) changes. An empty `dispatch({ effects: [] })` is NOT enough: it is
 * neither a doc nor a viewport change, so a ViewPlugin that rebuilds only on
 * those (and a gutter with no `lineMarkerChange`) never re-reads the store —
 * post-mount `highlightLine()` / `setGutterMarker()` calls silently did nothing.
 */
const refreshDecorations = StateEffect.define<null>()

const hasRefresh = (upd: ViewUpdate): boolean =>
  upd.transactions.some((tr) => tr.effects.some((e) => e.is(refreshDecorations)))

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
    value: initialValue = '',
    language: initialLanguage = 'plain',
    theme: initialTheme = 'light',
    lineNumbers: showLineNumbers = true,
    readOnly: initialReadOnly = false,
    editable: initialEditable = true,
    foldGutter: showFoldGutter = true,
    bracketMatching: enableBracketMatching = true,
    autocomplete: enableAutocomplete = true,
    search: enableSearch = true,
    lint: enableLint = false,
    highlightIndentGuides: enableIndentGuides = true,
    vim: enableVim = false,
    emacs: enableEmacs = false,
    tabSize: configTabSize = 2,
    lineWrapping: enableLineWrapping = false,
    placeholder: placeholderText,
    minimap: enableMinimap = false,
    ariaLabel: configAriaLabel = 'Code editor',
    extensions: userExtensions = [],
    onChange,
    onError,
  } = config

  // ── Reactive state ───────────────────────────────────────────────────

  const value = signal(initialValue)
  const language = signal<EditorLanguage>(initialLanguage)
  const theme = signal<EditorTheme>(initialTheme)
  const readOnly = signal(initialReadOnly)
  const editable = signal(initialEditable)
  const focused = signal(false)
  const view = signal<EditorView | null>(null)

  // Internal version tracker for cursor/selection reactivity
  const docVersion = signal(0)

  // ── Compartments (for dynamic reconfiguration) ─────────────────────

  const languageCompartment = new Compartment()
  const themeCompartment = new Compartment()
  const readOnlyCompartment = new Compartment()
  const editableCompartment = new Compartment()
  const extraKeymapCompartment = new Compartment()
  const keyModeCompartment = new Compartment()

  // ── Computed ─────────────────────────────────────────────────────────

  const cursor = computed(() => {
    docVersion() // subscribe to changes
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return { line: 1, col: 1 }
    const pos = v.state.selection.main.head
    const line = v.state.doc.lineAt(pos)
    return { line: line.number, col: pos - line.from + 1 }
  })

  const selection = computed(() => {
    docVersion()
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return { from: 0, to: 0, text: '' }
    const sel = v.state.selection.main
    return {
      from: sel.from,
      to: sel.to,
      text: v.state.sliceDoc(sel.from, sel.to),
    }
  })

  const lineCount = computed(() => {
    docVersion()
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    return v ? v.state.doc.lines : initialValue.split('\n').length
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
        if (upd.docChanged || upd.viewportChanged || hasRefresh(upd)) {
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
      this.markerText = opts.text ?? ''
      this.markerTitle = opts.title ?? ''
      this.markerClass = opts.class ?? ''
    }

    override toDOM(hostView: EditorView): HTMLElement {
      // Use the host EditorView's ownerDocument instead of the global —
      // this is both SSR-safe (no `document` global access) and more
      // correct (multi-document scenarios like iframes / shadow roots use
      // their own document instance).
      const el = hostView.dom.ownerDocument.createElement('span')
      el.textContent = this.markerText
      el.title = this.markerTitle
      if (this.markerClass) el.className = this.markerClass
      el.style.cssText = 'cursor: pointer; display: inline-block; width: 100%; text-align: center;'
      return el
    }
  }

  const gutterMarkerExtension = gutter({
    class: 'pyreon-code-gutter-markers',
    lineMarker: (gutterView, line) => {
      const lineNo = gutterView.state.doc.lineAt(line.from).number
      const marker = gutterMarkers.get(lineNo)
      if (!marker) return null
      return new CustomGutterMarker(marker)
    },
    initialSpacer: () => new CustomGutterMarker({ text: ' ' }),
    lineMarkerChange: hasRefresh,
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
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      indentUnit.of(' '.repeat(configTabSize)),

      // Accessible name for the content textbox — CM sets role="textbox" +
      // aria-multiline but no name, so a screen reader announces just
      // "edit text, multiline" without it. User `extensions` are pushed AFTER
      // this, so a consumer-supplied contentAttributes aria-label still wins.
      EditorView.contentAttributes.of({ 'aria-label': configAriaLabel }),

      // Keymaps
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        // search: false omits the Mod-F/find-replace keymap. The programmatic
        // `openSearchPanel(editor)` helper still works — deliberate escape hatch.
        ...(enableSearch ? searchKeymap : []),
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...(enableLint ? lintKeymap : []),
        indentWithTab,
      ]),

      // Dynamic compartments
      languageCompartment.of(langExt),
      // Seeded from the CURRENT signal values, not the config — a state built
      // after mount (a re-mount, a tabbed-editor tab's first visit) must carry
      // the live theme/readOnly/editable and any keybindings added so far.
      themeCompartment.of(resolveTheme(theme.peek())),
      readOnlyCompartment.of(EditorState.readOnly.of(readOnly.peek())),
      editableCompartment.of(EditorView.editable.of(editable.peek())),
      extraKeymapCompartment.of(customKeymap()),
      keyModeCompartment.of([]),

      // Update listener — sync CM changes to signal
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          // The value→view effect already knows the text it just applied —
          // don't serialise the whole document again to rediscover it.
          if (applyingExternal === null) {
            const newValue = update.state.doc.toString()
            docText = newValue
            // Avoid infinite loop: only set if different
            if (newValue !== value.peek()) {
              value.set(newValue)
              onChange?.(newValue)
            }
          } else {
            docText = applyingExternal
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
    if (enableSearch) exts.push(highlightSelectionMatches())
    if (showLineNumbers) exts.push(lineNumbers())
    if (showFoldGutter) exts.push(foldGutter())
    if (enableBracketMatching) exts.push(bracketMatching(), closeBrackets())
    if (enableAutocomplete) exts.push(autocompletion())
    if (enableLineWrapping) exts.push(EditorView.lineWrapping)
    // Lint gutter — renders the error/warning markers for diagnostics set via
    // setDiagnostics(). The diagnostic underlines self-install through
    // cmSetDiagnostics regardless; this flag (default off) adds the gutter
    // affordance + the lint navigation keymap (gated above).
    if (enableLint) exts.push(lintGutter())
    // Indent guides via theme (CM6 doesn't have a built-in extension for this)
    // `&light` / `&dark` follow the active theme's dark flag, so the guides
    // stay visible (and not glaring) under a dark or custom dark theme.
    // `baseTheme` (not `theme`): only base themes understand `&light`/`&dark`.
    if (enableIndentGuides) {
      const guide = (color: string) => ({
        backgroundImage: `linear-gradient(to right, ${color} 1px, transparent 1px)`,
        backgroundSize: `${configTabSize}ch 100%`,
        backgroundPosition: '0 0',
      })
      exts.push(
        EditorView.baseTheme({
          '&light .cm-line': guide('#e5e7eb'),
          '&dark .cm-line': guide('#313244'),
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
  // Mount-attempt generation. `mount()` lazy-loads the language grammar
  // (async), so a `dispose()` can land WHILE the grammar import is in flight —
  // at which point `view` is still null and `dispose()` no-ops. `dispose()`
  // bumps this token; `mount()` captures it before its awaits and bails
  // (without creating a leaked EditorView) if it changed. Closes the
  // dispose-during-pending-mount leak (orphaned CodeMirror view + DOM).
  let mountToken = 0
  // The signal→view sync effects created by a mount. They run outside any
  // component owner (mount resolves after an async grammar load), so nothing
  // disposes them automatically — `dispose()` must, or every mount/dispose
  // cycle leaves one more set dispatching into a destroyed view and retaining
  // the whole editor.
  let syncEffects: Effect[] = []
  // Last text known to be in the view. Lets the value→view effect recognise
  // the echo of a keystroke without serialising the whole document again.
  let docText = ''
  // Non-null while the value→view effect dispatches `value` into the view —
  // the update listener then takes the text from here instead of re-reading it.
  let applyingExternal: string | null = null
  // Generation of language changes — a slow grammar import that resolves after
  // a newer language was selected must not win.
  let languageVersion = 0

  async function mount(parent: HTMLElement): Promise<void> {
    if (mounted) {
      // Re-mount of a live instance into a new container (the `<CodeEditor>`
      // that owned the old one unmounted). The view is user-owned and survives
      // that, so MOVE it rather than leaving the new container empty.
      const v = view.peek()
      if (v && v.dom.parentElement !== parent) {
        parent.appendChild(v.dom)
        v.requestMeasure()
      }
      return
    }

    const token = ++mountToken

    const mountedLanguage = language.peek()
    try {
      const langExt = await loadLanguage(mountedLanguage)
      // Superseded while loading (disposed / re-mounted) — abort cleanly.
      if (token !== mountToken) return

      const extensions = buildExtensions(langExt)

      docText = value.peek()
      const state = EditorState.create({
        doc: docText,
        extensions,
      })

      const editorView = new EditorView({
        state,
        parent,
      })

      // Disposed during the synchronous view construction (defensive) — tear
      // down the just-created view rather than leaking it.
      if (token !== mountToken) {
        editorView.destroy()
        return
      }

      view.set(editorView)
      mounted = true
      // Diagnostics set before the view existed were stored, not dropped.
      if (pendingDiagnostics.length > 0) applyDiagnostics(editorView, pendingDiagnostics)
    } catch (err) {
      // Mount failed (throwing extension, failed grammar import). Surface it
      // instead of leaving an unhandled promise rejection: route to the user
      // `onError`, else log a `[Pyreon]`-prefixed message in dev.
      const error = err instanceof Error ? err : new Error(String(err))
      if (onError) {
        onError(error)
      } else if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.error('[Pyreon] @pyreon/code failed to mount the editor:', error)
      }
      return
    }

    // Sync signal → editor for value changes from outside
    syncEffects.push(
      effect(() => {
        const val = value()
        // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
        const v = view.peek()
        if (!v || val === docText) return
        applyingExternal = val
        try {
          v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: val } })
        } finally {
          applyingExternal = null
        }
        docText = val
      }),
    )

    // Sync language changes — async language loading is the framework's
    // documented pattern for code editors; the .then() dispatches to a
    // CodeMirror view captured per-editor, not per-component-instance.
    let firstLanguageRun = true
    syncEffects.push(
      // pyreon-lint-disable-next-line pyreon/no-imperative-effect-on-create
      effect(() => {
        const lang = language()
        // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
        const v = view.peek()
        if (!v) return
        // The mount already loaded this language — unless it changed while
        // the mount's grammar import was in flight.
        const first = firstLanguageRun
        firstLanguageRun = false
        if (first && lang === mountedLanguage) return
        const version = ++languageVersion
        loadLanguage(lang).then((ext) => {
          // A newer language change, a dispose, or a re-created view since.
          // (An async callback — nothing tracks here; peek states the intent.)
          // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
          if (version !== languageVersion || view.peek() !== v) return
          v.dispatch({ effects: languageCompartment.reconfigure(ext) })
        })
      }),
    )

    // Sync theme changes
    syncEffects.push(
      effect(() => {
        const t = theme()
        // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
        const v = view.peek()
        if (!v) return
        v.dispatch({ effects: themeCompartment.reconfigure(resolveTheme(t)) })
      }),
    )

    // Sync readOnly changes
    syncEffects.push(
      effect(() => {
        const ro = readOnly()
        // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
        const v = view.peek()
        if (!v) return
        v.dispatch({
          effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(ro)),
        })
      }),
    )

    // Sync editable changes (EditorView.editable — contenteditable on/off,
    // distinct from readOnly's transaction-blocking; see EditorConfig.editable)
    syncEffects.push(
      effect(() => {
        const ed = editable()
        // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
        const v = view.peek()
        if (!v) return
        v.dispatch({
          effects: editableCompartment.reconfigure(EditorView.editable.of(ed)),
        })
      }),
    )
  }

  /**
   * Swap the view's whole EditorState — the tabbed editor keeps one state per
   * tab so each tab owns its undo history. `null` builds a FRESH state for
   * `doc` (a tab's first visit). Returns the outgoing state so the caller can
   * keep it. The live theme/readOnly/editable/keymap config is re-applied to
   * a restored state, since it was captured when that tab was last active.
   * Internal — not part of the public EditorInstance surface.
   */
  function swapState(next: EditorState | null, doc: string): EditorState | null {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return null
    const prev = v.state
    const langExt = languageCompartment.get(prev) ?? []
    const target = next ?? EditorState.create({ doc, extensions: buildExtensions(langExt) })
    v.setState(target)
    if (next) {
      v.dispatch({
        effects: [
          themeCompartment.reconfigure(resolveTheme(theme.peek())),
          readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly.peek())),
          editableCompartment.reconfigure(EditorView.editable.of(editable.peek())),
          extraKeymapCompartment.reconfigure(customKeymap()),
        ],
      })
    }
    docText = target.doc.toString()
    docVersion.update((n) => n + 1)
    return prev
  }

  // ── Actions ──────────────────────────────────────────────────────────

  // `insert` / `replaceSelection` are CURSOR-relative doc mutations: they act on
  // `view.state.selection`, so they need a live EditorView. The view is created
  // by `mount()` AFTER an async grammar load, so calling them before mount (or on
  // a cold-mounting editor whose view isn't ready yet) has no cursor to act on —
  // the call would be silently DROPPED, losing the text the caller meant to add.
  // Warn (dev only) and point at the view-independent API (`value.set`). The
  // production no-op is unchanged: you genuinely cannot insert-at-cursor with no
  // cursor. (Other view-relative actions — select / undo / fold / diagnostics /
  // markers — lose no user content when dropped, or store state into a Map/array
  // that the view picks up on creation, so they stay silent.)
  function warnNoView(action: string): void {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[Pyreon] editor.${action}() was called before the editor view exists — the call was dropped. ` +
          `The view is created by mount() (after an async grammar load), so a pre-mount cursor-relative ` +
          `edit has no cursor to act on. Use editor.value.set(...) to set content independently of the ` +
          `view, or call ${action}() after mount() resolves.`,
      )
    }
  }

  function focus(): void {
    view.peek()?.focus()
  }

  function insert(text: string): void {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) {
      warnNoView('insert')
      return
    }
    const pos = v.state.selection.main.head
    v.dispatch({ changes: { from: pos, insert: text } })
  }

  function replaceSelection(text: string): void {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) {
      warnNoView('replaceSelection')
      return
    }
    v.dispatch(v.state.replaceSelection(text))
  }

  function select(from: number, to: number): void {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return
    v.dispatch({ selection: { anchor: from, head: to } })
  }

  function selectAll(): void {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return
    v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } })
  }

  function goToLine(line: number): void {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
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
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (v) cmUndo(v)
  }

  function redo(): void {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (v) cmRedo(v)
  }

  function foldAll(): void {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return
    // `foldAll`/`unfoldAll` are statically imported from @codemirror/language —
    // a prior `require('@codemirror/language')` here threw `require is not
    // defined` in every ESM browser bundle (this package is `type: module`),
    // so editor.foldAll()/unfoldAll() crashed the moment they ran in a real app.
    cmFoldAll(v)
  }

  function unfoldAll(): void {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return
    cmUnfoldAll(v)
  }

  // ── Diagnostics ────────────────────────────────────────────────────

  // Stored, not dropped, when no view exists yet — applied on mount, the same
  // way line highlights and gutter markers already were.
  let pendingDiagnostics: Diagnostic[] = []

  function applyDiagnostics(v: EditorView, diagnostics: Diagnostic[]): void {
    v.dispatch(
      cmSetDiagnostics(
        v.state,
        diagnostics.map((d) => ({
          from: d.from,
          to: d.to,
          severity: d.severity === 'hint' ? 'info' : d.severity,
          message: d.message,
          ...(d.source != null ? { source: d.source } : {}),
        })),
      ),
    )
  }

  function setDiagnostics(diagnostics: Diagnostic[]): void {
    pendingDiagnostics = diagnostics
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (v) applyDiagnostics(v, diagnostics)
  }

  function clearDiagnostics(): void {
    pendingDiagnostics = []
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return
    v.dispatch(cmSetDiagnostics(v.state, []))
  }

  // ── Line highlights / gutter markers ───────────────────────────────

  function refresh(): void {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (v) v.dispatch({ effects: refreshDecorations.of(null) })
  }

  function highlightLine(line: number, className: string): void {
    lineHighlights.set(line, className)
    refresh()
  }

  function clearLineHighlights(): void {
    lineHighlights.clear()
    refresh()
  }

  function setGutterMarker(line: number, marker: import('./types').GutterMarker): void {
    gutterMarkers.set(line, marker)
    refresh()
  }

  function clearGutterMarkers(): void {
    gutterMarkers.clear()
    refresh()
  }

  // ── Custom keybindings ─────────────────────────────────────────────

  const customKeybindings: Array<{ key: string; run: () => boolean }> = []

  // `Prec.high` so a custom binding beats the default keymap for the same key
  // (Mod-a would otherwise stay selectAll).
  function customKeymap(): Extension {
    return customKeybindings.length > 0 ? Prec.high(keymap.of([...customKeybindings])) : []
  }

  function addKeybinding(key: string, handler: () => boolean | undefined): void {
    customKeybindings.push({
      key,
      // `false` means "not handled" — let the next binding (or the browser)
      // have the key. `undefined` keeps the historical handled semantics.
      run: () => handler() !== false,
    })
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return
    v.dispatch({ effects: extraKeymapCompartment.reconfigure(customKeymap()) })
  }

  // ── Text queries ───────────────────────────────────────────────────

  function getLine(line: number): string {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return ''
    const clamped = Math.min(Math.max(1, line), v.state.doc.lines)
    return v.state.doc.line(clamped).text
  }

  function getWordAtCursor(): string {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return ''
    const pos = v.state.selection.main.head
    const line = v.state.doc.lineAt(pos)
    const col = pos - line.from
    const text = line.text

    // Find word boundaries
    let start = col
    let end = col
    while (start > 0 && /\w/.test(text.charAt(start - 1))) start--
    while (end < text.length && /\w/.test(text.charAt(end))) end++

    return text.slice(start, end)
  }

  function scrollTo(pos: number): void {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return
    v.dispatch({
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    })
  }

  // ── Vim / Emacs mode loading ───────────────────────────────────────

  async function loadKeyMode(): Promise<void> {
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (!v) return
    if (!enableVim && !enableEmacs) return

    if (enableVim && enableEmacs && process.env.NODE_ENV !== 'production') {
      console.warn(
        '[Pyreon] @pyreon/code: both `vim` and `emacs` are enabled — they bind the same keys, so only one ' +
          'can be active. Using vim; set one of them to false.',
      )
    }

    // Use string concat to prevent Vite from statically analyzing these optional imports
    const pkg = enableVim ? '@replit/codemirror-' + 'vim' : '@replit/codemirror-' + 'emacs'
    try {
      const mod = await import(/* @vite-ignore */ pkg)
      // Disposed or re-created while the mode package loaded.
      if (view.peek() !== v) return
      v.dispatch({
        effects: keyModeCompartment.reconfigure(enableVim ? mod.vim() : mod.emacs()),
      })
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[Pyreon] @pyreon/code: \`${enableVim ? 'vim' : 'emacs'}: true\` needs the optional peer ` +
            `\`${pkg}\` — install it. The editor keeps the default keymap.`,
          err,
        )
      }
    }
  }

  function dispose(): void {
    // Invalidate any in-flight `mount()` so a mount whose grammar import is
    // still loading won't create a live editor AFTER we've torn down.
    mountToken++
    languageVersion++
    for (const e of syncEffects) e.dispose()
    syncEffects = []
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    const v = view.peek()
    if (v) {
      v.destroy()
      view.set(null)
      mounted = false
    }
  }

  // ── Expose mount for component ─────────────────────────────────────

  const instance: EditorInstance & {
    _mount: typeof mount
    _swapState: typeof swapState
    _themeExplicit: boolean
  } = {
    // Whether `theme` was passed: `<CodeEditor>` follows the app's colour mode
    // only for an editor that did not choose one.
    _themeExplicit: config.theme !== undefined,
    value,
    language,
    theme,
    readOnly,
    editable,
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
    _swapState: swapState,
    _mount: async (parent: HTMLElement) => {
      await mount(parent)
      await loadKeyMode()
    },
  }

  return instance
}

/**
 * Open the search panel on a live editor programmatically.
 *
 * Wraps @codemirror/search's `openSearchPanel` command on the instance's
 * mounted view. Works even when the editor was created with `search: false`
 * (which only omits the Mod-F keymap + selection-match highlighting) — the
 * deliberate escape hatch for apps that own their find UI trigger.
 *
 * Pre-mount (the view is created by `mount()` after an async grammar load)
 * there is no panel host, so the call is dropped with a dev warning and
 * returns `false`.
 *
 * @param instance - An editor created with `createEditor`
 * @returns `true` when the panel was opened, `false` when no view exists
 *
 * @example
 * ```tsx
 * const editor = createEditor({ value: code, search: false })
 * <button onClick={() => openSearchPanel(editor)}>Find…</button>
 * ```
 */
export function openSearchPanel(instance: EditorInstance): boolean {
  const v = instance.view.peek()
  if (!v) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[Pyreon] openSearchPanel(editor) was called before the editor view exists — the call was dropped. ' +
          'The view is created by mount() (after an async grammar load), so open the panel after ' +
          '<CodeEditor> has mounted (e.g. from a click handler, or effect(() => { if (editor.view()) … })).',
      )
    }
    return false
  }
  return cmOpenSearchPanel(v)
}
