import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/rich-text',
  title: 'Rich Text Editor',
  tagline:
    'Reactive WYSIWYG editor — signal-backed layer over TipTap (ProseMirror), lazy-loaded, a11y-labeled',
  description:
    "Reactive WYSIWYG rich-text editor for Pyreon, built as a thin signal layer over TipTap (the MIT, framework-agnostic headless editor framework over ProseMirror) — the same adapter shape as `@pyreon/code` (CodeMirror) and `@pyreon/charts` (ECharts). `editor.json` is a writable Signal<JSONContent> (the ProseMirror document); `html`/`text`/`isEmpty`/`characterCount`/`canUndo`/`canRedo` are computed signals. The TipTap engine is lazy-loaded on mount so `@tiptap/*` stays out of the initial bundle. The content area is a labeled `role=\"textbox\"` multiline region. Two-way signal binding (`bindRichTextToSignal`) handles loop prevention. Collaboration composes with `@pyreon/sync` (bind to the same Y.Doc XML fragment) rather than a paid cloud.",
  category: 'browser',
  peerDeps: ['@pyreon/runtime-dom'],
  longExample: `import { createRichTextEditor, RichText, bindRichTextToSignal } from '@pyreon/rich-text'
import { signal } from '@pyreon/reactivity'

// Create a reactive editor instance
const editor = createRichTextEditor({
  content: '<p>Hello <strong>world</strong></p>',
  ariaLabel: 'Post body',
  onChange: (json) => console.log('user edit:', json),
})

// editor.json is a writable Signal<JSONContent>
editor.json()              // read reactively — tracks in effects/JSX
editor.json.set(draft)     // replace content (loop-safe)
editor.text()              // computed plain text
editor.characterCount()    // computed number
editor.canUndo()           // computed boolean

// Run a command via the TipTap chain:
editor.chain()?.toggleBold().run()

// Mount with the JSX component (lazy-loads TipTap):
<RichText instance={editor} style="min-height: 12rem" />

// Two-way binding to an external signal (form field, store, draft):
const draft = signal(editor.json())
const binding = bindRichTextToSignal({ editor, signal: draft })
// binding.dispose() on unmount

// Tear down (user-owned lifecycle):
// onCleanup(() => editor.dispose())`,
  features: [
    'createRichTextEditor — reactive instance with writable Signal<JSONContent> json',
    'RichText JSX component — lazy-loads TipTap on mount; a11y-labeled role="textbox"',
    'bindRichTextToSignal — two-way binding (json or html) with built-in loop prevention',
    'Computed html / text / isEmpty / characterCount / wordCount / canUndo / canRedo signals',
    'editor.isActive(name) — reactive toolbar primitive; editable — writable read-only signal',
    'TipTap command chain via editor.chain() + undo/redo/focus/blur helpers',
    'MIT throughout (TipTap + ProseMirror); collaboration composes with @pyreon/sync',
  ],
  api: [
    {
      name: 'createRichTextEditor',
      kind: 'function',
      signature: '(config?: RichTextConfig) => RichTextEditor',
      summary:
        "Create a reactive WYSIWYG editor instance. `editor.json` is a writable Signal<JSONContent> — `editor.json()` reads reactively, `editor.json.set(next)` replaces the editor content (loop-safe). `html`/`text`/`isEmpty`/`characterCount`/`wordCount`/`canUndo`/`canRedo` are computed signals; `editable` is a writable Signal<boolean> (runtime read-only toggle); `editor.isActive('bold')` is the reactive toolbar primitive. Commands run through `editor.chain()` (toggleBold/toggleHeading/toggleBulletList/…) plus `undo`/`redo`/`focus`/`blur` helpers. The TipTap `Editor` (over ProseMirror) is created lazily when mounted via `<RichText>`, so `@tiptap/*` stays out of the initial bundle. Config accepts content (HTML string or ProseMirror JSON), editable, ariaLabel, starterKit, extensions, autofocus, and onChange. The instance is framework-independent — mount it via `<RichText instance={editor} />`.",
      example: `const editor = createRichTextEditor({
  content: '<p>Hello</p>',
  ariaLabel: 'Post body',
  onChange: (json) => console.log('edit:', json),
})

editor.json()                       // reactive read
editor.json.set(draft)              // replace content
editor.text()                       // computed plain text
editor.chain()?.toggleBold().run()  // run a command

<RichText instance={editor} style="min-height: 12rem" />`,
      mistakes: [
        'Forgetting to declare @pyreon/runtime-dom in consumer app deps — <RichText> JSX emits _tpl() which needs runtime-dom',
        'Calling editor.json(newDoc) to write — that reads and ignores the argument. Use editor.json.set(newDoc)',
        'Reading editor.html() / editor.chain() before mount — the TipTap Editor is created on mount (async, lazy import). html falls back to the initial string; chain() returns null. Use editor.json.set(...) to set content independently of the view',
        'Hand-rolling the applyingExternal flag pair for external sync — use bindRichTextToSignal instead',
        'Forgetting editor.dispose() on unmount — like @pyreon/code, the instance is user-owned (the component does not auto-dispose so it can be re-mounted)',
      ],
      seeAlso: ['RichText', 'bindRichTextToSignal'],
    },
    {
      name: 'RichText',
      kind: 'component',
      signature: '(props: RichTextProps) => VNodeChild',
      summary:
        'Mount component for a `createRichTextEditor` instance. Accepts `instance`, `class`, and `style`, and renders a container `<div>` the TipTap editor mounts into (lazy-loading the engine on first render). The instance is user-owned — call `editor.dispose()` in `onCleanup`/`onUnmount` if it will not be re-mounted.',
      example: `<RichText instance={editor} style="min-height: 12rem" class="prose" />`,
      seeAlso: ['createRichTextEditor'],
    },
    {
      name: 'bindRichTextToSignal',
      kind: 'function',
      signature:
        '<T = JSONContent>(options: BindRichTextToSignalOptions<T>) => RichTextBinding',
      summary:
        "Two-way binding between an editor instance and an external Signal — the editor mirror of `@pyreon/code`'s `bindEditorToSignal`. `format: 'json'` (default) mirrors the structured ProseMirror document (`T = JSONContent`); `format: 'html'` mirrors an HTML string. Internal flags break the echo loop; a value/peek compare short-circuits no-op writes. Returns `{ dispose }` to stop both directions.",
      example: `const draft = signal(editor.json())
const binding = bindRichTextToSignal({ editor, signal: draft })
// or HTML: bindRichTextToSignal({ editor, signal: htmlStr, format: 'html' })
// onCleanup(() => binding.dispose())`,
      mistakes: [
        'Forgetting to call binding.dispose() on unmount — leaks both effects',
        "Passing format: 'html' with a Signal<JSONContent> (or vice versa) — T must match the format",
        'Using bindRichTextToSignal AND a manual editor.json.set() loop — defeats loop prevention',
      ],
      seeAlso: ['createRichTextEditor'],
    },
  ],
  gotchas: [
    {
      label: 'Peer dep',
      note: '`@pyreon/runtime-dom` is required in consumer apps because `<RichText>` JSX emits `_tpl()` / `_bind()` calls.',
    },
    'editor.json is a writable Signal<JSONContent>. Read with `editor.json()` (reactive), write with `editor.json.set(next)` (pushes into TipTap). Do NOT call `editor.json(newDoc)` — that reads and ignores the argument.',
    {
      label: 'Lazy engine',
      note: 'TipTap (`@tiptap/core` + `@tiptap/starter-kit`) is dynamically imported on mount, so it stays out of the initial bundle (same shape as `@pyreon/charts` ECharts). `html`/`chain()` are inert until mount.',
    },
    {
      label: 'Accessibility',
      note: 'The content area is a `role="textbox"` `aria-multiline` region; supply `ariaLabel` (defaults to "Rich text editor") so screen readers announce a name.',
    },
    {
      label: 'Toolbars',
      note: 'Build a toolbar with `editor.chain()?.toggleBold().run()` for commands + `editor.isActive("bold")` for active state. `isActive` is reactive — call it inside a reactive scope (`class={() => editor.isActive("bold") ? "active" : ""}`), not at component-body top level, or the highlight won\'t update. Gate undo/redo buttons on `editor.canUndo()` / `editor.canRedo()`.',
    },
    {
      label: 'Collaboration',
      note: 'For real-time collaboration, compose with `@pyreon/sync`: bind the editor to the same `Y.Doc` XML fragment (`createYjsDoc().yDoc.getXmlFragment(...)`) via TipTap\'s collaboration extension, and reuse `@pyreon/sync` transports + `syncedAwareness` for presence — no paid cloud required.',
    },
    {
      label: 'License',
      note: 'TipTap + ProseMirror are MIT throughout. Avoid TipTap Pro modules (Cloud, Comments, Content AI, doc-conversion) which are paid/commercially-licensed.',
    },
  ],
})
