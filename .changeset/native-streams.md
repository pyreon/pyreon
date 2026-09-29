---
'@pyreon/http': minor
'@pyreon/native-compiler': minor
'@pyreon/lathe': minor
'@pyreon/query': patch
'@pyreon/mcp': patch
---

Streaming operations now reach iOS and Android.

- `@pyreon/http` ships a co-located native stream runtime (`native/swift/PyreonStream.swift`, `native/kotlin/.../PyreonStream.kt`, declared in `pyreon.native`): SSE and NDJSON parsers that agree with `@pyreon/http/stream` byte-for-byte, and a `useStream` container with the web's reconnect semantics — exponential backoff, a server `retry:` replacing the base delay, `Last-Event-ID` on every reconnect, 408/429/5xx/network retried and other 4xx / decode failures final — cancelled when the view goes away. Kotlin uses the JDK's `HttpURLConnection` (no new dependency); Swift uses `URLSession.bytes(for:)` over raw bytes, because `AsyncBytes.lines` drops the empty lines that dispatch SSE events.
- `@pyreon/http/stream` web fix: the line reader stripped TWO leading BOMs (the `TextDecoder` consumed one, the reader another) where the spec strips one, and an empty chunk between the CR and LF of one CRLF reset the pending-CR state, so the LF read as a blank line and split one SSE event into two. Both found by the new cross-platform differential test.
- `@pyreon/native-compiler` lowers `useStream<SseEvent<T>>((ctx) => openEventStream((c) => endpoint({ …, signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }))` (and `openNdjsonStream` + `useStream<T>`) over a same-file endpoint to that runtime on both targets — keyed on the request URL and a restart tick, so a runtime `:param` reopens the stream and `restart()` works. `events`, `lastEventId`, `reconnect`, `data: 'text'`, `maxEvents` and a non-default `accept` lower; `parse` is ignored with a named warning; `enabled` / `onEvent` keep the stream web. A `responseType: 'stream'` endpoint consumed by `useFetch` / `useQuery` is now refused by name instead of lowering to a JSON decode of a byte stream.
- `@pyreon/lathe`: a stream-only `GET` with a typed event (or SSE read as text) gets a `<Op>Stream` component in its tag's native module, and the reach report names it `web+native` (the report and the emitter ask one predicate). An untyped stream stays `web-only` and says which event type is missing. The verifier recognises the `PyreonStream<` marker, and a stream-only tag module no longer imports an unused validator binding (which PMTC warned on by name).

Known limit, disclosed: URLSession reports a chunked body cut off by a graceful close as a clean end, where `fetch` and `HttpURLConnection` report an error. The Swift runtime reads an event left half-built at EOF as a dropped connection; a cut landing exactly on an event boundary still reads as a clean end on iOS.
