---
title: Code Editor
description: Reactive code editor for Pyreon — CodeMirror 6 with signals, minimap, diff editor, tabs, lazy-loaded languages
---

# @pyreon/code

Reactive code editor built on CodeMirror 6. Signal-backed state, lazy-loaded languages, custom minimap, diff editor, tabbed multi-file editing. ~250KB modular instead of Monaco's ~2.5MB.

## Installation

```bash
bun add @pyreon/code
```

Peer dependencies: `@pyreon/core`, `@pyreon/reactivity`

## Quick Start

```tsx
import { createEditor, CodeEditor } from '@pyreon/code'

const editor = createEditor({
  value: 'const greeting = "Hello, Pyreon!"',
  language: 'typescript',
  theme: 'dark',
})

<CodeEditor instance={editor} style="height: 400px" />
```

## Signal-Backed State

Every piece of editor state is a reactive signal:

```tsx
// Read reactively
editor.value()        // current content
editor.language()     // current language
editor.theme()        // current theme
editor.readOnly()     // read-only state
editor.cursor()       // { line: number, col: number }
editor.selection()    // { from: number, to: number, text: string }
editor.lineCount()    // number of lines
editor.focused()      // has focus

// Write — editor updates automatically
editor.value.set('new content')
editor.language.set('python')
editor.theme.set('dark')
editor.readOnly.set(true)
```

## Configuration

```tsx
const editor = createEditor({
  value: '',                    // initial content
  language: 'typescript',       // syntax highlighting language
  theme: 'dark',                // 'light' | 'dark' | custom Extension
  lineNumbers: true,            // show line numbers
  readOnly: false,              // read-only mode
  foldGutter: true,             // code folding
  bracketMatching: true,        // bracket matching + auto-close
  autocomplete: true,           // code completion
  search: true,                 // find & replace (Cmd+F)
  tabSize: 2,                   // tab width
  lineWrapping: false,          // wrap long lines
  highlightIndentGuides: true,  // indent guide lines
  placeholder: 'Type here...',  // placeholder when empty
  minimap: true,                // code overview sidebar
  vim: false,                   // vim keybinding mode
  emacs: false,                 // emacs keybinding mode
  extensions: [],               // additional CodeMirror extensions
  onChange: (value) => {},       // called on content change
})
```

## Languages

20+ languages, lazy-loaded on demand — zero cost until used:

```tsx
editor.language.set('typescript')  // switch language dynamically
```

Supported: `javascript`, `typescript`, `jsx`, `tsx`, `html`, `css`, `json`, `markdown`, `python`, `rust`, `sql`, `xml`, `yaml`, `cpp`, `java`, `go`, `php`, `ruby`, `shell`, `plain`

```tsx
import { getAvailableLanguages, loadLanguage } from '@pyreon/code'

getAvailableLanguages()           // list all supported
await loadLanguage('typescript')  // preload a language
```

## Themes

```tsx
import { lightTheme, darkTheme, resolveTheme } from '@pyreon/code'

// Switch dynamically
editor.theme.set('dark')
editor.theme.set('light')

// Custom theme — pass any CodeMirror theme Extension
editor.theme.set(myCustomTheme)
```

## Actions

```tsx
editor.focus()                           // focus the editor
editor.insert('// comment')             // insert at cursor
editor.replaceSelection('replacement')   // replace selected text
editor.select(0, 10)                     // select range
editor.selectAll()                       // select all
editor.goToLine(42)                      // jump to line
editor.undo()                            // undo
editor.redo()                            // redo
editor.foldAll()                         // fold all code blocks
editor.unfoldAll()                       // unfold all
editor.scrollTo(position)               // scroll to character position
```

## Diagnostics (Lint Integration)

Push diagnostics from external tools (TypeScript, ESLint, etc.):

```tsx
editor.setDiagnostics([
  { from: 0, to: 5, severity: 'error', message: 'Unexpected token', source: 'typescript' },
  { from: 20, to: 30, severity: 'warning', message: 'Unused variable', source: 'eslint' },
])

editor.clearDiagnostics()
```

Severities: `'error'` | `'warning'` | `'info'` | `'hint'`

## Line Highlights

Highlight specific lines (errors, breakpoints, current execution):

```tsx
editor.highlightLine(5, 'error-line')      // add highlight
editor.highlightLine(10, 'current-line')   // different style
editor.clearLineHighlights()                // remove all
```

## Gutter Markers

Add icons in the gutter (breakpoints, error indicators):

```tsx
editor.setGutterMarker(5, { text: '🔴', title: 'Breakpoint' })
editor.setGutterMarker(12, { text: '⚠️', title: 'Warning', class: 'warning-marker' })
editor.clearGutterMarkers()
```

## Custom Keybindings

```tsx
editor.addKeybinding('Ctrl-Shift-L', () => {
  console.log('Custom shortcut!')
  return true
})
```

## Text Queries

```tsx
editor.getLine(5)          // text of line 5
editor.getWordAtCursor()   // word under cursor
```

## Minimap

Canvas-based code overview with viewport indicator and click-to-scroll:

```tsx
const editor = createEditor({
  value: longCode,
  minimap: true,  // enable minimap
})
```

The minimap renders a scaled-down view of the entire document on the right side. Click to jump to that section. The viewport rectangle shows your current position.

## Diff Editor

Side-by-side or inline diff using `@codemirror/merge`:

```tsx
import { DiffEditor } from '@pyreon/code'

<DiffEditor
  original="const x = 1\nconst y = 2"
  modified="const x = 1\nconst y = 3\nconst z = 4"
  language="typescript"
  theme="dark"
  style="height: 400px"
/>

// Inline diff
<DiffEditor original={old} modified={new} inline />

// Reactive — pass signals
<DiffEditor original={originalSignal} modified={modifiedSignal} />
```

## Tabbed Editor

Multi-file editing with tab management:

```tsx
import { createTabbedEditor, TabbedEditor } from '@pyreon/code'

const editor = createTabbedEditor({
  tabs: [
    { name: 'index.ts', language: 'typescript', value: 'const x = 1' },
    { name: 'style.css', language: 'css', value: '.app { color: red; }' },
    { name: 'data.json', language: 'json', value: '{ "key": "value" }' },
  ],
  theme: 'dark',
})

<TabbedEditor instance={editor} style="height: 500px" />
```

### Tab Operations

```tsx
editor.tabs()               // Signal<Tab[]> — all open tabs
editor.activeTab()          // Computed<Tab | null> — current tab
editor.activeTabId()        // Signal<string>

// Lifecycle
editor.openTab({ name: 'utils.ts', language: 'typescript', value: '' })
editor.closeTab('style.css')
editor.switchTab('index.ts')

// Management
editor.renameTab('index.ts', 'main.ts')
editor.setModified('index.ts', true)    // show modified indicator
editor.moveTab(0, 2)                     // reorder
editor.closeAll()                        // close all closable tabs
editor.closeOthers('index.ts')           // close all except one
editor.getTab('index.ts')                // get tab by id
```

### Tab Features

- **Modified indicator** — dot shown on tabs with unsaved changes
- **Closable tabs** — set `closable: false` for pinned tabs
- **Content preservation** — content cached when switching tabs
- **Auto-switch** — closing active tab switches to adjacent

## Vim / Emacs Mode

Optional key modes (requires installing the package):

```bash
bun add @replit/codemirror-vim    # for vim mode
bun add @replit/codemirror-emacs  # for emacs mode
```

```tsx
const editor = createEditor({
  value: 'hello world',
  vim: true,   // enable vim mode
})
```

## Accessing CodeMirror Directly

For advanced use cases, access the underlying EditorView:

```tsx
const view = editor.view()  // EditorView | null (null before mount)

if (view) {
  // Use any CodeMirror API directly
  view.dispatch({ ... })
}
```

## API Reference

### createEditor

| Property | Type | Description |
|---|---|---|
| `value` | `Signal<string>` | Editor content — reactive |
| `language` | `Signal<EditorLanguage>` | Current language |
| `theme` | `Signal<EditorTheme>` | Current theme |
| `readOnly` | `Signal<boolean>` | Read-only state |
| `cursor` | `Computed<&#123;line, col&#125;>` | Cursor position |
| `selection` | `Computed<&#123;from, to, text&#125;>` | Current selection |
| `lineCount` | `Computed<number>` | Number of lines |
| `focused` | `Signal<boolean>` | Focus state |
| `view` | `Signal<EditorView \| null>` | CodeMirror instance |

### createTabbedEditor

| Method | Description |
|---|---|
| `openTab(tab)` | Open or switch to a tab |
| `closeTab(id)` | Close a tab |
| `switchTab(id)` | Switch to a tab |
| `renameTab(id, name)` | Rename a tab |
| `setModified(id, bool)` | Mark modified |
| `moveTab(from, to)` | Reorder tabs |
| `closeAll()` | Close all closable tabs |
| `closeOthers(id)` | Close all except one |

### Components

| Component | Description |
|---|---|
| `<CodeEditor>` | Single-file editor |
| `<DiffEditor>` | Side-by-side or inline diff |
| `<TabbedEditor>` | Multi-file with tab bar |
