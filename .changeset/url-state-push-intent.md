---
'@pyreon/url-state': minor
---

`replace: false` now produces a history entry through a router, and a malformed URL no longer crashes setup

**`{ replace: false }` was a silent no-op in router-wired apps.** It asks for a
history ENTRY, so the user can press Back to undo a filter change — and the raw
history branch honoured it from the start. The router branch called
`router.replace()` for both intents, so every such update was downgraded with no
error anywhere. `UrlRouter` gains an optional `push(path)`, used when the caller
asked to push; `@pyreon/router` already has one, so `setUrlRouter(useRouter())`
is fixed with no change at the call site. A router without `push` still works —
it falls back to `replace` and dev-warns once, rather than pretending.

**A URL is untrusted input.** The inferred object serializer is `JSON.parse` and
the first read happens at component SETUP, so `?filters={oops` — hand-edited,
truncated by a chat client, shared from an older build — threw and took the page
down. A value the deserializer cannot read now falls back to the default and
dev-warns naming the param, matching what the number serializer already did for
`?page=abc`. The guard sits at the untrusted-input boundary rather than inside
one inferred serializer, so a custom `deserialize` is covered too.
