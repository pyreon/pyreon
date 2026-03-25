# @pyreon/hotkeys

Reactive keyboard shortcut management for Pyreon. Scope-aware, modifier keys, conflict detection, automatic lifecycle cleanup.

## Install

```bash
bun add @pyreon/hotkeys
```

## Quick Start

```tsx
import { useHotkey, useHotkeyScope } from '@pyreon/hotkeys'

// Global shortcut — auto-unregisters on unmount
useHotkey('mod+s', () => save(), { description: 'Save document' })
useHotkey('mod+k', () => openCommandPalette())

// Scoped shortcuts — only active when scope is enabled
useHotkeyScope('editor')
useHotkey('ctrl+z', () => undo(), { scope: 'editor' })
useHotkey('escape', () => closeModal(), { scope: 'modal' })
```

`mod` = Command on Mac, Ctrl elsewhere. Shortcuts are ignored in input elements by default.

## API

### `useHotkey(shortcut, handler, options?)`

Component-scoped keyboard shortcut. Automatically unregisters on unmount.

Options: `scope`, `description`, `preventDefault` (default: true), `enableInInputs` (default: false).

### `useHotkeyScope(scope)`

Activate a scope for the component's lifetime. Deactivates on unmount.

### `registerHotkey(shortcut, handler, options?)`

Imperative registration. Returns an unregister function.

### `enableScope(scope)` / `disableScope(scope)`

Manually control which scopes are active.

### `getRegisteredHotkeys()`

List all registered hotkeys — useful for help dialogs.

### `getActiveScopes()`

List currently active scopes.

### Utilities

- `parseShortcut(str)` — parse shortcut string into `KeyCombo`
- `formatCombo(combo)` — format `KeyCombo` as display string
- `matchesCombo(event, combo)` — check if a keyboard event matches a combo

## License

MIT
