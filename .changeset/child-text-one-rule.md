---
'@pyreon/core': patch
'@pyreon/runtime-dom': patch
'@pyreon/runtime-server': patch
---

A child value now renders the same text on every path: the `h()` mount, compiled JSX, `renderToString`, `renderToStream` and hydration. An array of strings renders its items concatenated (`['a', 'b']` is `ab`; compiled text bindings used to render `a,b`). `true` renders nothing, as documented and as the compiler already did for a literal `{true}` (the server and the runtime used to render the word "true"). `false` at a mixed-content position no longer renders "false". A bigint or a `Date` renders its text on the server instead of throwing. Behaviour change: a child that is exactly `true` used to show "true" outside compiled literals and now shows nothing.
