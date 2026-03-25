# @pyreon/code

Reactive code editor for Pyreon. CodeMirror 6 with signal-backed state, lazy-loaded languages, minimap, and diff editor. ~250KB vs ~2.5MB for Monaco.

## Install

```bash
bun add @pyreon/code
```

## Quick Start

```tsx
import { createEditor, CodeEditor } from '@pyreon/code'

const editor = createEditor({
  value: 'const x = 1',
  language: 'typescript',
  theme: 'dark',
  minimap: true,
})

editor.value()           // reactive signal
editor.value.set('new')  // updates editor

<CodeEditor instance={editor} style="height: 400px" />
```

## Diff Editor

```tsx
import { DiffEditor } from '@pyreon/code'

<DiffEditor original="const a = 1" modified="const a = 2" style="height: 300px" />
```

## Tabbed Editor

```tsx
import { TabbedEditor } from '@pyreon/code'

<TabbedEditor
  tabs={[
    { id: 'main', label: 'main.ts', value: 'export {}', language: 'typescript' },
    { id: 'style', label: 'style.css', value: 'body {}', language: 'css' },
  ]}
  style="height: 500px"
/>
```

## API

### `createEditor(config)`

Create a reactive editor instance. Config options: `value`, `language`, `theme`, `readOnly`, `minimap`, `lineNumbers`, `tabSize`, `placeholder`, `diagnostics`, `lineHighlights`, `gutterMarkers`, `keybindings`.

**Returns `EditorInstance`:**

| Property | Type | Description |
| --- | --- | --- |
| `value` | `Signal<string>` | Two-way synced editor content |
| `language` | `Signal<EditorLanguage>` | Dynamic language switching |
| `theme` | `Signal<EditorTheme>` | Dynamic theme switching |
| `readOnly` | `Signal<boolean>` | Toggle read-only mode |
| `cursor` | `Computed<number>` | Cursor position |
| `selection` | `Computed<{from, to}>` | Current selection range |
| `lineCount` | `Computed<number>` | Number of lines |
| `focused` | `Computed<boolean>` | Whether editor has focus |
| `focus()` | method | Focus the editor |
| `insert(text)` | method | Insert text at cursor |
| `replaceSelection(text)` | method | Replace current selection |
| `goToLine(line)` | method | Scroll to line |
| `undo()` / `redo()` | method | Undo/redo |
| `foldAll()` / `unfoldAll()` | method | Code folding |

### `loadLanguage(lang)`

Lazy-load a language grammar. Supported: javascript, typescript, jsx, tsx, html, css, json, markdown, python, rust, sql, xml, yaml, cpp, java, go, php.

### `minimapExtension()`

Canvas-based code overview with viewport indicator and click-to-scroll.

### `darkTheme` / `lightTheme` / `resolveTheme(name)`

Built-in themes and theme resolver.

## License

MIT
