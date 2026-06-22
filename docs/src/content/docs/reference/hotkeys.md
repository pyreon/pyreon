---
title: "Keyboard Shortcuts — API Reference"
description: "Keyboard shortcut management — scope-aware, modifier keys, conflict detection"
---

# @pyreon/hotkeys — API Reference

> **Generated** from `hotkeys`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [hotkeys](/docs/hotkeys).

Reactive keyboard shortcut management for Pyreon. Register global or scoped shortcuts with automatic lifecycle management. Supports `mod` alias (Command on Mac, Ctrl elsewhere), multi-key combos, scope-based activation for context-aware shortcuts, and conflict detection. Component-scoped hooks auto-unregister on unmount. Imperative API available for non-component contexts.

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

Register a keyboard shortcut that auto-unregisters when the component unmounts. Shortcut format: `mod+s`, `ctrl+shift+p`, `escape`, etc. `mod` is Command on Mac, Ctrl elsewhere. By default, shortcuts don't fire when focused on form elements (input, textarea, select) — override with `enableOnFormElements: true`. Supports `scope` option for context-aware activation and `description` for introspection.

**Example**

```tsx
useHotkey('mod+s', (e) => {
  e.preventDefault()
  save()
}, { description: 'Save' })

useHotkey('ctrl+z', () => undo(), { scope: 'editor' })
useHotkey('escape', () => close(), { enableOnFormElements: true })
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

Activate a hotkey scope for the lifetime of the current component. When the component mounts, the scope is enabled; when it unmounts, the scope is disabled. Shortcuts registered with a matching `scope` option only fire when the scope is active. Multiple components can activate the same scope — it stays active until the last one unmounts.

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
- Assuming scope deactivation is immediate on unmount — if another component also activated the scope, it stays active

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

> **Note:** By default, shortcuts do NOT fire when focused on form elements (input, textarea, select). Pass `enableOnFormElements: true` in options to override. Escape is a common candidate for this override.

> **mod alias:** `mod` maps to Command on macOS, Ctrl on Windows/Linux. Write `mod+s` instead of platform-specific `ctrl+s` / `cmd+s` for cross-platform shortcuts.

> **Scopes:** Scoped shortcuts only fire when their scope is active. Activate with `useHotkeyScope(scope)` (component-scoped) or `enableScope(scope)` (imperative). Without activation, scoped handlers are silently dormant.
