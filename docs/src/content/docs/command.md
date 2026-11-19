---
title: Command
description: A command palette for Pyreon — a fuzzy matcher, a registry of commands with shortcuts, recents and nested pages
---

<PackageBadge name="@pyreon/command" href="/docs/command" />

`@pyreon/command` is the part of a command palette that is the same in every app: finding an action by typing a few letters of it, knowing which actions exist on the current screen, and binding them to keys. The matcher and the registry are plain functions and signals; the palette state and the components are built on them.

> **Experimental.** This page covers the matcher and the registry with shortcuts, recents and nested pages. The palette state, the components and the recipes follow. Typo tolerance is not part of v0.

## Installation

```bash
bun add @pyreon/command @pyreon/reactivity @pyreon/core
```

`@pyreon/hotkeys` is a dependency of the package (shortcuts are core to a palette), so it installs with it.

| Entry | What |
| --- | --- |
| `@pyreon/command/core` | the matcher: `fuzzyMatch`, `rank`, `createRanker`. Pure, no dependencies. |
| `@pyreon/command` | the core plus the registry: `createCommands`, `useCommands`, `useCommand`, `provideCommands`, `formatShortcut`. |

## The matcher

```ts
import { fuzzyMatch } from '@pyreon/command/core'

fuzzyMatch('np', 'New Project')?.ranges // [[0, 1], [4, 5]]: highlight N and P
fuzzyMatch('resume', 'Résumé') // a match: case and accents do not matter
fuzzyMatch('xyz', 'New Project') // null
```

`fuzzyMatch(query, text)` returns `{ score, ranges }` or `null`. A query matches when its characters occur in the text in order (a subsequence). Among the alignments that work, the best-scoring one wins: a character at the start of a word, at a camelCase hump, right after the previous match, or at the very start of the text scores higher, and a gap costs a little. That is why `np` finds *N*ew *P*roject (both letters start a word) and why `tb` finds `toggleBold` before `tabulate`.

- **Case and diacritics do not matter.** "resume" finds "Résumé", "prehled" finds "Přehled", "strasse" finds "Straße" and "grosse" finds "Größe". A decomposed text (an `e` followed by a combining accent) is the same as the precomposed one.
- **Japanese kana are folded**: katakana and hiragana are the same (`ゆーざー` finds `ユーザー`), half-width katakana too. A voiced kana is a different letter from its unvoiced one: `か` does not find `ガ`.
- **Compatibility forms are matched by their parts.** "fi" finds the ligature in "oﬁce", "iv" finds the roman numeral Ⅳ, and a Korean query that is still being composed keeps matching: "하" finds "한국어" (한 is its 한 jamo), so results do not vanish in the middle of typing a syllable.
- **Words match in any order.** `project new` finds "New Project". All the words must match the same text.
- **Ranges are UTF-16 offsets** into the text, sorted and merged, so `text.slice(start, end)` highlights correctly. An emoji, a flag, a skin-toned emoji and a letter with its combining marks are one unit: a range never ends in the middle of one.
- **An empty query matches everything** with score 0 and no ranges.

```tsx
import { fuzzyMatch } from '@pyreon/command/core'

export function Highlight(props: { text: string; query: string }) {
  const parts = () => {
    const ranges = fuzzyMatch(props.query, props.text)?.ranges ?? []
    const out: { text: string; hit: boolean }[] = []
    let at = 0
    for (const [start, end] of ranges) {
      if (start > at) out.push({ text: props.text.slice(at, start), hit: false })
      out.push({ text: props.text.slice(start, end), hit: true })
      at = end
    }
    if (at < props.text.length) out.push({ text: props.text.slice(at), hit: false })
    return out
  }
  return <span>{() => parts().map((p) => (p.hit ? <mark>{p.text}</mark> : p.text))}</span>
}
```

### Ranking a list

```ts
import { rank } from '@pyreon/command/core'

const commands = [{ title: 'Remove', keywords: ['delete'] }, { title: 'Delete forever', keywords: [] }]
rank('delete', commands, (c) => [c.title, ...c.keywords]).map((r) => r.item.title)
// ['Delete forever', 'Remove']: a keyword match ranks below a title match of the same shape
```

`rank(query, items, getText)` returns the matches, best first, with `index`, `score`, `field` (which of the texts matched) and `ranges` (inside that text). `getText` returns one text or several; a text after the first is weighted by 0.6. Equal scores keep the order of `items`, so the result is deterministic. Options: `limit`, `boost(item, index)` (added to the score), `priority(item, index)` (breaks ties, higher first), `anyOrder: false` (the query is one phrase).

### Searching the same list again and again

A palette ranks the same list on every keystroke. `createRanker` keeps what is worth keeping:

```ts
import { createRanker } from '@pyreon/command/core'

const ranker = createRanker<string>((text) => text)
const items = ['Open File', 'Close File', 'Save File']
ranker.rank('o', items)
ranker.rank('op', items) // looks only at the items that matched 'o'
ranker.lastScanned // 2
```

It caches the split and folded texts (bounded by `cacheSize`, default 20000: the cache is cleared when full) and narrows: a query that extends the previous one, on the same array and with the same options, can only match what the previous one matched, so only those are looked at. The answer is exactly the one a fresh `rank` gives (a test compares them over random typing sessions). If the texts of the items change while the array stays the same, call `ranker.reset()`.

### Limits

A query is cut at 128 characters and 8 words; a text is matched on its first 512 units. These are constants (`MAX_QUERY_UNITS`, `MAX_QUERY_WORDS`, `MAX_TEXT_UNITS`) far beyond a command title; they keep the worst case bounded.

## The registry

```ts
import { createCommands } from '@pyreon/command'

const commands = createCommands({
  groups: [
    { id: 'file', title: 'File' },
    { id: 'view', title: 'View' },
  ],
  recents: { max: 5 },
})

const off = commands.register([
  { id: 'new', title: 'New File', group: 'file', shortcut: 'mod+n', run: () => newFile() },
  { id: 'zoom', title: 'Zoom In', group: 'view', keywords: ['bigger'], run: () => zoom(1) },
])

commands.search('big').map((m) => m.id) // ['zoom']
off() // removes both, and their shortcuts
```

`register` takes a command, a list, or a function that returns one, and returns the unregister. `search(query)` is synchronous and reactive: read it in a `computed` or a JSX accessor and it updates when a command is added, removed, enabled or renamed. Each result is a `Match`:

```ts
interface Match {
  command: Command
  id: string
  title: string // the resolved title
  score: number
  field: 'title' | 'subtitle' | 'keyword' // which text matched; `ranges` are offsets into it
  ranges: readonly [number, number][]
  group: string | undefined
  enabled: boolean
  disabledReason: string | undefined
  recent: boolean
}
```

Disabled commands are left out unless you pass `{ includeDisabled: true }` (they come back flagged, with their reason). An empty query lists everything enabled: recents first, then ungrouped commands, then the groups in the order they were declared, each in registration order.

```ts
import { createCommands } from '@pyreon/command'

const commands = createCommands()
await commands.run('new').catch((error: Error) => error.message)
// '[Pyreon] commands.run: no command with the id "new" is registered. It may belong to a screen that is not mounted.'
```

`run(id)` runs a command programmatically and rejects when the id is unknown, the command is disabled (the message carries `disabledReason`), or `run` throws. `run` receives a context: `{ id, source, query, signal, commands }`.

### Commands that follow the screen

`useCommand` registers a command for the lifetime of the component. When the screen goes, so do its commands and their shortcuts, so the list always matches what the user can do right now:

```tsx
import { useCommand } from '@pyreon/command'

export function Editor(props: { onSave: () => void }) {
  useCommand({ id: 'save', title: 'Save', shortcut: 'mod+s', run: () => props.onSave() })
  return <textarea />
}
```

`register` does the same when it is called while a component is being set up, so `useCommands().register(...)` inside a component is also removed on unmount. A function registration reads signals:

```tsx
import { signal } from '@pyreon/reactivity'
import { useCommand } from '@pyreon/command'

export function Toolbar() {
  const dirty = signal(false)
  useCommand(() => ({
    id: 'save',
    title: dirty() ? 'Save changes' : 'Save',
    enabled: dirty(),
    disabledReason: 'Nothing to save',
    shortcut: 'mod+s',
  }))
  return <button type="button" onClick={() => dirty.set(true)}>Edit</button>
}
```

The title and the enabled state update in place. The shortcut is re-registered only when it changed: a new title does not touch the hotkey registry.

By default `useCommand` and `useCommands()` use one app-wide registry. To have your own (a palette for a part of the app), `createCommands()` and `provideCommands(commands)` in a component make it the registry of everything below:

```tsx
import { createCommands, provideCommands, useCommand } from '@pyreon/command'

function Inspector() {
  useCommand({ id: 'inspect', title: 'Inspect element' })
  return <div />
}

export function DevTools() {
  provideCommands(createCommands())
  return <Inspector />
}
```

### The same id twice

Two screens that both register `save` do not duplicate it. The later registration answers to the id (and its shortcut) until it is removed, and the earlier one is back after. This is what a route change needs: the new screen mounts before the old one unmounts, and removing the old one must not take the new one's command with it. Development warns once, naming the id.

### Titles that follow the locale

A title (also `subtitle` and `disabledReason`) can be a function. It is read lazily, once per change, and the registry re-ranks when it changes:

```ts
import { signal } from '@pyreon/reactivity'
import { createCommands } from '@pyreon/command'

const locale = signal<'en' | 'cs'>('en')
const commands = createCommands()
commands.register({ id: 'open', title: () => (locale() === 'en' ? 'Open file' : 'Otevřít soubor') })

commands.search('otevrit').length // 0
locale.set('cs')
commands.search('otevrit').length // 1
```

### Nested pages

A command with `children` (a list) is a page: "Change theme…" opens a list of themes. `commands.search(query, { parent: 'theme' })` searches that page. The children are not searched from the root.

```ts
import { createCommands } from '@pyreon/command'

const commands = createCommands()
commands.register({
  id: 'theme',
  title: 'Change theme…',
  children: [
    { id: 'light', title: 'Light', run: () => setTheme('light') },
    { id: 'dark', title: 'Dark', run: () => setTheme('dark') },
  ],
})
commands.search('', { parent: 'theme' }).map((m) => m.id) // ['light', 'dark']
```

A child's `shortcut` is not registered (development warns): register the command at the top level if it needs a key.

## Shortcuts

A command's `shortcut` (a string, or a list of them) uses the `@pyreon/hotkeys` syntax: `mod+k` is Cmd on macOS and Ctrl elsewhere, `g d` is a sequence. It is registered through `@pyreon/hotkeys` and never through a second key listener:

- **once** while the command is registered **and enabled** (a command whose `enabled` turns false gives its shortcut up, and gets it back);
- **moved** only when the shortcut changed;
- **removed** with the command, with its component, or on `dispose()`;
- **run** with `source: 'shortcut'`; an error from the command goes to `onError(error, command)` (default: a `[Pyreon]` message on the console in development), never to an unhandled rejection.

**Typing never runs a command.** `@pyreon/hotkeys` suppresses every shortcut while a text field has focus. A command shortcut that includes Ctrl, Alt or Meta (`mod+s`) is allowed there, because no typed character produces it; a bare key (`g`, `/`) or Shift alone is not. `hasCommandModifier(shortcut)` is the rule.

**Conflicts.** Two commands on one shortcut in one scope would both run. In development the second registration warns, naming both, and a collision with a plain `useHotkey` names that:

```text
[Pyreon] commands: "save" and "export" share the shortcut "ctrl+s" in scope "global", so both run when it is pressed. Give one of them another shortcut or disable it.
```

**Showing a shortcut.** `formatShortcut('mod+k')` is `⌘+K` on macOS and `Ctrl+K` elsewhere (it is `@pyreon/hotkeys` `formatCombo`); `shortcutKeys('mod+shift+k')` is the keys as a list, to render keycaps. Do not render either on the server: the platform is only known in the browser.

## Recents

```ts
import { createCommands } from '@pyreon/command'

const commands = createCommands({
  recents: {
    max: 5,
    storage: {
      get: () => JSON.parse(localStorage.getItem('recent-commands') ?? 'null'),
      set: (ids) => localStorage.setItem('recent-commands', JSON.stringify(ids)),
    },
  },
})
```

A command that ran successfully (from a shortcut, the palette or `run`) moves to the front of `recents()`; the list is unique and capped at `max` (default 8). An empty query lists recents first. For a typed query the recent gets a boost that shrinks down the list and is at most 10 points, less than one word-start bonus: it settles close calls and never overturns a clearly better match. The storage is any `{ get, set }`; a storage that throws is reported in development and the recents stay in memory. Only recency is kept (the storage holds ids, not counts): frequency is not tracked.

## Server rendering

On the server the registry is inert: `register` registers nothing, `commands()` and `search()` are empty and nothing is kept between requests. A component that calls `useCommand` renders as usual. (The registry is module state shared by every request on a server, which is why it must keep nothing.)

## Cleanup

Unregistering, `dispose()` and unmounting a component remove the command's hotkey, its title and `enabled` computations and its shortcut effect. A test registers and unregisters a thousand commands with shortcuts and function titles and checks that the hotkey registry is empty, the `keydown` listeners are balanced, and that changing a signal the removed command read no longer runs it.

## Notes

- **Performance.** One cold query over 5,000 commands took about 7 ms on a development machine under load (the test prints it). The test bounds it at 250 ms so it fails only on a real regression; it is a guard, not a speed claim.
- **No typo tolerance.** "prjct" finds "Project" (a letter missing is fine); "porject" (transposed) does not.
