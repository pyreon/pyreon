---
'@pyreon/http': minor
'@pyreon/native-compiler': minor
'@pyreon/lathe': patch
'@pyreon/query': patch
'@pyreon/mcp': patch
---

`useStream`'s `enabled` and `onEvent` options, and a runtime `json` body, now lower to iOS and Android.

- `@pyreon/native-compiler`: `enabled` (a boolean, an expression, a bare signal, or an accessor) joins the stream harness key — a flip stops or re-opens the stream, and `false` reads `idle` while keeping the events already received, the web hook's disabled branch. An inline `onEvent: (event) => …` runs after each event lands, with the event typed as the stream's item; one that reads its second (QueryClient) argument keeps the stream web by name, since native queries have no shared client. A RUNTIME `json` body (`json: { prompt: prompt() }`) is serialized per run through the `JSON.stringify` lowering with `content-type: application/json` and is part of the key, so a new value re-opens the stream as the web's tracked source does — an explicitly triggered POST stream is `enabled: () => sent()`. Before, the endpoint resolver sent such a request with NO body.
- `@pyreon/http` native runtime: `PyreonStream.idle()` (both targets) and an `onEvent` parameter on `runSse` / `runNdjson` (Swift) and `startSse` / `startNdjson` (Kotlin). On Kotlin it runs on the stream's own thread, in wire order.
- `@pyreon/lathe`: a stream-only non-GET operation's reach reason now names the real gap — the generated native components open on mount with params as their only props, so there is no generated trigger/body surface — instead of blaming the mutation lowering.
- `@pyreon/query`: the `useStream` manifest entry documents the native lowering of the new options.
