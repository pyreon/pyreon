import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/code',
  title: 'Code Editor',
  tagline:
    'Reactive code editor — CodeMirror 6 with signals, minimap, diff editor, lazy-loaded languages',
  description:
    'Reactive code editor for Pyreon built on CodeMirror 6 (~250KB vs Monaco\'s ~2.5MB). `editor.value` is a writable Signal<string> — reads track reactively, writes push back into CodeMirror. 19 language grammars lazy-loaded on demand. Canvas-based minimap, diff editor, tabbed editor, and two-way signal binding with built-in loop prevention.',
  category: 'browser',
  peerDeps: ['@pyreon/runtime-dom'],
  longExample: `import { createEditor, CodeEditor, DiffEditor, TabbedEditor, bindEditorToSignal, loadLanguage, minimapExtension } from '@pyreon/code'
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

// Tabbed editor — multiple files:
<TabbedEditor
  tabs={[
    { id: 'main', label: 'main.ts', language: 'typescript', value: 'export {}' },
    { id: 'styles', label: 'styles.css', language: 'css', value: 'body {}' },
  ]}
/>`,
  features: [
    'createEditor — reactive instance with writable Signal<string> value',
    'CodeEditor, DiffEditor, TabbedEditor JSX components',
    'bindEditorToSignal — two-way binding with built-in loop prevention',
    '19 language grammars via loadLanguage (lazy-loaded)',
    'Canvas-based minimapExtension for code overview',
    'Built on CodeMirror 6 (~250KB vs Monaco ~2.5MB)',
  ],
  api: [
    {
      name: 'createEditor',
      kind: 'function',
      signature:
        '(config: EditorConfig) => EditorInstance',
      summary:
        'Create a reactive editor instance. `editor.value` is a writable Signal<string> — `editor.value()` reads reactively, `editor.value.set(next)` writes back into CodeMirror. `editor.cursor` and `editor.lineCount` are computed signals. Config accepts value, language, theme, minimap, lineNumbers, foldGutter, onChange, and more. The instance is framework-independent — mount it via `<CodeEditor instance={editor} />`.',
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
        'Calling editor methods before mount — they no-op safely but changes don\'t persist',
        'Setting both vim: true and emacs: true — emacs wins',
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
        'Mount component for a `createEditor` instance. Accepts `instance`, `style`, `class`, and passes through to a container div. Auto-mounts the CodeMirror view on render and cleans up on unmount.',
      example: `<CodeEditor instance={editor} style="height: 400px" class="my-editor" />`,
      seeAlso: ['createEditor', 'DiffEditor', 'TabbedEditor'],
    },
    {
      name: 'DiffEditor',
      kind: 'component',
      signature: '(props: DiffEditorProps) => VNodeChild',
      summary:
        'Side-by-side diff editor. Accepts `original` and `modified` strings plus optional `language` and `theme`. Renders two CodeMirror instances with unified diff highlighting via @codemirror/merge.',
      example: `<DiffEditor original="old code" modified="new code" language="typescript" />`,
      seeAlso: ['CodeEditor', 'TabbedEditor'],
    },
    {
      name: 'loadLanguage',
      kind: 'function',
      signature: '(lang: EditorLanguage) => Promise<void>',
      summary:
        'Lazy-load a language grammar. Supports 19 languages: json, typescript, javascript, python, css, html, markdown, rust, go, java, cpp, sql, xml, yaml, php, and more. Grammars are declared as optional dependencies and loaded on demand.',
      example: `await loadLanguage('python')
// Now 'python' is available in createEditor({ language: 'python' })`,
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
      note: 'Built on CodeMirror 6 (~250KB) vs Monaco (~2.5MB). Language grammars are optional dependencies loaded on demand via `loadLanguage()`.',
    },
  ],
})
