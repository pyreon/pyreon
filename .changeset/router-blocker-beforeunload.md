---
'@pyreon/router': patch
---

`useBlocker` no longer shows the browser's "Leave site?" prompt on every tab close while any blocker is mounted. The `beforeunload` handler now asks each blocker (synchronously, with the current route as `to` and `from`) and prompts only when one blocks; a blocker that returns a Promise still counts as blocking. New `useBlocker(fn, { beforeUnload })` option: `true` / `false`, or a function such as `() => form.isDirty()`. Removing a blocker twice no longer unregisters another blocker's tab-close prompt.
