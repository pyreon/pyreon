import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { Computed, Signal } from '@pyreon/reactivity'

// ─── Editor config ───────────────────────────────────────────────────────────

export type EditorLanguage =
  | 'javascript'
  | 'typescript'
  | 'jsx'
  | 'tsx'
  | 'html'
  | 'css'
  | 'json'
  | 'markdown'
  | 'python'
  | 'rust'
  | 'sql'
  | 'xml'
  | 'yaml'
  | 'cpp'
  | 'java'
  | 'go'
  | 'php'
  | 'ruby'
  | 'shell'
  | 'plain'

export type EditorTheme = 'light' | 'dark' | Extension

export interface EditorConfig {
  /** Initial value */
  value?: string
  /** Language for syntax highlighting — lazy-loaded */
  language?: EditorLanguage
  /** Theme — 'light', 'dark', or a custom CodeMirror theme extension */
  theme?: EditorTheme
  /** Show line numbers — default: true */
  lineNumbers?: boolean
  /** Read-only mode — default: false */
  readOnly?: boolean
  /** Enable code folding — default: true */
  foldGutter?: boolean
  /** Enable bracket matching — default: true */
  bracketMatching?: boolean
  /** Enable autocomplete — default: true */
  autocomplete?: boolean
  /** Enable search (Cmd+F) — default: true */
  search?: boolean
  /** Enable lint/diagnostics — default: false */
  lint?: boolean
  /** Enable indent guides — default: true */
  highlightIndentGuides?: boolean
  /** Vim keybinding mode — default: false */
  vim?: boolean
  /** Emacs keybinding mode — default: false */
  emacs?: boolean
  /** Tab size — default: 2 */
  tabSize?: number
  /** Enable indent guides — default: true */
  indentGuides?: boolean
  /** Enable line wrapping — default: false */
  lineWrapping?: boolean
  /** Placeholder text when empty */
  placeholder?: string
  /** Enable minimap — default: false */
  minimap?: boolean
  /** Additional CodeMirror extensions */
  extensions?: Extension[]
  /** Called when value changes */
  onChange?: (value: string) => void
}

// ─── Editor instance ─────────────────────────────────────────────────────────

export interface EditorInstance {
  /** Current editor value — reactive signal */
  value: Signal<string>
  /** Current language — reactive signal */
  language: Signal<EditorLanguage>
  /** Current theme — reactive signal */
  theme: Signal<EditorTheme>
  /** Read-only state — reactive signal */
  readOnly: Signal<boolean>
  /** Cursor position — reactive */
  cursor: Computed<{ line: number; col: number }>
  /** Current selection — reactive */
  selection: Computed<{ from: number; to: number; text: string }>
  /** Line count — reactive */
  lineCount: Computed<number>
  /** Whether the editor has focus — reactive */
  focused: Signal<boolean>
  /** The underlying CodeMirror EditorView — null until mounted */
  view: Signal<EditorView | null>
  /** Focus the editor */
  focus: () => void
  /** Insert text at cursor */
  insert: (text: string) => void
  /** Replace selection */
  replaceSelection: (text: string) => void
  /** Select a range */
  select: (from: number, to: number) => void
  /** Select all */
  selectAll: () => void
  /** Go to a specific line */
  goToLine: (line: number) => void
  /** Undo */
  undo: () => void
  /** Redo */
  redo: () => void
  /** Fold all */
  foldAll: () => void
  /** Unfold all */
  unfoldAll: () => void
  /** Set diagnostics (lint errors/warnings) */
  setDiagnostics: (diagnostics: Diagnostic[]) => void
  /** Clear all diagnostics */
  clearDiagnostics: () => void
  /** Highlight a specific line (e.g., error line, current execution) */
  highlightLine: (line: number, className: string) => void
  /** Clear all line highlights */
  clearLineHighlights: () => void
  /** Set gutter markers (breakpoints, error icons) */
  setGutterMarker: (line: number, marker: GutterMarker) => void
  /** Clear all gutter markers */
  clearGutterMarkers: () => void
  /** Add a custom keybinding */
  addKeybinding: (key: string, handler: () => boolean | undefined) => void
  /** Get the text of a specific line */
  getLine: (line: number) => string
  /** Get word at cursor position */
  getWordAtCursor: () => string
  /** Scroll to a specific position */
  scrollTo: (pos: number) => void
  /** The editor configuration */
  config: EditorConfig
  /** Dispose — clean up view and listeners */
  dispose: () => void
}

// ─── Diagnostic ──────────────────────────────────────────────────────────────

export interface Diagnostic {
  /** Start position (character offset) */
  from: number
  /** End position (character offset) */
  to: number
  /** Severity */
  severity: 'error' | 'warning' | 'info' | 'hint'
  /** Message */
  message: string
  /** Optional source (e.g., "typescript", "eslint") */
  source?: string
}

// ─── Gutter marker ───────────────────────────────────────────────────────────

export interface GutterMarker {
  /** CSS class for the marker element */
  class?: string
  /** Text content (e.g., emoji or icon) */
  text?: string
  /** Tooltip on hover */
  title?: string
}

// ─── Component props ─────────────────────────────────────────────────────────

export interface CodeEditorProps {
  instance: EditorInstance
  style?: string
  class?: string
}

export interface DiffEditorProps {
  /** Original (left) content */
  original: string | Signal<string>
  /** Modified (right) content */
  modified: string | Signal<string>
  /** Language for both panels */
  language?: EditorLanguage
  /** Theme */
  theme?: EditorTheme
  /** Show inline diff instead of side-by-side — default: false */
  inline?: boolean
  /** Read-only — default: true */
  readOnly?: boolean
  style?: string
  class?: string
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

export interface Tab {
  /** Unique tab identifier — defaults to name */
  id?: string
  /** File name displayed in the tab */
  name: string
  /** Language for syntax highlighting */
  language?: EditorLanguage
  /** File content */
  value: string
  /** Whether the tab has unsaved changes */
  modified?: boolean
  /** Whether the tab can be closed — default: true */
  closable?: boolean
}

export interface TabbedEditorConfig {
  /** Initial tabs */
  tabs?: Tab[]
  /** Theme — 'light', 'dark', or custom */
  theme?: EditorTheme
  /** Editor config applied to all tabs */
  editorConfig?: Omit<EditorConfig, 'value' | 'language' | 'theme'>
}

export interface TabbedEditorInstance {
  /** The underlying editor instance */
  editor: EditorInstance
  /** All open tabs — reactive */
  tabs: Signal<Tab[]>
  /** Active tab — reactive */
  activeTab: Computed<Tab | null>
  /** Active tab ID — reactive */
  activeTabId: Signal<string>
  /** Open a new tab (or switch to it if already open) */
  openTab: (tab: Tab) => void
  /** Close a tab by ID */
  closeTab: (id: string) => void
  /** Switch to a tab by ID */
  switchTab: (id: string) => void
  /** Rename a tab */
  renameTab: (id: string, name: string) => void
  /** Mark a tab as modified/saved */
  setModified: (id: string, modified: boolean) => void
  /** Reorder tabs */
  moveTab: (fromIndex: number, toIndex: number) => void
  /** Get tab by ID */
  getTab: (id: string) => Tab | undefined
  /** Close all tabs */
  closeAll: () => void
  /** Close all tabs except the given one */
  closeOthers: (id: string) => void
  /** Dispose */
  dispose: () => void
}

export interface TabbedEditorProps {
  instance: TabbedEditorInstance
  style?: string
  class?: string
}
