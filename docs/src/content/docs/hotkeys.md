---
title: Hotkeys
description: Reactive keyboard shortcut management for Pyreon — scope-aware, modifier keys, sequential combos, lifecycle-managed
---

# @pyreon/hotkeys

<PackageBadge name="@pyreon/hotkeys" />

Keyboard shortcut management for Pyreon — register global or scoped shortcuts, get
automatic cleanup on unmount, and write platform-aware combos with the `mod` alias
(⌘ on macOS, Ctrl everywhere else). Built on a single shared `keydown` listener so a
hundred registered shortcuts cost one event handler, not a hundred.

## Why a hotkey package?

Wiring `keydown` handlers by hand is deceptively fiddly. You end up re-solving the
same problems in every app:

- **Lifecycle.** A listener added in a component must be removed when that component
  unmounts — forget it and a stale handler keeps firing against a torn-down view.
- **Cross-platform modifiers.** `Cmd+S` on a Mac is `Ctrl+S` on Windows/Linux. Hard-coding
  either one breaks half your users.
- **Context.** A modal's `Escape` should close the modal, not whatever the editor
  underneath wanted `Escape` for. You need shortcuts that only fire in the right context.
- **Typing-vs-commanding.** A shortcut like `e` (edit) must not fire while the user is
  typing `e` into a text field.
- **Help screens.** Power users expect a "keyboard shortcuts" panel. That means the set
  of registered shortcuts has to be *introspectable*.

`@pyreon/hotkeys` handles all of it. `useHotkey()` registers a shortcut and tears it down
on unmount automatically. `mod` collapses the platform split. Scopes give you
context-aware activation. Input filtering is on by default. And `getRegisteredHotkeys()`
hands you the live registry for building help dialogs.

Everything is built on a **single module-level registry and one shared `keydown`
listener**. The listener attaches lazily on the first registration and detaches when the
last shortcut unregisters — so a page with no hotkeys pays nothing, and the cost scales
with one listener regardless of how many shortcuts you register.

## Installation

:::code-group

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

Peer dependencies: `@pyreon/core`, `@pyreon/reactivity`.

## Quick Start

```tsx
import { useHotkey } from '@pyreon/hotkeys'

function Editor() {
  useHotkey('mod+s', (e) => {
    e.preventDefault() // stop the browser's Save dialog
    save()
  }, { description: 'Save document' })

  useHotkey('mod+z', () => undo(), { description: 'Undo' })
  useHotkey('mod+shift+z', () => redo(), { description: 'Redo' })

  return <textarea />
  // All three shortcuts auto-unregister when Editor unmounts.
}
```

`mod` resolves to ⌘ on macOS and Ctrl on Windows/Linux, so you write one shortcut and it
works everywhere.

<Example file="./examples/hotkeys/hotkeys-keypress-recorder" title="Hotkeys — keypress recorder" />

## Core concepts

| Concept | What it does |
| ------- | ------------ |
| **`useHotkey()`** | Register a shortcut bound to the component's lifecycle — auto-unregisters on unmount. |
| **`useHotkeyScope()`** | Mark a scope active for the component's lifetime. |
| **`registerHotkey()`** | Imperative registration for non-component code; returns a manual unregister fn. |
| **Scopes** | A string label. A scoped shortcut only fires while its scope is active. `'global'` is always active. |
| **`mod` alias** | ⌘ on macOS, Ctrl elsewhere. |
| **Input filtering** | Shortcuts are suppressed while a form element / contentEditable is focused (opt out per-shortcut). |

## Shortcut syntax

A shortcut string is a sequence of `+`-joined tokens. Tokens are **case-insensitive**
and surrounding whitespace within each `+`-segment is trimmed.

```
modifier+modifier+...+key
```

The last non-modifier token is the **key**; everything else is a modifier.

```tsx
useHotkey('a', ...)              // the "a" key, no modifiers
useHotkey('mod+s', ...)          // ⌘S / Ctrl+S
useHotkey('ctrl+shift+p', ...)   // Ctrl+Shift+P
useHotkey('alt+enter', ...)      // Alt+Enter
useHotkey('escape', ...)         // the Escape key
```

### Modifiers

| Token | Maps to |
| ----- | ------- |
| `ctrl`, `control` | Control key |
| `shift` | Shift key |
| `alt` | Alt / Option key |
| `meta`, `cmd`, `command` | Meta / ⌘ key |
| `mod` | ⌘ on macOS, Ctrl on Windows/Linux |

Prefer `mod` over `ctrl`/`cmd` for any cross-platform shortcut — it's the whole reason
the alias exists.

### Key aliases

For keys whose `KeyboardEvent.key` name is awkward to type, these aliases are accepted.
You can always use the underlying name directly instead.

| Alias | Resolves to |
| ----- | ----------- |
| `esc` | `escape` |
| `return` | `enter` |
| `del` | `delete` |
| `ins` | `insert` |
| `space`, `spacebar` | `" "` (space) |
| `up` | `arrowup` |
| `down` | `arrowdown` |
| `left` | `arrowleft` |
| `right` | `arrowright` |
| `plus` | `+` |

```tsx
useHotkey('esc', () => close())      // same as 'escape'
useHotkey('mod+up', () => moveUp())  // ⌘ + ArrowUp
useHotkey('shift+space', () => pageUp())
```

### Exact-match semantics

A shortcut fires only when the held modifiers match **exactly**. `mod+s` matches ⌘S, but
*not* ⌘⇧S — that extra Shift makes it a different combo. This means combos can't
accidentally collide by being a "subset" of a larger one: register `mod+s` and `mod+shift+s`
and each fires only for its precise modifier set.

```tsx
useHotkey('mod+s', () => save())            // fires on ⌘S only
useHotkey('mod+shift+s', () => saveAs())    // fires on ⌘⇧S only
```

The one exception is **single symbol keys**. `?`, `!`, `+`, and friends are typed *with*
Shift on a standard layout, so exact-match would never let them fire. Instead the Shift
modifier is ignored for single-symbol bindings — the produced `event.key` already encodes
the character. Bind the symbol directly:

```tsx
useHotkey('?', () => openHelp())   // fires on the real Shift+/ keystroke
```

Don't write `shift+?` — the symbol already implies Shift, and `/` vs `?` stay distinct
because their `event.key` values differ. Letters and named keys (`a`, `arrowup`) keep
exact Shift-matching, so `a` never matches `Shift+A`.

### Sequential combos

Separate combos with a **space** to require them to be pressed in order. Each step must
arrive within **1 second** of the previous one, or the sequence resets.

```tsx
// Press "g", then "t" (Gmail-style navigation)
useHotkey('g t', () => goToTasks())
useHotkey('g i', () => goToInbox())

// Steps can carry their own modifiers
useHotkey('ctrl+k p', () => openPalette())  // Ctrl+K, then P
```

Each step is parsed with the same syntax as a single shortcut, so modifiers and aliases
work at every position. While a sequence is mid-flight, the matched first keystroke is
consumed (its default is prevented if `preventDefault` is on) but the handler does not
fire until the full sequence completes.

:::note
`formatCombo(parseShortcut(...))` only understands single combos — it parses on `+`, not
spaces. For a sequential shortcut like `'g t'`, render the raw `shortcut` string instead
of round-tripping it through `parseShortcut`.
:::

## Component hook — `useHotkey()`

`useHotkey(shortcut, handler, options?)` registers a shortcut and ties it to the calling
component. When the component unmounts, the shortcut is automatically unregistered — you
never write cleanup code.

```tsx
import { useHotkey } from '@pyreon/hotkeys'

function App() {
  useHotkey('mod+k', () => openCommandPalette())
  useHotkey('escape', () => closeModal())
  useHotkey('ctrl+shift+p', () => openSettings(), {
    description: 'Open settings',
  })
}
```

The handler receives the raw `KeyboardEvent`, so you can inspect `e.key`, call
`e.preventDefault()`, etc.

:::warning
`useHotkey()` (and `useHotkeyScope()`) must be called **inside a component body**. The
auto-cleanup relies on `onUnmount`, which needs an active component setup context. For
stores, middleware, or app-init code, use the imperative [`registerHotkey()`](#imperative-api--registerhotkey) instead.
:::

### Options

`useHotkey` and `registerHotkey` both accept a `HotkeyOptions` object:

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `scope` | `string` | `'global'` | Shortcut only fires while this scope is active. |
| `preventDefault` | `boolean` | `true` | Call `e.preventDefault()` before the handler runs. |
| `stopPropagation` | `boolean` | `false` | Call `e.stopPropagation()` before the handler runs. |
| `enableOnInputs` | `boolean` | `false` | Fire even when an input / textarea / select / contentEditable is focused. |
| `description` | `string` | — | Human-readable label, surfaced by `getRegisteredHotkeys()` for help dialogs. |
| `enabled` | `boolean \| (() => boolean)` | `true` | Whether the shortcut is active. A function is re-evaluated on every keystroke. |

:::warning
`preventDefault` defaults to **`true`**. That's usually what you want — but it means a
shortcut like `mod+a` will block the browser's "select all" *even if your handler doesn't
need to*. For shortcuts where you want the native behavior to coexist, pass
`{ preventDefault: false }`.
:::

:::warning
**Don't forget `e.preventDefault()` for browser-reserved combos.** Although
`preventDefault` defaults to `true`, if you explicitly set `{ preventDefault: false }` on
a combo the browser also owns (`mod+s`, `mod+p`, `mod+d`), the native dialog fires
*alongside* your handler. Either leave the default on, or call `e.preventDefault()`
yourself inside the handler.
:::

### Dynamic enable / disable

`enabled` accepts a function, re-evaluated on each matching keystroke — wire it to a
signal or computed for reactive gating without re-registering.

```tsx
import { computed } from '@pyreon/reactivity'

const canSave = computed(() => hasChanges() && !isSaving())

useHotkey('mod+s', () => save(), {
  enabled: () => canSave(),
  description: 'Save (only when there are unsaved changes)',
})
```

When `enabled` returns false, the shortcut is skipped during dispatch as if it weren't
registered — no cleanup, no re-register.

## Input filtering

By default, shortcuts are **suppressed** while the user is focused on a text-entry
surface, so a single-key shortcut like `e` doesn't fire while someone types "e" into a
field. The suppressed surfaces are:

- `<input>` elements
- `<textarea>` elements
- `<select>` elements
- any element with `contentEditable`

Opt out per-shortcut with `enableOnInputs: true`. `escape` is the classic candidate — you
usually want it to dismiss a dialog even while a field inside it has focus.

```tsx
// Fires even when an input is focused
useHotkey('escape', () => closeModal(), { enableOnInputs: true })

// Stays suppressed while typing (the default)
useHotkey('e', () => startEditing())
```

## Scopes — `useHotkeyScope()`

Scopes turn shortcuts on and off based on UI context. A shortcut registered with a
`scope` option only fires while that scope is **active**; `useHotkeyScope(scope)` marks a
scope active for the calling component's lifetime.

```tsx
import { useHotkey, useHotkeyScope } from '@pyreon/hotkeys'

function Modal() {
  useHotkeyScope('modal') // 'modal' is active while Modal is mounted

  useHotkey('escape', () => close(), { scope: 'modal' })
  useHotkey('enter', () => confirm(), { scope: 'modal' })
}

function Editor() {
  useHotkeyScope('editor')

  useHotkey('ctrl+z', () => undo(), { scope: 'editor' })
  useHotkey('ctrl+shift+z', () => redo(), { scope: 'editor' })
}
```

The `'global'` scope is **always active** and is the default for any shortcut that
doesn't set a `scope`. Custom scopes are inactive until something activates them.

:::warning
A scoped shortcut is **silently dormant** until its scope is active. If `useHotkey('ctrl+z',
…, { scope: 'editor' })` does nothing, the most common cause is that no component called
`useHotkeyScope('editor')` (or `enableScope('editor')`) — the handler is registered but
its scope is off, so dispatch skips it.
:::

:::note
**Scope activation is reference-counted.** `useHotkeyScope` acquires the scope on mount and
releases it on unmount. If two components both activate `'editor'`, the scope stays active
until *both* unmount — so stacked panels, nested modals, and sibling components sharing a
scope all stay correct. The imperative `enableScope` / `disableScope` are the same
acquire/release primitive; pair them evenly (an unmatched `enableScope` keeps the scope
active until a matching `disableScope`).
:::

### Detecting scope conflicts

If you register the same combo in two scopes that are active at the same time, **both**
handlers fire, in registration order. That cross-scope overlap is intentional *layering*.
A genuine bug is the same combo registered **twice in the same scope** — `getHotkeyConflicts()`
surfaces exactly those (see [Introspection](#introspection--help-dialogs)).

```tsx
// Intentional layering — both fire if 'editor' and 'modal' are active:
useHotkey('escape', () => clearSelection(), { scope: 'editor' })
useHotkey('escape', () => closeModal(), { scope: 'modal' })

// A same-scope duplicate — getHotkeyConflicts() flags this pair:
useHotkey('mod+s', saveDraft, { scope: 'editor' })
useHotkey('mod+s', saveAll, { scope: 'editor' })
```

## Imperative API — `registerHotkey()`

For code that runs **outside a component** — stores, middleware, plugins, one-time app
setup — use `registerHotkey()`. It takes the same arguments as `useHotkey` but returns an
**unregister function** instead of auto-cleaning-up.

```tsx
import { registerHotkey } from '@pyreon/hotkeys'

const unregister = registerHotkey('ctrl+q', () => quit(), {
  scope: 'global',
  description: 'Quit',
})

// You own the cleanup:
unregister()
```

:::danger
`registerHotkey()` does **not** auto-clean up. If you never call the returned function,
the shortcut lives for the lifetime of the page. `useHotkey()` is the right choice
anywhere you have a component lifecycle.
:::

### Imperative scope control

Outside a component, manage scopes with `enableScope` / `disableScope`:

```tsx
import { enableScope, disableScope, getActiveScopes } from '@pyreon/hotkeys'

enableScope('editor')   // turn a scope on
disableScope('editor')  // turn it off — 'global' can't be disabled

// Inspect the active set reactively
const scopes = getActiveScopes() // Signal<Set<string>>
console.log([...scopes()])        // e.g. ['global', 'editor']
```

`getActiveScopes()` returns the underlying reactive `Signal<Set<string>>`, so you can read
it inside an effect or computed to react to scope changes. `disableScope('global')` is a
no-op — the global scope can never be turned off.

## Introspection & help dialogs

`getRegisteredHotkeys()` returns a read-only snapshot of every registered shortcut. Each
entry has `{ shortcut, scope, description? }` — enough to render a "keyboard shortcuts"
panel.

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

:::note
`getRegisteredHotkeys()` returns a one-time array, not a reactive signal — call it again
to get a fresh snapshot. For a panel that updates live as shortcuts mount and unmount,
re-read it on open, or recompute when `getActiveScopes()` changes.
:::

### Conflict detection

`getHotkeyConflicts()` flags shortcuts that would fire on the **same keystroke within the
same scope** — the classic "two handlers, one binding, both fire" bug. Matching is on the
*parsed* combo, not the source string, so aliased duplicates (`ctrl+s` vs `control+s`, or
`mod+s` vs `ctrl+s` off Mac) are caught too. Cross-scope overlaps are intentional layering
and are **not** reported.

```tsx
import { getHotkeyConflicts } from '@pyreon/hotkeys'

// A dev-only audit panel — or assert `getHotkeyConflicts()` is empty in a test.
function ConflictWarnings() {
  const conflicts = getHotkeyConflicts()
  if (conflicts.length === 0) return null
  return (
    <ul>
      {conflicts.map((c) => (
        <li>
          Conflict in <code>{c.scope}</code>: {c.shortcuts.join(', ')}
        </li>
      ))}
    </ul>
  )
}
```

Each conflict is `{ scope, shortcuts, descriptions }` — the colliding source strings and
their descriptions (parallel arrays, `undefined` where none was set).

## Utilities

Three pure functions back the matching and formatting machinery. They're exported so you
can use them directly — e.g. for custom rendering or testing.

```tsx
import { parseShortcut, formatCombo, matchesCombo } from '@pyreon/hotkeys'

// Parse a single combo string into a KeyCombo
const combo = parseShortcut('ctrl+shift+s')
// → { ctrl: true, shift: true, alt: false, meta: false, key: 's' }

// Format a KeyCombo back to a human-readable label.
// Meta renders as ⌘ on Mac, "Meta" elsewhere.
formatCombo(combo) // 'Ctrl+Shift+S'

// Check whether a KeyboardEvent matches a combo (exact modifiers)
window.addEventListener('keydown', (e) => {
  if (matchesCombo(e, combo)) {
    /* matched */
  }
})
```

`parseShortcut` understands a **single** combo (modifiers joined with `+`) — it does not
split on spaces, so pass it one combo at a time, not a sequential shortcut like `'g t'`.

## Server-side rendering

`@pyreon/hotkeys` drives a browser `keydown` listener, so on the server every mutating
entry point is a **no-op**: `registerHotkey` records nothing and returns an inert
unregister, and `enableScope` / `disableScope` don't touch scope state. This matters
because the registry is a module-level singleton **shared across every SSR request** —
recording entries or flipping scopes on the server would leak unboundedly (no unmount
fires during `renderToString`) and bleed one request's hotkeys into the next. You don't
need to wrap `useHotkey` in a browser guard; shortcuts come alive on the client when the
registry attaches its listener on the first registration during hydration.

Because registration is a client-runtime concern, `getRegisteredHotkeys()` returns an empty
list on the server. Build a server-rendered "keyboard shortcuts" panel from a static config
rather than the live registry.

## Common mistakes

:::warning
**Calling `useHotkey` / `useHotkeyScope` outside a component.** Both rely on `onUnmount`,
which requires an active component setup context. Use `registerHotkey` + `enableScope` /
`disableScope` for non-component code.
:::

:::warning
**A scoped shortcut that never fires.** Its scope isn't active. Add `useHotkeyScope(scope)`
in the owning component (or `enableScope(scope)` imperatively). The `'global'` scope is
always on, so global shortcuts never hit this.
:::

:::warning
**Registering the same combo twice in one scope.** Both handlers fire on every press.
Scope activation *is* reference-counted (stacked components sharing a scope are fine), but a
genuine duplicate binding in the same scope is a bug — audit with `getHotkeyConflicts()`,
which also catches aliased duplicates like `ctrl+s` vs `control+s`.
:::

:::warning
**Writing `shift+?` for a help shortcut.** Bind `?` directly. A single symbol key already
implies Shift, so `?` fires on the real `Shift+/` keystroke and `shift+?` never matches.
:::

:::warning
**The browser dialog fires alongside your handler.** You disabled `preventDefault` for a
browser-reserved combo (`mod+s`, `mod+p`). Leave the default `preventDefault: true` on, or
call `e.preventDefault()` in the handler.
:::

## API Reference

### Hooks

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `useHotkey` | `(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => void` | Register a shortcut bound to the component's lifecycle. Auto-unregisters on unmount. |
| `useHotkeyScope` | `(scope: string) => void` | Activate a scope for the component's lifetime; deactivates on unmount. Reference-counted, so stacked components sharing a scope stay correct. |

### Imperative API

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `registerHotkey` | `(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => () => void` | Register a shortcut imperatively. Returns an unregister function; **no** auto-cleanup. No-op on the server. |
| `enableScope` | `(scope: string) => void` | Acquire a scope (reference-counted). No-op on the server. |
| `disableScope` | `(scope: string) => void` | Release a scope (reference-counted). No-op for `'global'` and on the server. |
| `getActiveScopes` | `() => Signal<Set<string>>` | The reactive set of currently-active scopes. |
| `getRegisteredHotkeys` | `() => ReadonlyArray<{ shortcut: string; scope: string; description?: string }>` | Snapshot of every registered shortcut, for help dialogs. Empty on the server. |
| `getHotkeyConflicts` | `() => ReadonlyArray<{ scope: string; shortcuts: string[]; descriptions: Array<string \| undefined> }>` | Registered shortcuts that collide (same parsed combo, same scope). |

### Utilities

| Export | Signature | Description |
| ------ | --------- | ----------- |
| `parseShortcut` | `(shortcut: string) => KeyCombo` | Parse a single combo string into a `KeyCombo`. Supports aliases and `mod`. |
| `matchesCombo` | `(event: KeyboardEvent, combo: KeyCombo) => boolean` | Whether the event's modifiers + key match the combo (Shift is ignored for single-symbol keys like `?`). |
| `formatCombo` | `(combo: KeyCombo) => string` | Human-readable label (`⌘` for Meta on Mac, `Meta` elsewhere). |

### Options — `HotkeyOptions`

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `scope` | `string` | `'global'` | Scope the shortcut belongs to. |
| `preventDefault` | `boolean` | `true` | Call `e.preventDefault()` before the handler. |
| `stopPropagation` | `boolean` | `false` | Call `e.stopPropagation()` before the handler. |
| `enableOnInputs` | `boolean` | `false` | Fire even when a form element / contentEditable is focused. |
| `description` | `string` | — | Human-readable label for help dialogs. |
| `enabled` | `boolean \| (() => boolean)` | `true` | Whether the shortcut is active; a function is re-evaluated per keystroke. |

### Types

| Type | Shape | Description |
| ---- | ----- | ----------- |
| `KeyCombo` | `{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; key: string }` | A parsed single key combination. |
| `HotkeyOptions` | see table above | Registration options for `useHotkey` / `registerHotkey`. |
| `HotkeyEntry` | `{ shortcut: string; combo: KeyCombo; sequence: KeyCombo[]; handler; options }` | A fully-resolved registry entry (internal shape). For sequential combos, `combo` is the first step and `sequence` holds the rest. |
