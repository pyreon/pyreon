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
| `enableScope(scope)` / `disableScope(scope)` | Imperative scope control — reference-counted acquire/release |
| `getActiveScopes()` | Currently active scope names |
| `getRegisteredHotkeys()` | All registered shortcuts — useful for help dialogs |
| `getHotkeyConflicts()` | Shortcuts that collide (same combo, same scope) — useful for audits/settings UIs |

## Options

```ts
interface HotkeyOptions {
  scope?: string                          // default: 'global'
  preventDefault?: boolean                // default: true
  stopPropagation?: boolean               // default: false
  enableOnInputs?: boolean | InputKind[]  // default: false; ['input'] = selective
  description?: string                    // for help dialogs
  enabled?: boolean | (() => boolean)     // reactive — re-evaluated each fire
  event?: 'keydown' | 'keyup'             // default: 'keydown'; keyup = act on release
  ignoreRepeat?: boolean                  // default: false; true skips held-key auto-repeat
  once?: boolean                          // default: false; fire once, auto-unregister
  target?: EventTarget                    // default: window; element-scoped shortcuts
}
```

The `enabled` accessor lets the hotkey gate on any reactive condition (`enabled: () => !isLoading()`) without re-registering on every change.

Shortcut strings accept a **comma-separated list** — `'ctrl+s, mod+p'` binds both to
the handler and one unregister removes all (literal comma key: the `comma` alias).
Sequences are keydown-only (`event: 'keyup'` on `'g t'` throws).

## Pressed keys & trigger

```ts
import { getPressedKeys, isKeyPressed, trigger } from '@pyreon/hotkeys'

const pressed = getPressedKeys()   // Signal<Set<string>> — lazy listeners, blur-cleared
isKeyPressed('shift')              // non-reactive point read (aliases resolve)
trigger('mod+s')                   // fire the bound handlers programmatically (→ count)
trigger('ctrl+z', { scope: 'editor' }) // target a specific (even inactive) scope
```

## Performance

Dispatch is **key-bucketed** (`Map<event.key, entries>`): a keystroke touches only the
entries bound to that exact key, so the miss path — every non-shortcut keypress — is a
single Map lookup **regardless of how many hotkeys are registered**.

Head-to-head (`bun run bench:keys` — process-isolated, correctness-gated, median ns/op,
Apple M3 Max; ns are machine-dependent, the RATIO is the signal):

| op | pyreon | tinykeys | hotkeys-js | mousetrap |
|---|---|---|---|---|
| dispatch (hit, 12 bindings) | **109** | 965 | 1186 | 254 |
| dispatch (miss) | **49** | 693 | 626 | 79 |
| dispatch (miss, 48 bindings) | **43** | 1970 | 605 | 75 |
| register + teardown ×12 | 4251 | 3889 | 12755 | 10311 |

Pyreon is fastest on every dispatch row — and FLAT as the registry grows (48 bindings:
~43ns vs tinykeys degrading ~3× to ~2µs). Register+teardown is a statistical tie with
tinykeys (they trade places run-to-run; both ~3× ahead of hotkeys-js/mousetrap) — and
tinykeys' register is a one-shot handler-map build with no incremental unbind. Fair
framing: pyreon + hotkeys-js do MORE per event (scope + input-focus filtering) than
tinykeys/mousetrap's bare matchers; full disclosure in the bench header.

## Shortcut syntax

Plus-separated, case-insensitive: `ctrl+shift+s`, `mod+k`, `alt+enter`.

Modifiers: `ctrl` / `control`, `shift`, `alt`, `meta` / `cmd` / `command`, `mod` (cross-platform).

Key aliases: `esc` → `escape`, `return` → `enter`, `del` → `delete`, `ins` → `insert`, `space` / `spacebar` → ` `, `up` / `down` / `left` / `right` → `arrowup` / `arrowdown` / …, `plus` → `+`.

**Sequential combos** — space-separated combos fire in order, Gmail/vim-style. `'g t'` fires when the user presses `g` then `t` within one second; `'ctrl+k p'` works too (each step is a full combo). A stranded prefix times out after 1 s.

```ts
useHotkey('g t', () => goToTop())
useHotkey('g n', () => goToNotifications())
```

**Shifted symbols** — bind a single symbol directly. `?` fires on the real `Shift+/` keystroke (the canonical "show help" shortcut) — the produced character encodes the shift, so you never write `shift+?`, and `/` and `?` stay distinct.

```ts
useHotkey('?', () => openHelp())
```

## Conflict detection

`getHotkeyConflicts()` returns registered shortcuts that would fire on the **same keystroke within the same scope**. Matching is on the *parsed* combo, so aliased duplicates (`ctrl+s` vs `control+s`, `mod+s` vs `ctrl+s` off Mac) are caught. Cross-scope overlaps are intentional layering and are not reported.

```ts
import { getHotkeyConflicts } from '@pyreon/hotkeys'

// In a dev-only "keyboard audit" panel or a test assertion:
for (const c of getHotkeyConflicts()) {
  console.warn(`Conflict in "${c.scope}": ${c.shortcuts.join(', ')}`)
}
```

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
- **Scopes are reference-counted** — two components that both activate `'editor'` keep it active until BOTH release it. `enableScope`/`disableScope` are acquire/release; pair them evenly.
- **`'global'` is the default scope** and is always active. A hotkey with no `scope` option fires whenever the global scope is active (which is always, unless you disable it).
- **Multiple scopes can fire simultaneously** — if both `'modal'` and `'global'` are active and both have a `'mod+s'` binding, both handlers fire. Use `stopPropagation: true` or different scopes to disambiguate; `getHotkeyConflicts()` surfaces same-scope duplicates.
- **`enableOnInputs: true` is required** to let users trigger shortcuts while typing — by default the listener checks the event target and bails on `<input>` / `<textarea>` / `<select>` / `contenteditable`.
- **Bind shifted symbols directly** — write `?` (not `shift+?`) for a help shortcut; a single symbol key already implies shift, so `?` fires on the real `Shift+/` keystroke.
- **`enabled` is re-evaluated on every dispatch** — pass a function for reactive gating; a static `false` is equivalent to never registering.
- **The hotkey listener attaches to `window`** at first registration and detaches when the last hotkey is removed (`_resetHotkeys` or every `unregister()` called).
- **SSR-safe** — registration and scope activation are no-ops on the server (no shared-state bleed across requests). `getRegisteredHotkeys()` is client-runtime state; build server-rendered help panels from a static config.

## Documentation

Full docs: [pyreon.dev/docs/hotkeys](https://pyreon.dev/docs/hotkeys) (or `docs/src/content/docs/hotkeys.md` in this repo).

## License

MIT
