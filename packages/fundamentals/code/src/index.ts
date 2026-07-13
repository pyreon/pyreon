/**
 * @pyreon/code — Reactive code editor for Pyreon.
 *
 * CodeMirror 6 with signal-backed state, lazy-loaded languages,
 * custom minimap, and diff editor. The core editor is ~138 KB gz
 * (measured) — about 7x lighter than Monaco's ~940 KB gz core.
 * Reproduce: `bun run --filter=@pyreon/code bench`.
 *
 * @example
 * ```tsx
 * import { createEditor, CodeEditor } from '@pyreon/code'
 *
 * const editor = createEditor({
 *   value: 'const x = 1',
 *   language: 'typescript',
 *   theme: 'dark',
 *   minimap: true,
 * })
 *
 * editor.value()           // reactive signal
 * editor.value.set('new')  // updates editor
 *
 * <CodeEditor instance={editor} style="height: 400px" />
 * ```
 */

// Components
export { CodeEditor } from './components/code-editor'
export { DiffEditor } from './components/diff-editor'
export { TabbedEditor } from './components/tabbed-editor'
// Core
export { createEditor } from './editor'
export { createTabbedEditor } from './tabbed-editor'
// Signal binding
export type {
  BindEditorToSignalOptions,
  EditorBinding,
  SignalLike,
} from './bind-signal'
export { bindEditorToSignal } from './bind-signal'
export { useEditorSignal } from './use-editor-signal'
// Languages
export { getAvailableLanguages, loadLanguage } from './languages'
// Minimap
export { minimapExtension } from './minimap'
// Themes
export { darkTheme, lightTheme, resolveTheme } from './themes'

// Types
export type {
  CodeEditorProps,
  DiffEditorProps,
  EditorConfig,
  EditorInstance,
  EditorLanguage,
  EditorTheme,
  GutterMarker,
  Tab,
  TabbedEditorConfig,
  TabbedEditorInstance,
  TabbedEditorProps,
} from './types'
