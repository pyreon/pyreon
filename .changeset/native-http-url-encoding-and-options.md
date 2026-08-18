---
'@pyreon/native-compiler': minor
---

Fix two silent defects in PMTC's `@pyreon/http` endpoint lowering.

**The same source file no longer produces different URLs per platform.** The
native path substituted `:params` and assembled query pairs raw, while the web
runtime encodes both — so `getUser({ params: { id: 'a b' } })` requested
`/users/a%20b` on the web and `/users/a b` on iOS/Android, with no diagnostic. A
literal containing `#` truncated the URL at the fragment, and `?` / `&` injected
query structure into a path segment. Because the native path only ever
substitutes LITERALS, encoding now happens at COMPILE time and costs nothing at
runtime: the emitted URL is a fully-encoded constant.

The encoders are the web's own primitives rather than a re-implementation —
`encodeURIComponent` for a path segment, a real `URLSearchParams` for the query
— so the two positions stay correctly DIFFERENT (a space is `%20` in a path and
`+` in a query) and equality holds by construction. A differential test asserts
the baked URL is byte-identical to what `@pyreon/http`'s own `buildUrl` returns,
across space / `#` / `?` / `&` / `+` / `/` / non-ASCII / `$'`. Path substitution
also moved to a function replacement: `String.replace` interprets `$&` / `` $` ``
/ `$'` / `$$` in a string replacement, so `id: "$'"` previously emitted
`/users/` with the id gone entirely.

**Options are lowered or named, never dropped.** `resolveEndpointParts` read
only `params` and `query`, so `createUser({ json: {…} })` emitted a POST with no
body and no warning. A literal `json` now lowers to the request body plus a
`content-type: application/json` the caller can override, and `headers` lower
from both the call and the endpoint declaration (a per-call object replaces the
declared one, matching the web). `signal` / `timeout` / `meta`, a non-literal
body or header, an unreadable spread, and unhonourable declaration options
(`timeout`, `throwHttpErrors: false`) each warn by name. Both lower onto fields
the fetch/query IR already carried, so there is no emit, IR or stub change.
