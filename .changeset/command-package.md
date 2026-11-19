---
"@pyreon/command": minor
---

New package `@pyreon/command` (Experimental), first slice: the fuzzy matcher and the command registry. The palette state and the components follow.

- **Matcher (`@pyreon/command/core`, no dependencies):** `fuzzyMatch`, `rank` and `createRanker`. A subsequence match that is case- and diacritic-insensitive ("resume" finds "Résumé", "strasse" finds "Straße", katakana and hiragana are the same), scored for word starts, camelCase humps, consecutive characters and prefixes (so "np" finds New Project), with the words of a query matching in any order. Match ranges are UTF-16 offsets that are right for surrogate pairs, emoji sequences, flags and combining marks. `createRanker` caches the prepared texts (bounded) and narrows exactly: a query that extends the previous one only looks at what the previous one matched. Typo tolerance is not part of v0.
- **Registry (`@pyreon/command`):** `createCommands`, `useCommands`, `useCommand`, `provideCommands`. `useCommand` registers a command for the lifetime of a component, so the list matches the screen; titles can be functions (switching the locale re-ranks); commands can have nested pages; the latest registration of an id wins and the earlier one is back when it is removed; recents are bounded and can be persisted; `search` is synchronous and reactive. On the server the registry is inert.
- **Shortcuts:** a command's `shortcut` is registered through `@pyreon/hotkeys` once while the command is registered and enabled, and moved only when the shortcut changed. Shortcuts with Ctrl, Alt or Meta fire in a text field; bare keys do not. A development warning names both commands when two share a shortcut. `formatShortcut` and `shortcutKeys` are platform-aware.
