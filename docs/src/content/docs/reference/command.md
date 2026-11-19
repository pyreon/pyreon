---
title: "@pyreon/command — API Reference"
description: "A command palette for Pyreon: a fuzzy matcher, a registry of commands with shortcuts, recents and nested pages"
---

> **Generated** from `command`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [command](/docs/command).

Every action of an app, found by typing and run from the keyboard. `@pyreon/command/core` is the pure matcher: `fuzzyMatch` and `rank` are case- and diacritic-insensitive (Résumé is found by "resume", Straße by "strasse", ユーザー by ゆーざー), score word starts, camelCase humps, consecutive characters and prefixes (so "np" finds New Project), match the words of a query in any order, and return ranges in UTF-16 offsets that are right for emoji and combining marks, for highlighting. `createRanker` keeps the prepared texts and narrows: a query that extends the previous one only looks at what the previous one matched. The registry (`createCommands`, `useCommands`, `useCommand`, `provideCommands`) holds the commands: `useCommand` registers one for the lifetime of a component, so the list always matches what is on screen; a title can be a function (switching the locale re-ranks); a command can have nested pages (`children`); recents are kept and can be persisted; a command with a `shortcut` is registered through `@pyreon/hotkeys` exactly once while it is registered and enabled, with a development warning that names both commands when two share a shortcut. Typo tolerance is not part of v0. On the server the registry is inert.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

a keyboard-driven DOM overlay built on @pyreon/hotkeys; native apps have no command palette convention and the matcher is plain TypeScript a native app can call itself

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- A fuzzy matcher: subsequence, case- and diacritic-insensitive, katakana and hiragana folded, German letters spelled out, scored for word starts, humps, runs and prefixes; words of a query in any order
- Match ranges in UTF-16 offsets, right for surrogate pairs, emoji sequences, flags and combining marks, for highlighting
- createRanker: prepared texts cached (bounded) and an exact narrowing for a query that extends the previous one
- A registry: useCommand registers for the life of a component; the latest registration of an id wins and gives it back when removed; titles as functions follow the locale
- Shortcuts through @pyreon/hotkeys: one registration per enabled command, moved only when the shortcut changed, modifier shortcuts fire in text fields and bare keys do not, a dev warning for two commands on one shortcut
- Recents with a bounded recency boost, persisted through any &#123; get, set &#125; storage
- Inert on the server; unregister, dispose and unmount leave no hotkey, listener, computed or effect behind

## Complete example

A full, end-to-end usage of the package:

```tsx
import { createCommands } from '@pyreon/command'

const commands = createCommands()
commands.register([{ id: 'new-project', title: 'New Project' }, { id: 'open-panel', title: 'Open Panel' }])

commands.search('np')[0]!.id   // => 'new-project'
commands.search('np')[0]!.ranges   // => [[0, 1], [4, 5]]
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`fuzzyMatch`](#fuzzymatch-function-experimental) | function | Match `query` against `text`: a subsequence of the text, case- and diacritic-insensitive, scored for word starts, humps,… |
| [`rank`](#rank-function-experimental) | function | Rank `items` against `query`, best first. |
| [`createRanker`](#createranker-function-experimental) | function | A ranker that remembers: the prepared (split and folded) texts, bounded by `cacheSize`, and the previous candidates, so… |
| [`MAX_QUERY_UNITS`](#max_query_units-constant-experimental) | constant | A query is cut at this many characters (128). |
| [`MAX_QUERY_WORDS`](#max_query_words-constant-experimental) | constant | Words of a query beyond this many (8) are ignored. |
| [`MAX_TEXT_UNITS`](#max_text_units-constant-experimental) | constant | Only the first this many (512) units of a text are matched. |
| [`prepareText`](#preparetext-function-experimental) | function | Split and fold a text once (units, folded keys, offsets, position bonuses). |
| [`prepareQuery`](#preparequery-function-experimental) | function | Split and fold a query into words. |
| [`matchPrepared`](#matchprepared-function-experimental) | function | The engine behind `fuzzyMatch`, for callers that prepared both sides. |
| [`createCommands`](#createcommands-function-experimental) | function | A registry of commands. |
| [`useCommands`](#usecommands-function-experimental) | function | The registry provided by the nearest `provideCommands`, or the app-wide default registry. |
| [`useCommand`](#usecommand-function-experimental) | function | Register a command for the lifetime of the component: it and its shortcut go away on unmount, so the list matches the… |
| [`provideCommands`](#providecommands-function-experimental) | function | Make a registry the one used by this component and everything below it. |
| [`isCommandEnabled`](#iscommandenabled-function-experimental) | function | Whether a command is enabled: `enabled` is a boolean or a function, and absent means enabled. |
| [`formatShortcut`](#formatshortcut-function-experimental) | function | A shortcut as the user reads it on this platform (`@pyreon/hotkeys` `formatCombo`): `mod+k` is "⌘+K" on macOS and… |
| [`shortcutKeys`](#shortcutkeys-function-experimental) | function | The keys of each press, to render them as keycaps. |
| [`hasCommandModifier`](#hascommandmodifier-function-experimental) | function | Whether a shortcut has Ctrl, Alt or Meta (Shift alone does not count). |
| [`Command`](#command-type-experimental) | type | One command. |
| [`Commands`](#commands-type-experimental) | type | The registry returned by `createCommands`. |
| [`Match`](#match-type-experimental) | type | One search result. |
| [`RunContext`](#runcontext-type-experimental) | type | What a command's `run` receives. |

## API

### `fuzzyMatch` `function` — **experimental**

```ts
(query, text, options?: { anyOrder? }) => { score, ranges } | null
```

Match `query` against `text`: a subsequence of the text, case- and diacritic-insensitive, scored for word starts, humps, consecutive characters and prefixes. The words of the query match in any order. An empty query matches everything with score 0. `ranges` are sorted, merged `[start, end)` UTF-16 offsets for highlighting.

**Example**

```tsx
fuzzyMatch('np', 'New Project')?.ranges   // => [[0, 1], [4, 5]]
fuzzyMatch('resume', 'Résumé')?.ranges   // => [[0, 6]]
fuzzyMatch('xyz', 'New Project')   // => null
```

---

### `rank` `function` — **experimental**

```ts
(query, items, getText, options?) => Ranked[]
```

Rank `items` against `query`, best first. `getText` returns one text or several (title, then keywords): the best one counts, and a text after the first is weighted down. Equal scores keep the order of `items`. `boost` adds to the score and `priority` breaks ties; `limit` keeps the best few.

**Example**

```tsx
rank('sa', ['Save', 'Save As…', 'Disable Autosave'], (t) => t).map((r) => r.item)   // => ['Save', 'Save As…', 'Disable Autosave']
rank('np', ['Open Panel', 'New Project'], (t) => t)[0]!.item   // => 'New Project'
```

---

### `createRanker` `function` — **experimental**

```ts
(getText, options?: { cacheSize? }) => { rank, reset, lastScanned }
```

A ranker that remembers: the prepared (split and folded) texts, bounded by `cacheSize`, and the previous candidates, so a query that extends the previous one on the same list only looks at what matched before. The answer is exactly the one a fresh `rank` gives. Call `reset()` when the texts of the items changed.

**Example**

```tsx
const ranker = createRanker<string>((t) => t)
const list = ['open', 'close', 'save']
ranker.rank('o', list).length   // => 2
(ranker.rank('o', list), ranker.rank('op', list).length)   // => 1
(ranker.rank('o', list), ranker.rank('op', list), ranker.lastScanned)   // => 2
```

---

### `MAX_QUERY_UNITS` `constant` — **experimental**

```ts
number
```

A query is cut at this many characters (128).

**Example**

```tsx
MAX_QUERY_UNITS   // => 128
```

---

### `MAX_QUERY_WORDS` `constant` — **experimental**

```ts
number
```

Words of a query beyond this many (8) are ignored.

**Example**

```tsx
MAX_QUERY_WORDS   // => 8
```

---

### `MAX_TEXT_UNITS` `constant` — **experimental**

```ts
number
```

Only the first this many (512) units of a text are matched.

**Example**

```tsx
MAX_TEXT_UNITS   // => 512
```

---

### `prepareText` `function` — **experimental**

```ts
(text) => PreparedText
```

Split and fold a text once (units, folded keys, offsets, position bonuses). `fuzzyMatch` accepts the result in place of the string.

**Example**

```tsx
prepareText('Résumé').keys   // => ['r', 'e', 's', 'u', 'm', 'e']
```

---

### `prepareQuery` `function` — **experimental**

```ts
(query, options?) => PreparedQuery
```

Split and fold a query into words. `key` is the folded words joined by one space: equal keys are equal queries, and a key that starts with another narrows it.

**Example**

```tsx
prepareQuery('  New   Project ').key   // => 'new project'
```

---

### `matchPrepared` `function` — **experimental**

```ts
(query: PreparedQuery, text: PreparedText) => { score, ranges } | null
```

The engine behind `fuzzyMatch`, for callers that prepared both sides.

**Example**

```tsx
matchPrepared(prepareQuery('rs'), prepareText('Résumé'))?.ranges   // => [[0, 1], [2, 3]]
```

---

### `createCommands` `function` — **experimental**

```ts
(options?: { recents?, groups?, onError? }) => Commands
```

A registry of commands. `register` takes a command, a list or a function that returns one, and returns the unregister (inside a component it also runs on unmount). `search` ranks the registered commands (or the `children` of `parent`), `run` runs one by id, `recents` lists the last ones run. Registering an id that is registered shadows it until the new one is removed. Inert on the server.

**Example**

```tsx
const commands = createCommands({ recents: { max: 3 } })
const off = commands.register({ id: 'save', title: 'Save', keywords: ['write'] })
commands.search('write')[0]!.field   // => 'keyword'
off()
commands.commands().length   // => 0
```

---

### `useCommands` `function` — **experimental**

```ts
() => Commands
```

The registry provided by the nearest `provideCommands`, or the app-wide default registry.

**Example**

```tsx
typeof useCommands   // => 'function'
```

---

### `useCommand` `function` — **experimental**

```ts
(command | () => command) => void
```

Register a command for the lifetime of the component: it and its shortcut go away on unmount, so the list matches the screen. A function reads signals; its fields update in place and the shortcut is re-registered only when it changed.

**Example**

```tsx
typeof useCommand   // => 'function'
```

---

### `provideCommands` `function` — **experimental**

```ts
(commands: Commands) => void
```

Make a registry the one used by this component and everything below it.

**Example**

```tsx
typeof provideCommands   // => 'function'
```

---

### `isCommandEnabled` `function` — **experimental**

```ts
(command) => boolean
```

Whether a command is enabled: `enabled` is a boolean or a function, and absent means enabled.

**Example**

```tsx
isCommandEnabled({ id: 'a', title: 'A', enabled: () => false })   // => false
```

---

### `formatShortcut` `function` — **experimental**

```ts
(shortcut: string) => string
```

A shortcut as the user reads it on this platform (`@pyreon/hotkeys` `formatCombo`): `mod+k` is "⌘+K" on macOS and "Ctrl+K" elsewhere; a sequence keeps its spaces.

**Example**

```tsx
formatShortcut('ctrl+shift+p')   // => 'Ctrl+Shift+P'
```

---

### `shortcutKeys` `function` — **experimental**

```ts
(shortcut: string) => string[][]
```

The keys of each press, to render them as keycaps.

**Example**

```tsx
shortcutKeys('ctrl+k')   // => [['Ctrl', 'K']]
```

---

### `hasCommandModifier` `function` — **experimental**

```ts
(shortcut: string) => boolean
```

Whether a shortcut has Ctrl, Alt or Meta (Shift alone does not count). Such a shortcut fires while a text field has focus; a bare key does not. This is the rule commands follow.

**Example**

```tsx
hasCommandModifier('ctrl+k')   // => true
```

---

### `Command` `type` — **experimental**

```ts
interface Command { id; title; subtitle?; keywords?; group?; icon?; shortcut?; enabled?; disabledReason?; run?(context); children?; keepOpen?; priority? }
```

One command. `title`, `subtitle` and `disabledReason` can be functions; `children` is a nested page (a list) or, for an async source, a function of the query and an AbortSignal.

**Example**

```tsx
const command: Command = { id: 'save', title: 'Save', shortcut: 'mod+s', run: () => {} }
```

---

### `Commands` `type` — **experimental**

```ts
interface Commands { register(); registerGroup(); commands(); groups(); get(); run(); search(); recents(); clearRecents(); dispose() }
```

The registry returned by `createCommands`.

**Example**

```tsx
const commands: Commands = createCommands()
```

---

### `Match` `type` — **experimental**

```ts
interface Match { command; id; title; score; field: "title" | "subtitle" | "keyword"; ranges; group; enabled; disabledReason; recent }
```

One search result. `ranges` are offsets into the text named by `field`.

**Example**

```tsx
const none: readonly Match[] = createCommands().search('x')
```

---

### `RunContext` `type` — **experimental**

```ts
interface RunContext { id; source: "palette" | "shortcut" | "programmatic"; query; signal; commands }
```

What a command's `run` receives.

**Example**

```tsx
const run = (ctx: RunContext) => ctx.source
```

---

## Package-level notes

> **No typo tolerance in v0:** The matcher finds subsequences. A letter that is missing is fine ("prjct" finds "Project"); a letter that is transposed or wrong is not corrected ("porject" does not).

> **Words match in any order, in one text:** "project new" finds "New Project". All the words must match the same text (the title, or the subtitle, or one keyword), not different ones.

> **A later registration of an id wins:** Two screens that both register "save" do not duplicate it: the later registration answers to the id and its shortcut, and the earlier one is back when the later one is removed (a screen change mounts the new page before it unmounts the old one). Development warns once.

> **Shortcuts follow hotkeys' input rule, with one difference:** A shortcut with Ctrl, Alt or Meta fires while a text field has focus; a bare key (g, /, ?) and Shift alone do not, so typing never runs a command. Hotkeys' own default suppresses every shortcut in an input; commands opt modifier shortcuts in.

> **Nested pages have no shortcuts:** A command inside `children` is reached through its page; its `shortcut` is not registered (development warns). Register a command you want a shortcut for at the top level.

> **Recents are recency only:** The storage holds a list of ids, so the boost is by how recently a command ran, bounded below one word-start bonus: it settles close calls and never overturns a clearly better match. Frequency is not tracked.

> **Narrowing needs the same list:** `createRanker` reuses candidates only for the same array and the same options; the registry resets its rankers when a function title changes. If you keep a ranker over texts that change, call `reset()`.

> **Long input is cut:** A query is cut at 128 characters and 8 words, a text is matched on its first 512 units. Both are far beyond a command title.
