---
'@pyreon/http': minor
'@pyreon/lathe': minor
'@pyreon/mcp': patch
---

An int64 id can be passed back as a parameter without converting it. `@pyreon/http` accepts a `bigint` for a path, query (scalar, array or object), header and cookie parameter and writes its exact decimal digits. A query key holding one now hashes: `endpoint.key()` / `endpoint.query()` / `toQueryOptions` store its digits, because `JSON.stringify` (and so `@pyreon/query`'s key hash) throws on a bigint, which used to make the whole query fail before it fetched.

Under `int64: 'bigint'`, `@pyreon/lathe` types every int64 path / query / header / cookie parameter `bigint | number` (it was `string | number` for a path parameter and `string` for the rest). This covers the `pyreon`, `fetch`, `axios` and `ky` clients. The `fetch` / `axios` / `ky` runtimes widen their parameter types the same way and emit the same key normalisation. In default mode the output is unchanged.

The `@pyreon/http` browser suite can now run in WebKit and Firefox as well as Chromium (`test:browser:engines`), and it compares every lossless-JSON layer an engine supports against the others.
