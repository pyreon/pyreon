import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — code snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/code — Reactive code editor — CodeMirror 6 with signals, minimap, diff editor, lazy-loaded languages (peer: @pyreon/runtime-dom). \`@pyreon/runtime-dom\` is required in consumer apps because \`<CodeEditor>\` JSX emits \`_tpl()\` / \`_bind()\` calls."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/code — Code Editor

      Reactive code editor for Pyreon built on CodeMirror 6 — the core editor is ~138 KB gz (measured), ~7x lighter than Monaco's ~940 KB gz core. \`editor.value\` is a writable Signal<string> — reads track reactively, writes push back into CodeMirror. 19 language grammars lazy-loaded on demand. Canvas-based minimap, diff editor, tabbed editor, and two-way signal binding with built-in loop prevention.

      \`\`\`typescript
      import { createEditor, createTabbedEditor, CodeEditor, DiffEditor, TabbedEditor, bindEditorToSignal, loadLanguage, minimapExtension } from '@pyreon/code'
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
      <TabbedEditor instance={tabbed} style="height: 500px" />
      \`\`\`

      > **Peer dep**: @pyreon/runtime-dom
      >
      > **Peer dep**: \`@pyreon/runtime-dom\` is required in consumer apps because \`<CodeEditor>\` JSX emits \`_tpl()\` / \`_bind()\` calls.
      >
      > **Note**: editor.value is a writable Signal<string>. Read with \`editor.value()\` (reactive), write with \`editor.value.set(next)\` (pushes into CodeMirror). Do NOT call \`editor.value(newText)\` — that reads and ignores the argument.
      >
      > **Two-way binding**: For external signal <-> editor synchronization, use \`bindEditorToSignal\` — it handles loop prevention, format-on-input races, and parse error recovery. Hand-rolling the flag pattern is the #1 source of bugs.
      >
      > **Bundle size**: Built on CodeMirror 6. Measured (esbuild+gzip, code-split): the core editor is ~138 KB gz (~416 KB min) — at parity with @uiw/react-codemirror (~129 KB gz), both wrap the same CM6. Monaco's ESM core is ~940 KB gz (~3.6 MB min, workers/CSS excluded) — @pyreon/code is ~7x smaller gzipped. Each extra language grammar streams as a ~40 KB gz lazy chunk that reuses the loaded core. Reproduce with \`bun run --filter=@pyreon/code bench\`.
      >
      > **Third-party themes**: EditorTheme is \`'light' | 'dark' | Extension\` and resolveTheme passes a custom Extension through unchanged — so any \`@uiw/codemirror-theme-*\` package (dracula, github, tokyo-night, … an instant ~35-theme gallery) is a plain CM6 Extension that drops into \`theme:\` directly: \`createEditor({ theme: dracula })\`. Verified against a real @uiw theme package in the browser suite.
      >
      > **Lifecycle is user-owned**: \`<CodeEditor>\` does NOT auto-dispose the instance on unmount — the instance is user-owned and may be remounted (TabbedEditor, route revisits). Call \`editor.dispose()\` yourself when the instance is done for good.
      >
      > **ruby / shell grammars**: \`ruby\` and \`shell\` highlighting come from \`@codemirror/legacy-modes\` (an optionalDependency). It installs by default; if your package manager skips optional deps, those two fall back to plain-text (empty extension) rather than throwing.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(12)
  })
})
