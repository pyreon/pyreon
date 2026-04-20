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

      Reactive code editor for Pyreon built on CodeMirror 6 (~250KB vs Monaco's ~2.5MB). \`editor.value\` is a writable Signal<string> — reads track reactively, writes push back into CodeMirror. 19 language grammars lazy-loaded on demand. Canvas-based minimap, diff editor, tabbed editor, and two-way signal binding with built-in loop prevention.

      \`\`\`typescript
      import { createEditor, CodeEditor, DiffEditor, TabbedEditor, bindEditorToSignal, loadLanguage, minimapExtension } from '@pyreon/code'
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
      />
      \`\`\`

      > **Peer dep**: @pyreon/runtime-dom
      >
      > **Peer dep**: \`@pyreon/runtime-dom\` is required in consumer apps because \`<CodeEditor>\` JSX emits \`_tpl()\` / \`_bind()\` calls.
      >
      > **Note**: editor.value is a writable Signal<string>. Read with \`editor.value()\` (reactive), write with \`editor.value.set(next)\` (pushes into CodeMirror). Do NOT call \`editor.value(newText)\` — that reads and ignores the argument.
      >
      > **Two-way binding**: For external signal <-> editor synchronization, use \`bindEditorToSignal\` — it handles loop prevention, format-on-input races, and parse error recovery. Hand-rolling the flag pattern is the #1 source of bugs.
      >
      > **Bundle size**: Built on CodeMirror 6 (~250KB) vs Monaco (~2.5MB). Language grammars are optional dependencies loaded on demand via \`loadLanguage()\`.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(6)
  })
})
