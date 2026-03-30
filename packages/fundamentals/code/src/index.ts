/**
 * @pyreon/code — Reactive code editor for Pyreon.
 *
 * CodeMirror 6 with signal-backed state, lazy-loaded languages,
 * custom minimap, and diff editor. ~250KB for a full-featured
 * code editor instead of ~2.5MB for Monaco.
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
