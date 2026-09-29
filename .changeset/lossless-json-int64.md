---
'@pyreon/http': minor
---

Lossless JSON for 64-bit integers. `JSON.parse` rounds an integer past 2^53 - 1 before any schema sees it (`9007199254740993` arrives as `9007199254740992`). The new `@pyreon/http/json` subpath exports `losslessJson` (plus `parseJsonLossless` / `stringifyJsonLossless`): such an integer decodes as a `bigint`, and a `bigint` in a request body is written as JSON number text instead of throwing. Everything else is byte-identical to `JSON.parse` / `JSON.stringify`.

- `createHttp({ json })` takes any `{ parse, stringify }` codec; response bodies, error bodies (`HttpError.body`) and request `json` bodies all go through it, and an extended client inherits it. Default unchanged.
- Streams take `parseJson` (`openEventStream` / `openNdjsonStream` options, `readNdjson`'s second argument).
- `@pyreon/http/mock` writes a `bigint` fixture as JSON number text (it threw before).
- `FormScalar` admits `bigint` — a form / multipart / cookie value is sent as its digits (the runtime already stringified it; only the type refused it).

The decoder reads digits from the source text portably: plain `JSON.parse` when no 16-digit run is present, the reviver's `context.source` where the engine passes it, and an own strict parser elsewhere (Node 20, Hermes) that rejects exactly what `JSON.parse` rejects.
