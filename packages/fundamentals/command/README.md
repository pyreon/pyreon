# @pyreon/command

A command palette for Pyreon: every action of an app, found by typing and run from the keyboard. This package is built in three slices; this README describes what has landed: the fuzzy matcher and the command registry with shortcuts. The palette state and the components follow.

> **Experimental.** Typo tolerance is not part of v0.

## Install

```bash
bun add @pyreon/command @pyreon/reactivity @pyreon/core
```

`@pyreon/hotkeys` is a dependency (shortcuts are part of a palette), so it installs with the package.

| Entry | What |
| --- | --- |
| `@pyreon/command/core` | the matcher: `fuzzyMatch`, `rank`, `createRanker`; pure, no dependencies |
| `@pyreon/command` | the core plus the registry: `createCommands`, `useCommands`, `useCommand`, `provideCommands`, `formatShortcut` |

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
- On the server the registry is inert.

Full guide: [docs/command](https://pyreon.dev/docs/command).
