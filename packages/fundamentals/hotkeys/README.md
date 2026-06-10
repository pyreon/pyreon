# @pyreon/hotkeys

Reactive keyboard shortcut management — scope-aware, platform-aware, lifecycle-cleaned.

Register global or component-scoped keyboard shortcuts with automatic unregistration on unmount. Supports modifier keys (`ctrl` / `shift` / `alt` / `meta` / `cmd` / `command` / `mod`), scope-based activation (only fire while a scope is active), input filtering (off by default in form fields), and the `mod` modifier that maps to `⌘` on Mac and `Ctrl` everywhere else. Pairs naturally with `@pyreon/router` (per-route scopes), `@pyreon/dialog` (modal scope), and command-palette UIs.

## Install

```bash
bun add @pyreon/hotkeys @pyreon/core @pyreon/reactivity
```

## Quick start

```tsx
import { useHotkey, useHotkeyScope } from '@pyreon/hotkeys'

function Editor() {
  // Global shortcut — auto-unregisters on unmount
  useHotkey('mod+s', () => save(), { description: 'Save document' })
  useHotkey('mod+k', () => openCommandPalette())

  // Scoped shortcuts — only fire when the `editor` scope is active
  useHotkeyScope('editor')
  useHotkey('mod+z', () => undo(), { scope: 'editor' })
  useHotkey('mod+shift+z', () => redo(), { scope: 'editor' })
}
```

`mod` = `⌘` on Mac, `Ctrl` everywhere else. Shortcuts are ignored when typing in `<input>` / `<textarea>` / `contenteditable` by default (`enableOnInputs: true` to opt in).

## Hooks

### `useHotkey(shortcut, handler, options?)`

Component-lifecycle shortcut. Registers on mount, unregisters on unmount.

```ts
useHotkey('escape', () => setOpen(false), { scope: 'modal', preventDefault: true })
```

### `useHotkeyScope(scope)`

Activate a scope for the component's lifetime. Multiple scopes can be active concurrently; a hotkey fires when ITS scope is active.

```tsx
function Modal() {
  useHotkeyScope('modal')
  useHotkey('escape', close, { scope: 'modal' })
  useHotkey('tab', focusNext, { scope: 'modal' })
}
```

## Imperative API

For non-component use (one-off registration, dynamic shortcuts read from settings, etc.):

| Function | Notes |
|---|---|
| `registerHotkey(shortcut, handler, options?)` | Returns an `unregister()` function — call manually |
| `enableScope(scope)` / `disableScope(scope)` | Imperative scope control |
| `getActiveScopes()` | Currently active scope names |
| `getRegisteredHotkeys(): HotkeyEntry[]` | All registered shortcuts — useful for help dialogs |

## Options

```ts
interface HotkeyOptions {
  scope?: string                          // default: 'global'
  preventDefault?: boolean                // default: true
  stopPropagation?: boolean               // default: false
  enableOnInputs?: boolean                // default: false
  description?: string                    // for help dialogs
  enabled?: boolean | (() => boolean)     // reactive — re-evaluated each fire
}
```

The `enabled` accessor lets the hotkey gate on any reactive condition (`enabled: () => !isLoading()`) without re-registering on every change.

## Shortcut syntax

Plus-separated, case-insensitive: `ctrl+shift+s`, `mod+k`, `alt+enter`.

Modifiers: `ctrl` / `control`, `shift`, `alt`, `meta` / `cmd` / `command`, `mod` (cross-platform).

Key aliases: `esc` → `escape`, `return` → `enter`, `del` → `delete`, `ins` → `insert`, `space` / `spacebar` → ` `, `up` / `down` / `left` / `right` → `arrowup` / `arrowdown` / …, `plus` → `+`.

## Parsing utilities

For building custom UIs (settings panels, help overlays):

```ts
import { parseShortcut, formatCombo, matchesCombo } from '@pyreon/hotkeys'

const combo = parseShortcut('mod+shift+s')
// { ctrl: false, shift: true, alt: false, meta: true, key: 's' }   (on Mac)

formatCombo(combo)
// '⌘+Shift+S'   (on Mac) or 'Ctrl+Shift+S' (elsewhere)

window.addEventListener('keydown', (e) => {
  if (matchesCombo(e, combo)) save()
})
```

## Testing

```ts
import { _resetHotkeys } from '@pyreon/hotkeys'
import { afterEach } from 'vitest'

afterEach(_resetHotkeys)
```

Clears every registered hotkey and active scope. Underscore-prefixed because it's only meant for test environments.

## Gotchas

- **Scopes are NOT hierarchical** — activating `'editor'` does not implicitly activate `'editor/code'`. A hotkey fires only when its exact scope string is active.
- **`'global'` is the default scope** and is always active. A hotkey with no `scope` option fires whenever the global scope is active (which is always, unless you disable it).
- **Multiple scopes can fire simultaneously** — if both `'modal'` and `'global'` are active and both have a `'mod+s'` binding, both handlers fire. Use `stopPropagation: true` or different scopes to disambiguate.
- **`enableOnInputs: true` is required** to let users trigger shortcuts while typing — by default the listener checks `document.activeElement` and bails on form fields / `contenteditable`.
- **`enabled` is re-evaluated on every dispatch** — pass a function for reactive gating; a static `false` is equivalent to never registering.
- **The hotkey listener attaches to `window`** at first registration and detaches when the last hotkey is removed (`_resetHotkeys` or every `unregister()` called).

## Documentation

Full docs: [docs.pyreon.dev/docs/hotkeys](https://docs.pyreon.dev/docs/hotkeys) (or `docs/src/content/docs/hotkeys.md` in this repo).

## License

MIT
