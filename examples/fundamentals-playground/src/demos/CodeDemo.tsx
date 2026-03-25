import type { EditorLanguage } from "@pyreon/code"
import { createEditor, getAvailableLanguages } from "@pyreon/code"
import { computed, signal } from "@pyreon/reactivity"

const sampleFiles: Record<string, { language: EditorLanguage; value: string }> = {
  "main.ts": {
    language: "typescript",
    value: `import { signal, computed, effect } from '@pyreon/reactivity'

const count = signal(0)
const doubled = computed(() => count() * 2)

effect(() => {
  console.log(\`Count: \${count()}, Doubled: \${doubled()}\`)
})

count.set(5)
count.update(n => n + 1)`,
  },
  "styles.css": {
    language: "css",
    value: `.container {
  display: flex;
  gap: 16px;
  padding: 24px;
  background: var(--surface);
  border-radius: 12px;
}

.button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.button:hover {
  opacity: 0.8;
}`,
  },
  "config.json": {
    language: "json",
    value: `{
  "name": "@pyreon/playground",
  "version": "0.1.0",
  "dependencies": {
    "@pyreon/core": "^0.5.0",
    "@pyreon/reactivity": "^0.5.0",
    "@pyreon/code": "^0.0.1"
  },
  "scripts": {
    "dev": "bun run dev",
    "build": "bun run build"
  }
}`,
  },
  "app.py": {
    language: "python",
    value: `from dataclasses import dataclass
from typing import Optional

@dataclass
class User:
    name: str
    email: str
    role: str = "viewer"

def greet(user: User) -> str:
    """Generate a greeting for the user."""
    return f"Hello, {user.name}! You are a {user.role}."

users = [
    User("Alice", "alice@example.com", "admin"),
    User("Bob", "bob@example.com"),
]

for user in users:
    print(greet(user))`,
  },
}

export function CodeDemo() {
  // Create a single editor instance
  const editor = createEditor({
    value: sampleFiles["main.ts"]!.value,
    language: "typescript",
    theme: "dark",
    minimap: false,
    lineNumbers: true,
    placeholder: "Start typing...",
  })

  // Active file tracking
  const activeFile = signal("main.ts")
  const fileNames = Object.keys(sampleFiles)

  // Theme toggle
  const isDark = signal(true)

  // Inserted text log
  const log = signal<string[]>([])
  const addLog = (msg: string) => log.update((l) => [...l.slice(-9), msg])

  // Derived state from editor
  const cursorInfo = computed(() => {
    const c = editor.cursor()
    return `Ln ${c.line}, Col ${c.col}`
  })

  const selectionInfo = computed(() => {
    const s = editor.selection()
    if (s.from === s.to) return "No selection"
    return `Selected ${s.to - s.from} chars`
  })

  // Available languages
  const languages = getAvailableLanguages()

  return (
    <div>
      <h2>Code</h2>
      <p class="desc">
        Reactive code editor built on CodeMirror 6. Signal-backed value, language, and theme —
        change any signal and the editor updates. Lazy-loaded language grammars, minimap, diff
        editor, and full editing API.
      </p>

      {/* File tabs */}
      <div class="section">
        <h3>Multi-File Editor</h3>
        <div class="row" style="margin-bottom: 8px; flex-wrap: wrap">
          {fileNames.map((name) => (
            <button
              type="button"
              key={name}
              class={activeFile() === name ? "active" : ""}
              onClick={() => {
                const file = sampleFiles[name]!
                activeFile.set(name)
                editor.value.set(file.value)
                editor.language.set(file.language)
                addLog(`Opened ${name} (${file.language})`)
              }}
            >
              {name}
            </button>
          ))}
        </div>

        {/* Editor mount point — CodeEditor component would go here */}
        <div
          ref={(el: HTMLElement) => {
            const view = editor.view.peek()
            if (!view) return
            el.appendChild(view.dom)
          }}
          style="border: 1px solid #333; border-radius: 8px; overflow: hidden; min-height: 250px"
        />

        {/* Status bar */}
        <div style="display: flex; gap: 16px; padding: 6px 12px; background: #1e1e1e; color: #888; font-size: 12px; font-family: monospace; border-radius: 0 0 8px 8px; border: 1px solid #333; border-top: none">
          <span>{() => cursorInfo()}</span>
          <span>{() => selectionInfo()}</span>
          <span>{() => `${editor.lineCount()} lines`}</span>
          <span>{() => editor.language()}</span>
          <span>{() => (editor.focused() ? "Focused" : "Blurred")}</span>
        </div>
      </div>

      {/* Editor controls */}
      <div class="section">
        <h3>Editor Actions</h3>
        <div class="row" style="flex-wrap: wrap; margin-bottom: 8px">
          <button
            type="button"
            onClick={() => {
              editor.undo()
              addLog("Undo")
            }}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => {
              editor.redo()
              addLog("Redo")
            }}
          >
            Redo
          </button>
          <button
            type="button"
            onClick={() => {
              editor.insert("\n// Inserted by demo\n")
              addLog("Inserted comment")
            }}
          >
            Insert Comment
          </button>
          <button
            type="button"
            onClick={() => {
              editor.goToLine(1)
              addLog("Go to line 1")
            }}
          >
            Go to Line 1
          </button>
          <button
            type="button"
            onClick={() => {
              editor.selectAll()
              addLog("Selected all")
            }}
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => {
              editor.focus()
              addLog("Focused editor")
            }}
          >
            Focus
          </button>
        </div>
        <div class="row" style="flex-wrap: wrap">
          <button
            type="button"
            onClick={() => {
              editor.foldAll()
              addLog("Folded all")
            }}
          >
            Fold All
          </button>
          <button
            type="button"
            onClick={() => {
              editor.unfoldAll()
              addLog("Unfolded all")
            }}
          >
            Unfold All
          </button>
          <button
            type="button"
            onClick={() => {
              const word = editor.getWordAtCursor()
              addLog(`Word at cursor: "${word}"`)
            }}
          >
            Word at Cursor
          </button>
        </div>
      </div>

      {/* Theme & language */}
      <div class="section">
        <h3>Theme & Language</h3>
        <div class="row" style="margin-bottom: 8px">
          <button
            type="button"
            onClick={() => {
              const next = isDark() ? "light" : "dark"
              isDark.update((d) => !d)
              editor.theme.set(next)
              addLog(`Theme → ${next}`)
            }}
          >
            {() => (isDark() ? "Switch to Light" : "Switch to Dark")}
          </button>
          <button
            type="button"
            onClick={() => {
              editor.readOnly.update((r) => !r)
              addLog(`Read-only → ${editor.readOnly()}`)
            }}
          >
            {() => (editor.readOnly() ? "Make Editable" : "Make Read-Only")}
          </button>
        </div>
        <p style="font-size: 13px; opacity: 0.7">
          Available languages: <code>{languages.join(", ")}</code>
        </p>
      </div>

      {/* Reactive state display */}
      <div class="section">
        <h3>Reactive Editor State</h3>
        <pre style="background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 8px; font-size: 13px; overflow-x: auto">
          {() =>
            JSON.stringify(
              {
                file: activeFile(),
                language: editor.language(),
                theme: editor.theme(),
                readOnly: editor.readOnly(),
                cursor: editor.cursor(),
                lineCount: editor.lineCount(),
                focused: editor.focused(),
                valueLength: editor.value().length,
              },
              null,
              2,
            )
          }
        </pre>
      </div>

      {/* Log */}
      <div class="section">
        <h3>Action Log</h3>
        <div class="log">
          {() =>
            log().length === 0
              ? "Use the controls above to interact with the editor."
              : log().join("\n")
          }
        </div>
      </div>
    </div>
  )
}
