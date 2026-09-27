import { CodeEditor, createEditor } from '@pyreon/code'
import { h } from '@pyreon/core'

// createEditor() builds a framework-independent instance — its
// content/language/theme/cursor are all real Pyreon signals, not
// component-local state.
const editor = createEditor({
  value: 'function greet(name: string) {\n  return `Hello, ${name}!`\n}\n',
  language: 'typescript',
  theme: 'dark',
})

/**
 * The live counterpart to the "Quick Start" + "Signal-Backed State"
 * snippets above — a REAL CodeMirror 6 instance. Edit the code; the
 * line-count and cursor readouts below are driven by the SAME signals
 * you'd read in your own app.
 */
export default function ReactiveCodeEditor() {
  return h('div', { class: 'col' },
    h('div', { class: 'row', style: { gap: '8px', marginBottom: '6px' } },
      h('button', { onClick: () => editor.language.set('typescript') }, 'TypeScript'),
      h('button', { onClick: () => editor.language.set('python') }, 'Python'),
      h('button', { onClick: () => editor.theme.set(editor.theme() === 'dark' ? 'light' : 'dark') },
        () => (editor.theme() === 'dark' ? '☀ light' : '🌙 dark'),
      ),
    ),
    h(CodeEditor, { instance: editor, style: 'height: 220px; border: 1px solid var(--border); border-radius: 6px;' }),
    h('div', { class: 'muted', style: { marginTop: '6px', fontSize: '12px' } },
      () => `${editor.lineCount()} lines · language: ${editor.language()} · cursor ${editor.cursor().line}:${editor.cursor().col}`,
    ),
  )
}
