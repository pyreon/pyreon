---
"@pyreon/zero": patch
---

fix(zero/theme): make `resolvedTheme()` reactive to OS color-scheme changes

`resolvedTheme()` read `window.matchMedia('(prefers-color-scheme: dark)').matches`
as a one-shot check — no signal tracked the OS preference. Components
reading `resolvedTheme()` subscribed only to the `theme` signal (explicit
user choice). When the user flipped dark mode at the OS level, the
`<html data-theme>` attribute updated (via the `onChange` handler in
`initTheme`), but every component using `resolvedTheme()` stayed on
stale state — inverse theme effectively not reactive.

Fix: introduced an `_osPrefersDark` signal that `initTheme` seeds from
`matchMedia.matches` and updates on every `'change'` event. When
`theme === 'system'`, `resolvedTheme()` reads `_osPrefersDark()` —
subscribing components to both the user preference AND the OS
preference. Changing either now re-renders the whole tree.
