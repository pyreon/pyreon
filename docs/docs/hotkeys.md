---
title: Hotkeys
description: Reactive keyboard shortcut management for Pyreon — scope-aware, modifier keys, lifecycle-managed
---

# @pyreon/hotkeys

Keyboard shortcut management with automatic lifecycle cleanup, scope-based activation, and modifier key support.

## Installation

::: code-group

```bash [npm]
npm install @pyreon/hotkeys
```

```bash [bun]
bun add @pyreon/hotkeys
```

```bash [pnpm]
pnpm add @pyreon/hotkeys
```

```bash [yarn]
yarn add @pyreon/hotkeys
```

:::

Peer dependencies: `@pyreon/core`, `@pyreon/reactivity`

## Quick Start

```tsx
import { useHotkey } from '@pyreon/hotkeys'

function Editor() {
  useHotkey('mod+s', () => save(), { description: 'Save document' })
  useHotkey('mod+z', () => undo(), { description: 'Undo' })
  useHotkey('mod+shift+z', () => redo(), { description: 'Redo' })
  // Automatically unregistered when Editor unmounts
}
```

`mod` = ⌘ on Mac, Ctrl on Windows/Linux.

## Component Hook — `useHotkey()`

Registers a shortcut scoped to the component's lifecycle. Auto-unregisters on unmount.

```tsx
import { useHotkey } from '@pyreon/hotkeys'

function App() {
  useHotkey('mod+k', () => openCommandPalette())
  useHotkey('escape', () => closeModal())
  useHotkey('ctrl+shift+p', () => openSettings(), {
    description: 'Open settings',
    preventDefault: true,
  })
}
```

### Options

| Option            | Type                       | Default    | Description                          |
| ----------------- | -------------------------- | ---------- | ------------------------------------ |
| `scope`           | `string`                   | `'global'` | Only fires when this scope is active |
| `preventDefault`  | `boolean`                  | `true`     | Prevent default browser behavior     |
| `stopPropagation` | `boolean`                  | `false`    | Stop event propagation               |
| `enableOnInputs`  | `boolean`                  | `false`    | Fire when input/textarea is focused  |
| `description`     | `string`                   | —          | For help dialogs                     |
| `enabled`         | `boolean \| () => boolean` | `true`     | Dynamic enable/disable               |

## Scopes — `useHotkeyScope()`

Scopes let you activate/deactivate groups of hotkeys based on UI context.

```tsx
import { useHotkey, useHotkeyScope } from '@pyreon/hotkeys'

function Modal() {
  // Activate 'modal' scope while this component is mounted
  useHotkeyScope('modal')

  // This only fires when the modal scope is active
  useHotkey('escape', () => closeModal(), { scope: 'modal' })
  useHotkey('enter', () => confirm(), { scope: 'modal' })
}

function Editor() {
  useHotkeyScope('editor')

  useHotkey('ctrl+s', () => save(), { scope: 'editor' })
  useHotkey('ctrl+z', () => undo(), { scope: 'editor' })
}
```

The `global` scope is always active. Custom scopes activate when `useHotkeyScope()` mounts and deactivate when it unmounts.

## Imperative API — `registerHotkey()`

For use outside components (e.g., in stores or at app init):

```tsx
import { registerHotkey, enableScope, disableScope } from '@pyreon/hotkeys'

// Returns an unregister function
const unregister = registerHotkey('ctrl+s', () => save(), {
  description: 'Save',
})

// Manual scope management
enableScope('editor')
disableScope('editor')

// Later: cleanup
unregister()
```

## Modifier Keys

| Modifier | Keys                     |
| -------- | ------------------------ |
| `ctrl`   | `ctrl`, `control`        |
| `shift`  | `shift`                  |
| `alt`    | `alt`                    |
| `meta`   | `meta`, `cmd`, `command` |
| `mod`    | ⌘ on Mac, Ctrl elsewhere |

## Key Aliases

| Alias                | Key         |
| -------------------- | ----------- |
| `esc`                | `Escape`    |
| `return`             | `Enter`     |
| `del`                | `Delete`    |
| `ins`                | `Insert`    |
| `space`              | ` ` (space) |
| `up/down/left/right` | Arrow keys  |
| `plus`               | `+`         |

## Input Filtering

By default, hotkeys are **ignored** when the user is typing in:

- `<input>` elements
- `<textarea>` elements
- `<select>` elements
- `contentEditable` elements

Override with `enableOnInputs: true`:

```tsx
// This fires even when typing in an input
useHotkey('escape', () => blur(), { enableOnInputs: true })
```

## Dynamic Enable/Disable

```tsx
const canSave = computed(() => hasChanges() && !isSaving())

useHotkey('mod+s', () => save(), {
  enabled: () => canSave(),
  description: 'Save (only when changes exist)',
})
```

## Help Dialogs

Build keyboard shortcut help screens with `getRegisteredHotkeys()`:

```tsx
import { getRegisteredHotkeys, formatCombo, parseShortcut } from '@pyreon/hotkeys'

function ShortcutHelp() {
  const hotkeys = getRegisteredHotkeys()

  return (
    <table>
      <thead>
        <tr>
          <th>Shortcut</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {hotkeys
          .filter((h) => h.description)
          .map((h) => (
            <tr>
              <td>
                <kbd>{formatCombo(parseShortcut(h.shortcut))}</kbd>
              </td>
              <td>{h.description}</td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}
```

## Utilities

```tsx
import { parseShortcut, formatCombo, matchesCombo } from '@pyreon/hotkeys'

// Parse a shortcut string into a KeyCombo
const combo = parseShortcut('ctrl+shift+s')
// { ctrl: true, shift: true, alt: false, meta: false, key: 's' }

// Format back to human-readable
formatCombo(combo) // 'Ctrl+Shift+S'

// Check if a KeyboardEvent matches
matchesCombo(event, combo) // true/false
```
