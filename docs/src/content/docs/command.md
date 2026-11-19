---
title: Command
description: A command palette for Pyreon — a fuzzy matcher, a registry of commands with shortcuts, recents and nested pages
---

<PackageBadge name="@pyreon/command" href="/docs/command" />

`@pyreon/command` is the part of a command palette that is the same in every app: finding an action by typing a few letters of it, knowing which actions exist on the current screen, and binding them to keys. The matcher and the registry are plain functions and signals; the palette state and the components are built on them.

> **Experimental.** This page covers the matcher, the registry (shortcuts, recents, nested pages), the palette state, the dialog components, recipes, the router and i18n integrations, and a "coming from" table. Typo tolerance is not part of v0.

## Installation

```bash
bun add @pyreon/command @pyreon/reactivity @pyreon/core
```

`@pyreon/hotkeys` is a dependency of the package (shortcuts are core to a palette), so it installs with it.

| Entry | What |
| --- | --- |
| `@pyreon/command/core` | the matcher: `fuzzyMatch`, `rank`, `createRanker`. Pure, no dependencies. |
| `@pyreon/command` | the core plus the registry (`createCommands`, `useCommands`, `useCommand`, `provideCommands`, `formatShortcut`) and the palette state (`createPalette`). |
| `@pyreon/command/components` | `<CommandPalette>` and its parts. Needs `@pyreon/core`. |
| `@pyreon/command/router` | `routeCommands`: navigation commands from your route table. No dependencies. |
| `@pyreon/command/style.css` | an optional default look. |

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

## The palette state

`createPalette` is a palette with no markup: whether it is open, the query, the stack of nested pages, the rows (grouped and ranked), the active row, and the ARIA wiring. `<CommandPalette>` is a renderer built on it; build your own the same way.

```ts
import { createCommands, createPalette } from '@pyreon/command'

const commands = createCommands()
commands.register([
  { id: 'new', title: 'New Project', run: () => newProject() },
  { id: 'theme', title: 'Change theme…', children: [{ id: 'dark', title: 'Dark', run: () => setTheme('dark') }] },
])

const palette = createPalette({ commands }) // mod+k opens and closes it
palette.open()
palette.setQuery('np')
palette.results()[0]?.title // 'New Project'
palette.results()[0]?.ranges // [[0, 1], [4, 5]]
await palette.runActive() // runs it, then closes
```

| | |
| --- | --- |
| `open(page?)`, `close()`, `toggle()` | Opening an open palette only navigates (`open('theme')` opens at that page). One palette is open at a time: opening a second closes the first. Client only. |
| `query()`, `setQuery(q)` | A new session starts with an empty query on the root page. |
| `page()`, `pageTitle()`, `back()` | The stack of nested pages, as command ids, any depth. `back()` returns `false` at the root and restores the query that was typed above the page. A page whose command is unregistered while it is open drops out of the stack. |
| `results()`, `groups()` | The rows, flat in display order, and the same in their groups. Each row has `id`, `command`, `title`, `subtitle`, `ranges`, `subtitleRanges`, `group`, `enabled`, `disabledReason`, `recent`, `hasPage`, `shortcuts` (as the user reads them) and `index`. |
| `activeId()`, `setActive(id)`, `move(...)` | The first row is active until the user moves; it moves back to the first row when the active command leaves the list. `move(1)`, `move(-1)`, `'first'`, `'last'`, `'nextGroup'`, `'prevGroup'`, wrapping at the ends. |
| `runActive()`, `runItem(row)` | A row with children opens its page. Otherwise the command runs and the palette closes, unless it has `keepOpen`. A disabled row does not run. |
| `status()`, `error()`, `running()` | `'loading'` while an async source or a run is pending, `'error'` after one failed. |
| `announcement()` | What the live region says. |
| `inputProps`, `listProps`, `itemProps(row)`, `groupProps(group)` | Spreadable attributes and handlers; see below. |
| `dispose()` | Removes the hotkey, aborts what is pending and releases everything. In a component it runs on unmount. |

Options:

| Option | Default | |
| --- | --- | --- |
| `commands` | `useCommands()` | The registry to search. |
| `hotkey` | `'mod+k'` | `false` for none. Registered through `@pyreon/hotkeys` with `enableOnInputs`, so it also closes the palette from inside its own input. |
| `placeholder`, `label`, `messages` | English | See "Words". |
| `emptyQuery` | `'recents'` | What an empty query lists at the root. `'recents'`: a Recent group, then the groups in declared order. `'groups'`: the groups only (a recent stays in its group). `'all'`: one flat list in registration order. |
| `showDisabled` | `false` | List disabled commands, with their reason, instead of hiding them. |
| `filter` | | Replace the matching: the commands that pass are listed in registration order, without ranges. |
| `debounce` | `150` | Milliseconds an async source waits after the last keystroke. |
| `pageSize` | `8` | How far PageUp and PageDown move. |
| `restoreFocus` | `true` | Return focus to the element that had it when the palette opened. |
| `onOpenChange` | | Called with `true` and `false`, on changes only. |

### Pages and async sources

`children` as a list is a page. `children` as a function is an **async source**: "Search customers…" opens a page whose rows are whatever the function returns for the query.

```ts
import { createCommands } from '@pyreon/command'

const commands = createCommands()
commands.register({
  id: 'customers',
  title: 'Search customers…',
  children: async (query, signal) => {
    const response = await fetch(`/api/customers?q=${encodeURIComponent(query)}`, { signal })
    const found: { id: string; name: string }[] = await response.json()
    return found.map((c) => ({ id: `customer-${c.id}`, title: c.name, run: () => openCustomer(c.id) }))
  },
})
```

- **Debounced.** The function is called immediately when the page opens (with an empty query), and then once the user has paused for `debounce` ms.
- **Cancellable.** The `AbortSignal` is aborted when a newer query supersedes the request and when the palette closes. Pass it to `fetch`; an aborted request is never reported as an error.
- **The latest answer wins.** Each request takes a ticket, and an answer is used only if its ticket is still the newest: a slow earlier response can never overwrite a newer one, whatever order they arrive in.
- **No flicker.** The previous rows stay on screen while the next request is pending, and are replaced when it answers. `status()` is `'loading'` meanwhile, and the default components show it and the live region says "Loading…".
- **Errors.** A rejected request (or one that throws, or returns something that is not an array) sets `status()` to `'error'` and `error()`; the rows stay, the live region announces `Failed: …`, and the next query tries again.
- The rows are highlighted for the query locally. A row can itself have `children` (a page of its own, three deep and more) and is run like any other command; rows are not registered, so they have no shortcuts.

A synchronous function works too (it answers at once, with no loading state).

**Searching a source from the root.** By default a source is only asked inside its page. Give the command `inline: true` and it is also asked from the root while the user types, so "acme" finds the matching commands and, when the server answers, the customers under a "Customers" heading:

```ts
import { createCommands } from '@pyreon/command'

const commands = createCommands()
commands.register({
  id: 'customers',
  title: 'Customers',
  inline: true,
  children: async (query, signal) => {
    const response = await fetch(`/api/customers?q=${encodeURIComponent(query)}`, { signal })
    const found: { id: string; name: string }[] = await response.json()
    return found.map((c) => ({ id: `customer-${c.id}`, title: c.name, run: () => openCustomer(c.id) }))
  },
})
```

The matching commands are listed at once and **stay on screen while the source loads** (no flicker); the source's rows are appended in a group headed by the command's title, with the same rules as a page: the first request is immediate, the next ones are debounced, the latest answer wins, a superseded request and closing abort the signal, an error is announced and the commands stay, and a row that is already listed is not repeated. Not asked for an empty query. Every inline source is asked on every keystroke (after the debounce), so use it for a few, cheap sources; the others stay in their page.

### Running

`run` receives `{ id, source: 'palette', query, signal, commands }`. While an async `run` is pending the row is marked `data-running`, `status()` is `'loading'`, and a second Enter is ignored. On success the palette closes (unless `keepOpen`); on failure it **stays open** with the error (`status()` is `'error'`, announced, cleared by the next keystroke). Closing the palette while a run is pending aborts `signal`, and nothing the run does afterwards touches the palette. A run that never settles holds the palette until it is closed; the next time it opens it is free.

## `<CommandPalette>`

```tsx
import { CommandPalette } from '@pyreon/command/components'
import '@pyreon/command/style.css'

export function App() {
  return <CommandPalette />
}
```

With no props it searches `useCommands()` and opens on `mod+k`. Give it a `palette` of your own, or the palette options (`commands`, `hotkey`, `placeholder`, `messages`, `emptyQuery`, `showDisabled`, `filter`, `debounce`, `onOpenChange`). It renders nothing while closed, on the server and on the first client render alike, so there is nothing to mismatch when it hydrates.

### What the dialog does

It is a native `<dialog>` shown with `showModal()`, in a portal in `<body>`:

- **Focus** moves to the input when it opens, **Tab and Shift+Tab stay inside** (the input and the two buttons), and focus **returns to the element that had it** when it closes, whether by Escape, by running a command, by the close button or by the hotkey. If that element is gone, focus goes to the page.
- **The page behind is inert**: the browser makes everything outside a modal dialog inert (`inert` semantics: not focusable, not clickable, hidden from assistive technology). A browser without `showModal` gets a fallback: the other children of `<body>` get `inert` and `aria-hidden` while the palette is open, and are restored after.
- **Scroll is locked** without a layout shift: the page scrollbar's width is added as padding on its side (in right-to-left pages too) and everything is restored on close. It is counted, so nested dialogs do not unlock each other.
- **It works inside an open modal.** A modal dialog opened later goes on top and makes the earlier one inert; closing it makes the earlier one live again, and focus goes back into it.
- **Escape goes back one page, then closes.** It is handled on `keydown`, not through the browser's `cancel` event, because a cancelled `cancel` is not honoured a second time in a row without an interaction in between (three pages deep, Escape must walk back three times). A click on the backdrop closes.
- **Direction**: the dialog takes the direction (`dir`) of the element that had focus when it opened (the portal would otherwise lose a direction set on a container), or the `dir` prop.

### Keyboard

| Key | |
| --- | --- |
| Up, Down | Move the active row, wrapping. Focus stays in the input; `aria-activedescendant` names the row. |
| Home, End | First and last row. (They do not move the caret in the input.) |
| PageUp, PageDown | Move by `pageSize` rows. |
| Enter | Run the active row, or open its page. Not while an IME composition is confirmed. |
| Escape | Back one page; at the root, close. |
| Backspace | On an empty query, back one page. |
| Tab, Shift+Tab | Cycle through the input, the back button (in a page) and the close button; they never leave the dialog. |
| the hotkey | Closes it. |

### Accessibility

The input is `role="combobox"` with `aria-expanded`, `aria-controls` (the list), `aria-autocomplete="list"` and `aria-activedescendant` (the active row); the list is `role="listbox"` with `role="group"` groups named by their heading (`aria-labelledby`) and `role="option"` rows with `aria-selected`, `aria-disabled`, `aria-setsize` and `aria-posinset`. The active row is scrolled into view. A polite live region **inside the dialog** (outside it, the modal makes it inert) says "5 results", "No results", "Loading…", `Failed: …`, and, when the active command is disabled, why: "Save, unavailable: Nothing changed". It says nothing for an empty query at the root. A disabled row is listed (with `showDisabled`), can be made active so its reason is heard, and does not run. The default dialog is checked with `axe-core` in a real browser, open, in a page, with a disabled row and with no results.

### Long lists

Beyond 300 rows (`virtualizeAfter`) only the rows in view are in the DOM, with a few around them: every row, group headings included, has one height (`rowHeight`, 40 px), so the window is arithmetic. Rows keep `aria-setsize` and `aria-posinset` ("7 of 5,000"); headings become `role="presentation"` there, because a group element cannot wrap rows that are not all in the DOM. Keyboard movement scrolls the active row into the window first.

### Parts

For a layout of your own, give `<CommandPalette>` children and build from the parts; each reads the palette through `usePalette()`.

```tsx
import { CommandEmpty, CommandInput, CommandList, CommandPalette, CommandLoading } from '@pyreon/command/components'

export function MyPalette() {
  return (
    <CommandPalette placeholder="Search…">
      <CommandInput class="my-input" />
      <CommandList class="my-list" />
      <CommandEmpty>Nothing matches.</CommandEmpty>
      <CommandLoading />
    </CommandPalette>
  )
}
```

`CommandGroup`, `CommandItem` (with `Highlight` for the matched runs and `CommandShortcut`) are the pieces of the list; `CommandItem` takes children to replace the row content. With `createPalette` alone you can spread `palette.inputProps` on your own `<input>`, `palette.listProps` on your list, `palette.itemProps(row)` on a row and `palette.groupProps(group)` on a group, which carries the same ARIA wiring.

### Words

Everything the palette says can be replaced, for a translation:

```tsx
import { CommandPalette } from '@pyreon/command/components'

export const Czech = () => (
  <CommandPalette
    messages={{
      label: 'Příkazy',
      placeholder: 'Zadejte příkaz…',
      results: (n) => (n === 1 ? '1 výsledek' : n < 5 ? `${n} výsledky` : `${n} výsledků`),
      noResults: 'Nic nenalezeno',
      loading: 'Načítání…',
      recent: 'Naposledy použité',
      back: 'Zpět',
      close: 'Zavřít',
    }}
  />
)
```

### Styling

`@pyreon/command/style.css` is a small default look (system colours, logical properties so it mirrors in right-to-left text, larger targets on touch, an opening animation only when the user has not asked for reduced motion). Or style the classes: `pcmd` (the dialog), `pcmd-panel`, `pcmd-header`, `pcmd-input`, `pcmd-btn` (`pcmd-back`, `pcmd-close`), `pcmd-list`, `pcmd-group`, `pcmd-heading`, `pcmd-item`, `pcmd-title`, `pcmd-subtitle`, `pcmd-reason`, `pcmd-mark`, `pcmd-kbd`, `pcmd-empty`, `pcmd-loading`. State is on data attributes: `data-active`, `data-disabled`, `data-recent`, `data-page`, `data-running`. Colours and sizes are custom properties on `.pcmd` (`--pcmd-bg`, `--pcmd-fg`, `--pcmd-active-bg`, `--pcmd-width`, ...).

## Recipes

### App-wide actions

Actions that exist on every screen belong to one place near the root. `useCommand` in the root component registers them for as long as the app lives:

```tsx
import { useCommand } from '@pyreon/command'
import { CommandPalette } from '@pyreon/command/components'
import '@pyreon/command/style.css'

export function App(props: { children?: unknown }) {
  useCommand([
    { id: 'toggle-theme', title: 'Toggle dark mode', shortcut: 'mod+shift+l', keywords: ['theme', 'light'], run: () => toggleTheme() },
    { id: 'sign-out', title: 'Sign out', keywords: ['logout'], run: () => signOut() },
  ])

  return (
    <>
      {props.children}
      <CommandPalette />
    </>
  )
}
```

(`useCommand` takes one command or a function; for a list call `useCommands().register(list)`, which is removed on unmount in the same way.)

### Commands that come and go with the screen

Register a screen's commands in the screen. When the user leaves, they go, with their shortcuts; the palette never offers an action that cannot run:

```tsx
import { useCommand } from '@pyreon/command'

export function InvoicePage(props: { invoice: { id: string; paid: boolean } }) {
  useCommand(() => ({
    id: 'invoice.markPaid',
    title: 'Mark invoice as paid',
    group: 'invoice',
    shortcut: 'mod+shift+p',
    enabled: !props.invoice.paid,
    disabledReason: 'Already paid',
    run: () => markPaid(props.invoice.id),
  }))

  return <h1>Invoice {props.invoice.id}</h1>
}
```

Because the function reads `props.invoice.paid`, the command is hidden (or shown with its reason, with `showDisabled`) the moment the invoice is paid, and its shortcut is released. Declare the group once where the registry is made: `createCommands({ groups: [{ id: 'invoice', title: 'Invoice' }] })`, or from the screen: `useCommands().registerGroup({ id: 'invoice', title: 'Invoice' })`.

### A nested page: "Change theme…"

```tsx
import { createCommands } from '@pyreon/command'

const commands = createCommands()

commands.register({
  id: 'theme',
  title: 'Change theme…',
  keywords: ['appearance', 'colour'],
  children: [
    { id: 'theme.light', title: 'Light', run: () => setTheme('light') },
    { id: 'theme.dark', title: 'Dark', run: () => setTheme('dark') },
    { id: 'theme.system', title: 'Match the system', run: () => setTheme('system') },
  ],
})
```

Enter on "Change theme…" opens the page with an empty query; Escape or Backspace on an empty query goes back and restores what was typed. `palette.open('theme')` opens straight at the page, for a "Theme" button: `<button onClick={() => palette.open('theme')}>Theme</button>`.

### Searching a server: "Search customers…"

Shown under "Async sources" above. The one thing to remember is `signal`: pass it to `fetch` so a superseded query is cancelled on the wire, and not only ignored.

### Showing the shortcuts

A palette row shows its shortcuts (`item.shortcuts`, already formatted for the platform). For a "Keyboard shortcuts" page, list the registry:

```tsx
import { shortcutKeys, useCommands } from '@pyreon/command'

export function ShortcutsHelp() {
  const commands = useCommands()

  return (
    <dl>
      {() =>
        commands
          .commands()
          .filter((c) => c.shortcut !== undefined)
          .map((c) => (
            <>
              <dt>{typeof c.title === 'function' ? c.title() : c.title}</dt>
              <dd>
                {shortcutKeys(typeof c.shortcut === 'string' ? c.shortcut : (c.shortcut?.[0] ?? '')).map((press) => (
                  <kbd>{press.join(' + ')}</kbd>
                ))}
              </dd>
            </>
          ))
      }
    </dl>
  )
}
```

`formatShortcut` / `shortcutKeys` read the platform, so render them on the client (inside a reactive accessor, or after mount), not into server-rendered markup: "⌘" and "Ctrl" differ between the server's guess and the user's machine.

### Recents that survive a reload

```ts
import { createCommands } from '@pyreon/command'

export const commands = createCommands({
  recents: {
    max: 6,
    storage: {
      get: () => JSON.parse(localStorage.getItem('command-recents') ?? 'null') as string[] | null,
      set: (ids) => localStorage.setItem('command-recents', JSON.stringify(ids)),
    },
  },
})
```

The storage is read once when the registry is made and written after each successful run. Ids of commands that are not registered right now stay in the list (the screen may come back) and are simply not shown. With `emptyQuery: 'recents'` (the default) they open the palette.

### A palette from a button, and a custom layout

```tsx
import { createPalette } from '@pyreon/command'
import { CommandInput, CommandList, CommandPalette } from '@pyreon/command/components'

export function Header() {
  const palette = createPalette({ hotkey: 'mod+k', placeholder: 'Search or jump to…' })

  return (
    <header>
      <button type="button" onClick={() => palette.open()}>
        Search <kbd>⌘K</kbd>
      </button>
      <CommandPalette palette={palette}>
        <CommandInput />
        <CommandList />
      </CommandPalette>
    </header>
  )
}
```

`createPalette` inside a component is disposed with it. A button that opens the palette needs no special wiring: focus returns to it when the palette closes.

### Testing

The palette is state, so most of it needs no browser:

```ts
import { createCommands, createPalette } from '@pyreon/command'

const commands = createCommands()
commands.register({ id: 'save', title: 'Save', run: () => {} })

const palette = createPalette({ commands, hotkey: false })
palette.open()
palette.setQuery('sav')
palette.results().map((row) => row.id) // ['save']
palette.announcement() // '1 result'
```

Use `hotkey: false` in tests so no key listener is installed, and `dispose()` the palette (and the registry) in `afterEach`. Anything that depends on layout, focus or the top layer (the dialog) needs a real browser.

## Integrations

### Router

`@pyreon/command/router` makes navigation commands from the routes you gave `createRouter`. The router does not expose its route table, so the helper takes the same array:

```tsx
import { createCommands } from '@pyreon/command'
import { routeCommands } from '@pyreon/command/router'
import { createRouter } from '@pyreon/router'

const routes = [
  { path: '/', component: Home, name: 'home' },
  { path: '/settings', component: Settings, meta: { title: 'Settings' }, children: [{ path: 'profile', component: Profile }] },
  { path: '/users/:id', component: User },
]
const router = createRouter({ routes })

export const commands = createCommands({ groups: [{ id: 'go', title: 'Go to' }] })
commands.register(routeCommands(routes, { navigate: (path) => router.push(path), group: 'go' }))
```

It makes a command for every route that can be reached without more information: `/users/:id`, wildcards and redirects are left out, and a child's path is joined to its parent's (`/settings/profile`). The title is `meta.title`, else the route name or last segment made readable ("Billing details"), "Home" for `/`; the path is a keyword, so typing `/settings` works. `filter` leaves a route out (an admin area), `title` replaces the title (return a function to follow the locale), `keywords` adds match terms and `id` changes the command id. For a route with a parameter, write the command yourself: it is a function of data the palette does not have.

### i18n

A title (and `subtitle`, and `disabledReason`) can be a function, which is all `@pyreon/i18n` needs:

```tsx
import { createI18n } from '@pyreon/i18n'
import { createCommands } from '@pyreon/command'

const i18n = createI18n({
  locale: 'en',
  messages: {
    en: { save: 'Save document' },
    cs: { save: 'Uložit dokument' },
  },
})

export const commands = createCommands()
commands.register({ id: 'save', title: () => i18n.t('save'), run: () => save() })

i18n.locale.set('cs')
commands.search('ulozit')[0]?.title // 'Uložit dokument'
```

Switching the locale re-ranks and re-renders an open palette: the same query finds the other title, the highlights move, the page title changes, and the palette stays open. (A test in the package does exactly this with three locales.) Matching ignores accents, so "ulozit" finds "Uložit". Translate the palette's own words with `messages` (see "Words"). Keep `keywords` in the languages people type.

## Notes

- **A palette is a front door, not a permission check.** `enabled` hides a command; it does not stop the code behind it. Check on the server.
- **Do not put secrets in titles or subtitles.** The list is on screen and in the live region.
- **Dangerous commands** (delete, sign out everywhere) are better as a page with a confirmation row ("Delete project…" opens "Really delete?") than as a single Enter.
- **Keep ids stable.** Recents and shadowing are by id; `route:/settings` today should be `route:/settings` next year.

## Coming from

The names differ; the ideas map.

| | cmdk | kbar | ninja-keys | `@pyreon/command` |
| --- | --- | --- | --- | --- |
| What a command is | JSX (`<Command.Item>`) | an action object | an item in a `data` array | an object: `{ id, title, ... }` |
| Where commands live | in the tree you render | `KBarProvider actions` or `useRegisterActions` | the `data` property of the element | a registry; `useCommand` registers for a component's life |
| Per-screen commands | render the items on that screen | `useRegisterActions(actions, deps)` | set `data` again | `useCommand` (removed on unmount) |
| Keyboard shortcut of a command | not included | `shortcut` (a sequence of keys) | `hotkey` | `shortcut`, registered through `@pyreon/hotkeys` |
| Nested pages | state of your own, `pages` | `parent` ids | `children` and `parent` | `children` (a list) |
| Async results | `shouldFilter={false}` and your own state | `useRegisterActions` with fetched actions | set `data` | `children` as a function: debounced, aborted, latest wins |
| Matching | built in (a scoring filter) | built in (a fuzzy library) | built in (a fuzzy library) | `fuzzyMatch`: accents, kana, words in any order, ranges for highlighting; `filter` replaces it |
| Grouping | `<Command.Group heading>` | `section` | `section` | `group` (declared once, in order) |
| Recents | yours | yours | yours | built in, bounded, persistable |
| Dialog | `<Command.Dialog>` (a dialog library) | portal and animator parts | the element itself | a native modal `<dialog>` |
| Styling | unstyled, data attributes | unstyled | CSS variables | unstyled parts, `pcmd-*` classes, data attributes, an optional stylesheet |
| Framework | React | React | any (a web component) | Pyreon (the registry and matcher are plain functions) |

If you used cmdk: a `<Command.Item onSelect>` becomes a registered `{ run }`, and `value` is the title plus `keywords`. If you used kbar: `name` is `title`, `section` is `group`, `perform` is `run`, `parent` becomes `children` on the parent, and a sequence like `['g', 'h']` is the hotkeys syntax `'g h'`. If you used ninja-keys: `hotkey` is `shortcut` (`'cmd+k'` is `'mod+k'`), `handler` is `run`, `section` is `group`, `mdIcon`/`icon` is `icon`.

## Server rendering

On the server the registry is inert: `register` registers nothing, `commands()` and `search()` are empty and nothing is kept between requests. A component that calls `useCommand` renders as usual. A palette is inert too: `open()` does nothing, there are no rows, and `<CommandPalette>` renders only the empty markers of a reactive child. (The registry is module state shared by every request on a server, which is why it must keep nothing.)

## Cleanup

Unregistering, `dispose()` and unmounting a component remove the command's hotkey, its title and `enabled` computations and its shortcut effect. A test registers and unregisters a thousand commands with shortcuts and function titles and checks that the hotkey registry is empty, the `keydown` listeners are balanced, and that changing a signal the removed command read no longer runs it.

## Notes

- **Performance.** One cold query over 5,000 commands took about 7 ms on a development machine under load (the test prints it). The test bounds it at 250 ms so it fails only on a real regression; it is a guard, not a speed claim.
- **No typo tolerance.** "prjct" finds "Project" (a letter missing is fine); "porject" (transposed) does not.
