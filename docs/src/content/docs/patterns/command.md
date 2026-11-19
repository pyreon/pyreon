---
title: "Command palette"
summary: "Register a command where its screen lives, find it with the matcher, bind its shortcut through the command, and let the palette own the dialog. Never add a keydown listener per command or keep a hand-written list of what is on screen."
seeAlso: [event-listeners]
---

## The pattern

Commands are data with an id and a title. A screen registers the commands it can run for as long as it is mounted; the app mounts one `<CommandPalette>`. A shortcut is a field of the command, so it is registered through `@pyreon/hotkeys` once, while the command is registered and enabled.

```tsx
import { useCommand } from '@pyreon/command'
import { CommandPalette } from '@pyreon/command/components'

function Editor() {
  useCommand({ id: 'save', title: 'Save', shortcut: 'mod+s', run: () => save() })
  return <textarea />
}

export const App = () => (
  <>
    <Editor />
    <CommandPalette />
  </>
)
```

## Why

A list of commands that someone keeps in sync with the screens goes stale: it offers "Mark paid" on a page that has no invoice. Registering with the screen makes the list true by construction, and unregistering with it releases the shortcut. The palette is a native modal `<dialog>`, so the page behind is inert, focus is kept in and comes back, and Escape works the way a keyboard user expects; the matcher ignores accents and case, finds "np" in "New Project", and says which characters matched so you can highlight them. Async sources abort the request a newer query supersedes and ignore a late answer, so results never go back in time.

## Anti-pattern

```tsx
// BROKEN: one global listener per command, a hand-kept list, a dialog built from a div
import { useEffect } from 'react'

const commands = [{ title: 'Save', run: save }, { title: 'Mark paid', run: markPaid }] // offered on every screen

window.addEventListener('keydown', (e) => {
  if (e.key === 's' && e.metaKey) save() // fires while typing in an input, on Windows too, twice if the module loads twice
})
```

```tsx
// Correct: the command lives with its screen, and the shortcut is part of it
import { useCommand } from '@pyreon/command'

function InvoicePage(props: { paid: boolean }) {
  useCommand(() => ({ id: 'markPaid', title: 'Mark as paid', enabled: !props.paid, shortcut: 'mod+shift+p', run: () => markPaid() }))
  return <h1>Invoice</h1>
}
```

Also: reading a title once (`title: i18n.t('save')` pins the locale: pass a function so a locale change re-ranks), calling `useHotkey` for a command's shortcut as well as giving the command a `shortcut` (two registrations, and a conflict warning), and treating `enabled: false` as access control (the code behind the command still runs when called: check on the server).

## Related

- `@pyreon/command` for the functions, and its docs page for the registry, the palette state, async sources, the recipes and the accessibility notes.
- `@pyreon/hotkeys` for the shortcut syntax, scopes and the input rule that a command's shortcut follows.
- Anti-pattern: "A global keydown listener per command, a hand-kept list of commands, a palette built from a div".
