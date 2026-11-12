---
'@pyreon/compiler': patch
'@pyreon/reactivity': patch
---

A signal's own method passed by reference in JSX (`ref={panel.set}`, `onClick={panel.set}`) is no longer rewritten to `panel().set` (the value's `set` field, `undefined`). The compiler leaves it as written and warns `signal-method-reference` with the arrow that works (`ref={(el) => panel.set(el)}`), in both backends. Signal methods read `this`, so calling one detached now fails in dev with `[Pyreon] signal.set() was called without its signal` instead of `Cannot read properties of undefined (reading '_v')`.
