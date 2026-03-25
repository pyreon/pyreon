# @pyreon/code

Reactive code editor built on CodeMirror 6 with signal-backed state, lazy-loaded languages, minimap, diff editor, and tabbed editing.

## Installation

```bash
bun add @pyreon/code
```

## Usage

### Basic Editor

```tsx
import { createEditor, CodeEditor } from "@pyreon/code"

const editor = createEditor({
  value: "const x = 1",
  language: "typescript",
  theme: "dark",
  minimap: true,
})

editor.value()           // reactive Signal<string>
editor.value.set("new")  // updates editor content

<CodeEditor instance={editor} style="height: 400px" />
```

### Editor Instance API

```ts
// Reactive state (signals/computeds)
editor.value()       // current content
editor.language()    // current language
editor.theme()       // current theme
editor.readOnly()    // read-only mode
editor.cursor()      // cursor position
editor.selection()   // current selection
editor.lineCount()   // number of lines
editor.focused()     // whether editor has focus

// Dynamic reconfiguration
editor.language.set("python")
editor.theme.set("light")
editor.readOnly.set(true)

// Actions
editor.focus()
editor.insert("text")
editor.replaceSelection("replacement")
editor.select(0, 10)
editor.goToLine(42)
editor.undo()
editor.redo()
editor.foldAll()
editor.unfoldAll()
```

### Diff Editor

```tsx
import { DiffEditor } from "@pyreon/code"

<DiffEditor original="const a = 1" modified="const a = 2" style="height: 400px" />
```

### Tabbed Editor

```tsx
import { TabbedEditor } from "@pyreon/code"

<TabbedEditor
  tabs={[
    { id: "main", label: "main.ts", value: "export {}", language: "typescript" },
    { id: "style", label: "style.css", value: "body {}", language: "css" },
  ]}
  style="height: 400px"
/>
```

### Language Loading

```ts
import { loadLanguage, getAvailableLanguages } from "@pyreon/code"

await loadLanguage("python")        // lazy-load a language grammar
getAvailableLanguages()              // list all available languages
```

Languages: javascript, typescript, jsx, tsx, html, css, json, markdown, python, rust, sql, xml, yaml, cpp, java, go, php.

## API Reference

| Export | Description |
| --- | --- |
| `createEditor(config)` | Create a reactive editor instance |
| `CodeEditor` | Mount component (`instance`, `style`, `class`) |
| `DiffEditor` | Side-by-side or inline diff (`original`, `modified`) |
| `TabbedEditor` | Multi-file tab management (`tabs`, `style`, `class`) |
| `loadLanguage(lang)` | Lazy-load a language grammar |
| `getAvailableLanguages()` | List available language names |
| `minimapExtension()` | Canvas-based code overview extension |
| `darkTheme` / `lightTheme` | Built-in themes |
| `resolveTheme(name)` | Resolve a theme by name |
