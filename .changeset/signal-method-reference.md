---
'@pyreon/compiler': patch
'@pyreon/reactivity': patch
---

A signal's own method passed by reference in JSX (`ref={panel.set}`, `onClick={panel.set}`) is no longer rewritten to `panel().set` (the value's `set` field, `undefined`): the compiler binds it to its signal instead, in both backends (see the bind entry). A signal method called detached, from outside the compiled code, now fails in dev with `[Pyreon] signal.set() was called without its signal` instead of `Cannot read properties of undefined (reading '_v')`.
