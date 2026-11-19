# @pyreon/command

> **Status: Experimental.** Outside the semver promise: the API may change in a minor release. See the [stability policy](https://pyreon.dev/docs/stability-and-direction).

A command palette for Pyreon: every action of an app, found by typing and run from the keyboard. A fuzzy matcher, a registry of commands with shortcuts, the palette state (nested pages, async sources, recents) and a dialog component with the ARIA combobox pattern done properly.

> Typo tolerance is not part of v0.

## Install

```bash
bun add @pyreon/command @pyreon/reactivity @pyreon/core
```

`@pyreon/hotkeys` is a dependency (shortcuts are part of a palette), so it installs with the package.

| Entry | What |
| --- | --- |
| `@pyreon/command/core` | the matcher: `fuzzyMatch`, `rank`, `createRanker`; pure, no dependencies |
| `@pyreon/command` | the core plus the registry (`createCommands`, `useCommands`, `useCommand`, `provideCommands`, `formatShortcut`) and the palette state (`createPalette`) |
| `@pyreon/command/components` | `<CommandPalette>` and its parts (needs `@pyreon/core`) |
| `@pyreon/command/style.css` | an optional default look |

## Quick start

```tsx
import { useCommand } from '@pyreon/command'

export function Editor() {
  // present while this screen is mounted, gone when it is not
  useCommand({ id: 'save', title: 'Save', shortcut: 'mod+s', run: () => save() })
  return <textarea />
}
```

```ts
import { fuzzyMatch } from '@pyreon/command/core'

fuzzyMatch('np', 'New Project')?.ranges // [[0, 1], [4, 5]]: highlight N and P
fuzzyMatch('resume', 'Résumé') // matches: case and accents do not matter
```

Things worth knowing:

- The matcher is a subsequence match scored for word starts, camelCase humps, runs and prefixes; the words of a query match in any order; ranges are UTF-16 offsets that are right for emoji and combining marks.
- A shortcut is registered through `@pyreon/hotkeys` once while the command is registered and enabled. Shortcuts with Ctrl, Alt or Meta fire in a text field; bare keys do not.
- A later registration of an id wins until it is removed, so two screens can both offer "save".
- `<CommandPalette>` is a native modal `<dialog>`: focus moves in and is kept in, comes back on close, the page behind is inert, scroll is locked without a shift, Escape goes back a page and then closes, and a live region says the count, "No results", "Loading…" and why a disabled command cannot run.
- Async sources are debounced, cancellable and latest-wins; the previous rows stay while the next load.
- On the server the registry and the palette are inert.

```tsx
import { CommandPalette } from '@pyreon/command/components'
import '@pyreon/command/style.css'

export const App = () => <CommandPalette /> // mod+k
```

Full guide: [docs/command](https://pyreon.dev/docs/command).
