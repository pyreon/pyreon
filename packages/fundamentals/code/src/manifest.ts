import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/code',
  title: 'Code Editor',
  tagline:
    'Reactive code editor — CodeMirror 6 with signals, minimap, diff editor, lazy-loaded languages',
  description:
    'Reactive code editor for Pyreon built on CodeMirror 6 — the core editor is ~138 KB gz (measured), ~7x lighter than Monaco\'s ~940 KB gz core. `editor.value` is a writable Signal<string> — reads track reactively, writes push back into CodeMirror. 19 language grammars lazy-loaded on demand. Canvas-based minimap, diff editor, tabbed editor, and two-way signal binding with built-in loop prevention.',
  category: 'browser',
  peerDeps: ['@pyreon/runtime-dom'],
  longExample: `import { createEditor, createTabbedEditor, CodeEditor, DiffEditor, TabbedEditor, bindEditorToSignal, loadLanguage, minimapExtension } from '@pyreon/code'
import { signal } from '@pyreon/reactivity'

// Create a reactive editor instance
const editor = createEditor({
  value: 'const x = 1',
  language: 'typescript',
  theme: 'dark',
  minimap: true,
  lineNumbers: true,
  onChange: (next) => console.log('user edit:', next),
})

// editor.value is a writable Signal<string>
editor.value()           // read reactively — tracks in effects/JSX
editor.value.set('new')  // write back into CodeMirror
editor.cursor()          // computed { line, col }
editor.lineCount()       // computed number

// Mount with JSX component:
<CodeEditor instance={editor} style="height: 400px" />

// Diff editor — side-by-side comparison:
<DiffEditor original="old code" modified="new code" language="typescript" />

// Two-way binding to external signal (e.g. form field, store):
interface Config { host: string; port: number }
const config = signal<Config>({ host: 'localhost', port: 3000 })

const configEditor = createEditor({ value: JSON.stringify(config(), null, 2), language: 'json' })

const binding = bindEditorToSignal({
  editor: configEditor,
  signal: config,
  serialize: (val) => JSON.stringify(val, null, 2),
  parse: (text) => { try { return JSON.parse(text) } catch { return null } },
  onParseError: (err) => console.warn('Invalid JSON:', err.message),
})
// binding.dispose() on unmount

// Lazy-load a language grammar:
await loadLanguage('python')

// Tabbed editor — build an instance with createTabbedEditor, then mount it
// via the component's \`instance\` prop (each Tab uses \`name\`, not \`label\`):
const tabbed = createTabbedEditor({
  tabs: [
    { id: 'main', name: 'main.ts', language: 'typescript', value: 'export {}' },
    { id: 'styles', name: 'styles.css', language: 'css', value: 'body {}' },
  ],
})
tabbed.openTab({ id: 'readme', name: 'README.md', language: 'markdown', value: '# Hi' })
<TabbedEditor instance={tabbed} style="height: 500px" />`,
  features: [
    'createEditor — reactive instance with writable Signal<string> value',
    'createTabbedEditor — reactive multi-file editor (reactive tabs + open/close/switch/move)',
    'CodeEditor, DiffEditor, TabbedEditor JSX components',
    'bindEditorToSignal — two-way binding with built-in loop prevention',
    '19 language grammars via loadLanguage (lazy-loaded)',
    'Canvas-based minimapExtension for code overview',
    'Built on CodeMirror 6 — measured core ~138KB gz vs Monaco ~940KB gz ESM core (~7x smaller gzipped)',
  ],
  api: [
    {
      name: 'createEditor',
      kind: 'function',
      signature:
        '(config: EditorConfig) => EditorInstance',
      summary:
        'Create a reactive editor instance. `editor.value` is a writable Signal<string> — `editor.value()` reads reactively, `editor.value.set(next)` writes back into CodeMirror. `editor.cursor` and `editor.lineCount` are computed signals. Config accepts value, language, theme, minimap, lineNumbers, foldGutter, readOnly (blocks user-input transactions, cursor stays), editable (live `EditorView.editable` — `false` removes contenteditable entirely, a pure display surface; both are live signals on the instance), search (`false` omits the Mod-F keymap + selection-match highlighting; `openSearchPanel(editor)` is the programmatic escape hatch), onChange, onError (mount failures route here instead of an unhandled rejection), and more. The instance is framework-independent — mount it via `<CodeEditor instance={editor} />`.',
      example: `const editor = createEditor({
  value: '// hello',
  language: 'typescript',
  theme: 'dark',
  minimap: true,
  onChange: (next) => console.log('edit:', next),
})

editor.value()              // reactive read
editor.value.set('new')     // write into CodeMirror
editor.cursor()             // { line, col }
editor.lineCount()          // computed
editor.goToLine(42)
editor.insert('code')

<CodeEditor instance={editor} style="height: 400px" />`,
      mistakes: [
        'Forgetting to declare @pyreon/runtime-dom in consumer app deps — <CodeEditor> JSX emits _tpl() which needs runtime-dom',
        'Hand-rolling the applyingFromExternal/applyingFromEditor flag pattern — use bindEditorToSignal instead',
        'Calling cursor-relative methods (insert / replaceSelection) before mount — the view is created by mount() after an async grammar load, so a pre-mount call has no cursor and is dropped (with a dev warning). Use editor.value.set(...) to set content independently of the view (it seeds the doc whenever the view is created)',
        'Setting both vim: true and emacs: true — emacs wins',
        'Relying on a thrown error to debug a broken setup (a throwing extension / failed grammar import) — mount failures no longer surface as an unhandled rejection; pass onError to observe them, otherwise they log a [Pyreon] message in dev. Disposing the editor while it is still mounting (a fast navigate-away during the async grammar load) is also leak-safe',
      ],
      seeAlso: ['CodeEditor', 'bindEditorToSignal', 'loadLanguage'],
    },
    {
      name: 'bindEditorToSignal',
      kind: 'function',
      signature:
        '<T>(options: BindEditorToSignalOptions<T>) => EditorBinding',
      summary:
        'Two-way binding between an editor instance and an external Signal<T> (or SignalLike<T>). Replaces the recurring loop-prevention flag-pair boilerplate. Round-trips through user-supplied `serialize`/`parse` functions. Internal flags break the format-on-input race; parse failures call `onParseError` and leave the external state at its last valid value. Returns `{ dispose }` for cleanup.',
      example: `const data = signal<Doc>({ name: 'Alice', count: 1 })
const editor = createEditor({ value: JSON.stringify(data(), null, 2), language: 'json' })

const binding = bindEditorToSignal({
  editor,
  signal: data,
  serialize: (val) => JSON.stringify(val, null, 2),
  parse: (text) => { try { return JSON.parse(text) } catch { return null } },
  onParseError: (err) => console.warn(err.message),
})
// binding.dispose() on unmount`,
      mistakes: [
        'Forgetting to call binding.dispose() on unmount — leaks both effects',
        'Non-deterministic serialize() — if serialize(parse(text)) varies on each call, the helper dispatches redundant writes that fight the user\'s typing',
        'Returning a non-null value from parse() for malformed input — return null on failure, or throw',
        'Using bindEditorToSignal AND a manual editor.value.set() loop — defeats loop prevention',
      ],
      seeAlso: ['createEditor'],
    },
    {
      name: 'CodeEditor',
      kind: 'component',
      signature: '(props: CodeEditorProps) => VNodeChild',
      summary:
        'Mount component for a `createEditor` instance. Accepts `instance`, `style`, `class`, and passes through to a container div. Auto-mounts the CodeMirror view on render. Lifecycle is USER-OWNED — `<CodeEditor>` does NOT auto-dispose on unmount (the instance may be remounted, e.g. by `<TabbedEditor>` or a route revisit); call `editor.dispose()` yourself when the instance is done for good.',
      example: `<CodeEditor instance={editor} style="height: 400px" class="my-editor" />`,
      mistakes: [
        'Expecting <CodeEditor> to dispose the instance on unmount — it does NOT (the instance is user-owned and may be remounted, e.g. by <TabbedEditor> or a route revisit). Call editor.dispose() from your own cleanup (onUnmount) when the instance is done for good, or the CodeMirror view leaks.',
      ],
      seeAlso: ['createEditor', 'DiffEditor', 'TabbedEditor'],
    },
    {
      name: 'DiffEditor',
      kind: 'component',
      signature: '(props: DiffEditorProps) => VNodeChild',
      summary:
        'Diff editor over @codemirror/merge. Accepts `original` and `modified` (strings OR Signal<string> — signal props update the diff reactively) plus optional `language`, `theme`, `readOnly` (default true), and `inline`. Default renders a side-by-side MergeView (two panes); `inline: true` renders a UNIFIED view — one editor showing the modified doc with the original as deleted-chunk widgets (per-chunk accept/reject controls appear when `readOnly` is false).',
      example: `<DiffEditor original="old code" modified="new code" language="typescript" />
// unified (inline) view — one pane, original shown as deleted chunks:
<DiffEditor original={originalSig} modified={modifiedSig} inline />`,
      seeAlso: ['CodeEditor', 'TabbedEditor'],
    },
    {
      name: 'createTabbedEditor',
      kind: 'function',
      signature: '(config?: TabbedEditorConfig) => TabbedEditorInstance',
      summary:
        'Create a reactive multi-file (tabbed) editor instance. `config` is `{ tabs?, theme?, editorConfig? }` — `tabs` is an array of `Tab` (`{ name, value, id?, language?, modified?, closable? }`), `editorConfig` applies to every tab. The instance wraps a single underlying `editor` and exposes reactive `tabs` (Signal<Tab[]>), `activeTab` (Computed<Tab | null>), and `activeTabId` (Signal<string>), plus imperative `openTab` / `closeTab` / `switchTab` / `renameTab` / `setModified` / `moveTab` / `getTab` / `closeAll` / `closeOthers` / `dispose`. Mount it via `<TabbedEditor instance={…} />`.',
      example: `const tabbed = createTabbedEditor({
  tabs: [
    { id: 'main', name: 'main.ts', language: 'typescript', value: 'export {}' },
    { id: 'styles', name: 'styles.css', language: 'css', value: 'body {}' },
  ],
})
tabbed.openTab({ name: 'README.md', language: 'markdown', value: '# Hi' })
tabbed.switchTab('styles')
tabbed.activeTab()   // Computed<Tab | null>

<TabbedEditor instance={tabbed} style="height: 500px" />`,
      mistakes: [
        'Passing `tabs` directly to <TabbedEditor> — the component takes an `instance` prop, not `tabs`. Build the instance with createTabbedEditor, then pass `instance={tabbed}`.',
        'Using `label` for the tab title — a Tab uses `name` (the displayed file name); `id` is the optional unique key (defaults to `name`).',
        'Forgetting to call instance.dispose() on unmount — it owns an underlying editor instance.',
      ],
      seeAlso: ['TabbedEditor', 'createEditor'],
    },
    {
      name: 'TabbedEditor',
      kind: 'component',
      signature: '(props: TabbedEditorProps) => VNodeChild',
      summary:
        'Mount component for a `createTabbedEditor` instance. Props are `instance` (REQUIRED — a TabbedEditorInstance), plus optional `style` and `class`. Renders a headless tab bar (plain div + button tabs) above the editor; switching tabs swaps the underlying document reactively.',
      example: `const tabbed = createTabbedEditor({ tabs: [{ name: 'a.ts', value: 'export {}' }] })
<TabbedEditor instance={tabbed} style="height: 500px" />`,
      mistakes: [
        'Passing `tabs={[…]}` — there is no `tabs` prop; pass a `createTabbedEditor` instance via `instance`.',
      ],
      seeAlso: ['createTabbedEditor', 'CodeEditor', 'DiffEditor'],
    },
    {
      name: 'openSearchPanel',
      kind: 'function',
      signature: '(instance: EditorInstance) => boolean',
      summary:
        'Open the find/replace panel on a mounted editor programmatically. Works even when the editor was created with `search: false` (which only omits the Mod-F keymap + selection-match highlighting) — the deliberate escape hatch for apps that own their find-UI trigger. Returns `true` when the panel opened; pre-mount there is no view to host the panel, so the call is dropped with a dev warning and returns `false`.',
      example: `const editor = createEditor({ value: code, search: false })
<button onClick={() => openSearchPanel(editor)}>Find…</button>`,
      mistakes: [
        'Calling it before <CodeEditor> has mounted — the view is created by mount() after an async grammar load, so a pre-mount call is dropped (dev warning, returns false). Trigger it from a user event or effect(() => { if (editor.view()) … }).',
      ],
      seeAlso: ['createEditor'],
    },
    {
      name: 'loadLanguage',
      kind: 'function',
      signature: '(language: EditorLanguage) => Promise<Extension>',
      summary:
        "Lazy-load a language grammar and return its CodeMirror `Extension`. All 19 non-plain identifiers ship a real grammar: json, typescript, javascript, jsx, tsx, python, css, html, markdown, rust, go, java, cpp, sql, xml, yaml, php from the modern `@codemirror/lang-*` packages, plus ruby and shell from `@codemirror/legacy-modes` (StreamLanguage). `plain` is intentionally empty. The result is cached per language; an uninstalled optional grammar package (or an unknown identifier) resolves to an empty `[]` extension (never throws). `createEditor` loads the grammar for its `language` on mount, so calling `loadLanguage` ahead of time just warms the cache.",
      example: `const ext = await loadLanguage('python') // the CodeMirror Extension
// createEditor({ language: 'python' }) now resolves instantly (cache warm)`,
      seeAlso: ['createEditor', 'getAvailableLanguages'],
    },
    {
      name: 'minimapExtension',
      kind: 'function',
      signature: '() => Extension',
      summary:
        'CodeMirror extension that renders a canvas-based code overview minimap. Enable via `createEditor({ minimap: true })` or add the extension manually to a CodeMirror state.',
      example: `const editor = createEditor({ value: longCode, minimap: true })
// or: import { minimapExtension } from '@pyreon/code'`,
      seeAlso: ['createEditor'],
    },
    {
      name: 'useEditorSignal',
      kind: 'function',
      signature: 'useEditorSignal<T>(options: BindEditorToSignalOptions<T>) => void',
      summary:
        "Component hook that two-way-binds an editor to a signal WITH automatic cleanup. It wraps `bindEditorToSignal` and registers `onUnmount(() => binding.dispose())`, so you do not manage the binding lifecycle yourself — unlike `bindEditorToSignal`, which returns a `{ dispose }` handle for user-owned lifecycles. Options: `{ editor, signal, serialize, parse, onParseError? }` — `signal` is any `SignalLike<T>`, `serialize` projects the value into editor text, `parse` reads it back.",
      example: `function MyEditor() {
  const code = signal('console.log(1)')
  const editor = createEditor({ value: code(), language: 'javascript' })
  useEditorSignal({ editor, signal: code, serialize: (v) => v, parse: (t) => t })
  return <CodeEditor instance={editor} />
}`,
      mistakes: [
        'Calling it outside a component — it relies on `onUnmount` for cleanup, so it only works during component setup. For a manually-managed lifecycle use `bindEditorToSignal` (which returns a `{ dispose }` handle) and call `dispose()` yourself.',
        'Expecting a return value — it returns `void` (no binding handle); disposal is automatic. If you need to tear the binding down early, use `bindEditorToSignal` instead.',
        'A non-deterministic `serialize`/`parse` pair — the binding round-trips through both, so `serialize(parse(serialize(x)))` must equal `serialize(x)` or the editor and the signal fight each other.',
      ],
      seeAlso: ['bindEditorToSignal', 'createEditor'],
    },
    {
      name: 'getAvailableLanguages',
      kind: 'function',
      signature: 'getAvailableLanguages() => EditorLanguage[]',
      summary:
        "Return every supported language identifier (the keys of the internal grammar-loader registry) — for building a language picker. Pairs with `loadLanguage(id)`, which lazy-loads a grammar on demand. The set covers the bundled CodeMirror grammars plus `'plain'` (no highlighting).",
      example: `const languages = getAvailableLanguages()
// → ['javascript', 'typescript', 'python', 'plain', …]`,
      mistakes: [
        'Assuming a returned id is already loaded — `getAvailableLanguages()` lists what CAN be loaded; the grammar itself is lazy. Pass the id to `createEditor({ language })` (or `loadLanguage(id)`) to actually load it.',
      ],
      seeAlso: ['loadLanguage', 'createEditor'],
    },
    {
      name: 'darkTheme / lightTheme / resolveTheme',
      kind: 'constant',
      signature:
        'darkTheme: Extension · lightTheme: Extension · resolveTheme(theme: EditorTheme) => Extension',
      summary:
        "The built-in editor themes. `lightTheme` and `darkTheme` are CodeMirror `Extension`s (a clean light palette and a VS-Code-inspired dark one). `darkTheme` carries the `{ dark: true }` facet — the flag CodeMirror's dark-aware features AND this package's minimap key on (NOT a CSS class). `resolveTheme(theme)` maps `'light'`/`'dark'` to those extensions and passes a custom `Extension` through unchanged (`EditorTheme = 'light' | 'dark' | Extension`). You normally set `createEditor({ theme })` and let it resolve — reach for the raw extensions only when composing your own CodeMirror state.",
      example: `const editor = createEditor({ value: code, theme: 'dark' })   // resolved internally
// or compose the raw extension yourself:
const extensions = [darkTheme /* , ...other CM extensions */]`,
      mistakes: [
        "Toggling dark mode by swapping a CSS class — CodeMirror keys its dark-aware behavior (and this package's minimap) on the `EditorView.darkTheme` FACET carried by `darkTheme`, not a class. Provide `darkTheme` (or `theme: 'dark'`) so the facet is set.",
        "Passing a theme NAME other than 'light'/'dark' to `resolveTheme` — only those two strings map to a preset; any other value must be a real CodeMirror `Extension` (it is returned as-is).",
      ],
      seeAlso: ['createEditor', 'minimapExtension'],
    },
  ],
  gotchas: [
    {
      label: 'Peer dep',
      note: '`@pyreon/runtime-dom` is required in consumer apps because `<CodeEditor>` JSX emits `_tpl()` / `_bind()` calls.',
    },
    'editor.value is a writable Signal<string>. Read with `editor.value()` (reactive), write with `editor.value.set(next)` (pushes into CodeMirror). Do NOT call `editor.value(newText)` — that reads and ignores the argument.',
    {
      label: 'Two-way binding',
      note: 'For external signal <-> editor synchronization, use `bindEditorToSignal` — it handles loop prevention, format-on-input races, and parse error recovery. Hand-rolling the flag pattern is the #1 source of bugs.',
    },
    {
      label: 'Bundle size',
      note: 'Built on CodeMirror 6. Measured (esbuild+gzip, code-split): the core editor is ~138 KB gz (~416 KB min) — at parity with @uiw/react-codemirror (~129 KB gz), both wrap the same CM6. Monaco\'s ESM core is ~940 KB gz (~3.6 MB min, workers/CSS excluded) — @pyreon/code is ~7x smaller gzipped. Each extra language grammar streams as a ~40 KB gz lazy chunk that reuses the loaded core. Reproduce with `bun run --filter=@pyreon/code bench`.',
    },
    {
      label: 'Third-party themes',
      note: 'EditorTheme is `\'light\' | \'dark\' | Extension` and resolveTheme passes a custom Extension through unchanged — so any `@uiw/codemirror-theme-*` package (dracula, github, tokyo-night, … an instant ~35-theme gallery) is a plain CM6 Extension that drops into `theme:` directly: `createEditor({ theme: dracula })`. Verified against a real @uiw theme package in the browser suite.',
    },
    {
      label: 'Lifecycle is user-owned',
      note: '`<CodeEditor>` does NOT auto-dispose the instance on unmount — the instance is user-owned and may be remounted (TabbedEditor, route revisits). Call `editor.dispose()` yourself when the instance is done for good.',
    },
    {
      label: 'ruby / shell grammars',
      note: '`ruby` and `shell` highlighting come from `@codemirror/legacy-modes` (an optionalDependency). It installs by default; if your package manager skips optional deps, those two fall back to plain-text (empty extension) rather than throwing.',
    },
  ],
})
