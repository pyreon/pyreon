---
'@pyreon/hotkeys': patch
---

`useHotkey('mod+s', (e) => { e.preventDefault(); … })` now lowers to a native keyboard shortcut on iOS and Android instead of dropping the hotkey. A handler whose only use of the `KeyboardEvent` is `e.preventDefault()` / `e.stopPropagation()` has those statements removed, since a native key binding has no browser default to suppress. A handler that reads the event (`e.key`, `e.shiftKey`, passing `e` on) is still refused by name.
