---
title: "Keyboard Shortcuts — API Reference"
description: "Keyboard shortcut management — scope-aware, modifier keys, conflict detection"
---

# @pyreon/hotkeys — API Reference

> **Generated** from `hotkeys`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [hotkeys](/docs/hotkeys).

Reactive keyboard shortcut management for Pyreon. Register global or scoped shortcuts with automatic lifecycle management. Supports `mod` alias (Command on Mac, Ctrl elsewhere), multi-key combos, scope-based activation for context-aware shortcuts, and conflict detection. Component-scoped hooks auto-unregister on unmount. Imperative API available for non-component contexts.

## Features

- useHotkey(shortcut, handler, options?) — component-scoped, auto-unregisters on unmount
- useHotkeyScope(scope) — activate a scope for a component's lifetime
- mod alias — Command on Mac, Ctrl elsewhere
- Scope-based activation for context-aware shortcuts
- Imperative API: registerHotkey, enableScope, disableScope, getRegisteredHotkeys
- parseShortcut / matchesCombo / formatCombo utilities

## Complete example

A full, end-to-end usage of the package:

```tsx
import { useHotkey, useHotkeyScope, registerHotkey, getRegisteredHotkeys, enableScope, disableScope } from '@pyreon/hotkeys'

// Global shortcut — auto-unregisters on unmount
useHotkey('mod+s', (e) => {
  e.preventDefault()  // prevent browser save dialog
  save()
}, { description: 'Save document' })

// Platform-aware: mod = ⌘ on Mac, Ctrl on Windows/Linux
useHotkey('mod+k', () => openCommandPalette())

// Multi-key combo
useHotkey('ctrl+shift+p', () => openPreferences())

// Scoped shortcuts — only active when scope is enabled
useHotkeyScope('editor')  // activates 'editor' scope for this component's lifetime

useHotkey('ctrl+z', () => undo(), { scope: 'editor', description: 'Undo' })
useHotkey('ctrl+shift+z', () => redo(), { scope: 'editor', description: 'Redo' })
useHotkey('ctrl+d', () => duplicateLine(), { scope: 'editor' })

// Imperative API — for non-component contexts (stores, middleware)
const unregister = registerHotkey('ctrl+q', () => quit(), { scope: 'global' })
// unregister() when done

// Introspection
const hotkeys = getRegisteredHotkeys()  // all registered shortcuts
enableScope('modal')                     // programmatically enable a scope
disableScope('editor')                   // programmatically disable a scope

// Shortcuts can filter input elements — by default, shortcuts
// don't fire when focused on <input>, <textarea>, <select>.
// Override with:
useHotkey('escape', () => closeModal(), { enableOnInputs: true })
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`useHotkey`](#usehotkey) | hook | Register a keyboard shortcut that auto-unregisters when the component unmounts. |
| [`useHotkeyScope`](#usehotkeyscope) | hook | Activate a hotkey scope for the lifetime of the current component. |
| [`registerHotkey`](#registerhotkey) | function | Imperative hotkey registration for non-component contexts (stores, global setup). |

## API

### useHotkey `hook`

```ts
(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => void
```

Register a keyboard shortcut that auto-unregisters when the component unmounts. Shortcut format: `mod+s`, `ctrl+shift+p`, `escape`, etc. `mod` is Command on Mac, Ctrl elsewhere. By default, shortcuts don't fire when focused on form elements (input, textarea, select) — override with `enableOnInputs: true`. Supports `scope` option for context-aware activation and `description` for introspection.

**Example**

```tsx
useHotkey('mod+s', (e) => {
  e.preventDefault()
  save()
}, { description: 'Save' })

useHotkey('ctrl+z', () => undo(), { scope: 'editor' })
useHotkey('escape', () => close(), { enableOnInputs: true })
```

**Common mistakes**

- Forgetting e.preventDefault() for browser-reserved shortcuts (mod+s, mod+p) — the browser dialog fires alongside your handler
- Registering the same shortcut in overlapping scopes without priority — both handlers fire; use scope isolation to prevent conflicts
- Using useHotkey outside a component body — the onUnmount cleanup requires an active component setup context
- Not activating the scope — useHotkey with a scope option does nothing unless useHotkeyScope(scope) is called or enableScope(scope) is invoked

**See also:** `useHotkeyScope` · `registerHotkey`

---

### useHotkeyScope `hook`

```ts
(scope: string) => void
```

Activate a hotkey scope for the lifetime of the current component. When the component mounts, the scope is enabled; when it unmounts, the scope is disabled. Shortcuts registered with a matching `scope` option only fire when the scope is active. NOTE: scopes are NOT reference-counted — `disableScope` runs on every unmount, so if two components activate the same scope, the FIRST to unmount disables it for both.

**Example**

```tsx
// In an editor component:
useHotkeyScope('editor')
useHotkey('ctrl+z', () => undo(), { scope: 'editor' })

// In a modal component:
useHotkeyScope('modal')
useHotkey('escape', () => close(), { scope: 'modal' })
```

**Common mistakes**

- Using useHotkeyScope outside a component body — the lifecycle hooks require an active setup context
- Activating the same scope from two components — scopes are NOT reference-counted, so the first component to unmount calls disableScope and the second component's matching hotkeys silently stop firing

**See also:** `useHotkey` · `enableScope` · `disableScope`

---

### registerHotkey `function`

```ts
(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => () => void
```

Imperative hotkey registration for non-component contexts (stores, global setup). Returns an unregister function. Unlike useHotkey, this does NOT auto-cleanup on unmount — caller is responsible for calling the returned unregister function.

**Example**

```tsx
const unregister = registerHotkey('ctrl+q', () => quit(), { scope: 'global' })
// Later:
unregister()
```

**See also:** `useHotkey`

---

## Package-level notes

> **Note:** By default, shortcuts do NOT fire when focused on form elements (input, textarea, select). Pass `enableOnInputs: true` in options to override. Escape is a common candidate for this override.

> **mod alias:** `mod` maps to Command on macOS, Ctrl on Windows/Linux. Write `mod+s` instead of platform-specific `ctrl+s` / `cmd+s` for cross-platform shortcuts.

> **Scopes:** Scoped shortcuts only fire when their scope is active. Activate with `useHotkeyScope(scope)` (component-scoped) or `enableScope(scope)` (imperative). Without activation, scoped handlers are silently dormant.
