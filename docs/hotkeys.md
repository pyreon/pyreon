# @pyreon/hotkeys

Keyboard shortcut management with scope-aware activation, modifier keys, conflict detection, and automatic lifecycle cleanup.

## Installation

```bash
bun add @pyreon/hotkeys
```

## Usage

### Component-Scoped Shortcuts

```tsx
import { useHotkey, useHotkeyScope } from "@pyreon/hotkeys"

function Editor() {
  // Global shortcut -- auto-unregisters on unmount
  useHotkey("mod+s", () => save(), { description: "Save document" })
  useHotkey("mod+k", () => openCommandPalette())

  // Scoped shortcut -- only active when "editor" scope is enabled
  useHotkeyScope("editor")
  useHotkey("ctrl+z", () => undo(), { scope: "editor" })
  useHotkey("escape", () => deselect(), { scope: "editor" })
}
```

`mod` resolves to Command on Mac and Ctrl elsewhere.

### Imperative Registration

```ts
import { registerHotkey, enableScope, disableScope } from "@pyreon/hotkeys"

const unregister = registerHotkey("mod+shift+p", () => openPalette(), {
  description: "Command palette",
})

enableScope("modal")
disableScope("modal")

unregister() // manual cleanup
```

### Listing Registered Hotkeys

```ts
import { getRegisteredHotkeys, getActiveScopes } from "@pyreon/hotkeys"

getRegisteredHotkeys()
// [{ shortcut: "mod+s", description: "Save document", scope: "global" }, ...]

getActiveScopes()
// ["global", "editor"]
```

### Parsing Utilities

```ts
import { parseShortcut, formatCombo, matchesCombo } from "@pyreon/hotkeys"

const combo = parseShortcut("mod+shift+k")
// { key: "k", ctrl: true (or meta on Mac), shift: true, alt: false }

formatCombo(combo) // "Ctrl+Shift+K" or "Cmd+Shift+K"

matchesCombo(keyboardEvent, combo) // true/false
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `scope` | `string` | `"global"` | Scope name -- only fires when scope is active |
| `description` | `string` | -- | Human-readable description (for help dialogs) |
| `enabled` | `boolean` | `true` | Whether the hotkey is active |
| `preventDefault` | `boolean` | `true` | Call `preventDefault()` on the event |
| `enableOnInputs` | `boolean` | `false` | Fire even when focused on input/textarea |

## API Reference

| Export | Description |
| --- | --- |
| `useHotkey(shortcut, handler, options?)` | Component-scoped shortcut, auto-unregisters |
| `useHotkeyScope(scope)` | Enable a scope for the component's lifetime |
| `registerHotkey(shortcut, handler, options?)` | Imperative registration, returns unregister fn |
| `enableScope(scope)` / `disableScope(scope)` | Control which scopes are active |
| `getRegisteredHotkeys()` | List all registered hotkeys |
| `getActiveScopes()` | List currently active scopes |
| `parseShortcut(str)` | Parse shortcut string to `KeyCombo` |
| `formatCombo(combo)` | Format `KeyCombo` to display string |
| `matchesCombo(event, combo)` | Test if a keyboard event matches a combo |

Supported aliases: `mod`, `esc`, `space`, `del`, `enter`, `tab`, `up`, `down`, `left`, `right`.
