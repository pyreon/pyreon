---
'@pyreon/lathe': minor
---

Lathe's HTTP client is now selectable: `client: 'pyreon' | 'fetch' | 'axios' | 'ky'`.

Only `client.ts` changes. Every other generated file — endpoints, hooks,
`keys.ts`, the previews, the barrel — reads an endpoint's callable / `.key` /
`.query()` shape and nothing else, so all four clients produce byte-identical
output everywhere except the client itself and `mocks.ts`. Swapping is a
one-word edit that leaves every call site alone.

An adapter does not wrap `@pyreon/http`; it emits a self-contained endpoint
factory into `client.ts`, so choosing axios means genuinely not depending on it.
URL construction, query encoding, cache-key shape and error shape are matched to
`@pyreon/http` exactly, held there by a differential test that uses its own
`buildUrl` as the oracle over the shapes these libraries disagree on. Retry
policy is deliberately not normalised — ky retries 5xx GETs and the others do
not — and is asserted rather than papered over.

`target: 'multiplatform'` with a non-Pyreon client is refused at config time
rather than silently downgraded: PMTC lowers `createHttp` and `api.endpoint(...)`
by name, so native modules over axios would lower to nothing.

Two pre-existing mock bugs, both found by executing the generated output rather
than asserting on its text:

- A generated mock route for a parameterised operation never matched. The
  declared path (`/books/:id`) was emitted as a plain string, and `MockRoute`
  matches a string as a suffix of the resolved URL (`/v1/books/b1`) — so every
  such fixture fell through to the real network. It now emits a bounded RegExp.
- A no-content operation emitted `json: null`, so the mock answered 200 with the
  body `null` while the real server answers 204 with nothing. `json` is now
  omitted, and the mock matches the server.
