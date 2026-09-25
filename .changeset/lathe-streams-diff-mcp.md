---
'@pyreon/lathe': minor
'@pyreon/http': minor
'@pyreon/query': minor
'@pyreon/mcp': minor
'@pyreon/config': minor
---

Streams, contract diffs and MCP for generated API clients.

- `@pyreon/http/stream` — Server-Sent Events and NDJSON over any transport: `openEventStream` / `openNdjsonStream` (typed, validated events; `Last-Event-ID` reconnection with backoff; cancellation that closes the socket; POST bodies and auth headers, which `EventSource` cannot send), the bare `readEventStream` / `readNdjson` parsers, and `streamHeaders`.
- `@pyreon/query` — `useStream(source, options)`: any async-iterable stream as signals (`events` / `latest` / `status` / `error`, `abort` / `restart`), re-opened when a tracked input changes, aborted on unmount.
- `@pyreon/lathe` — operations that stream (`text/event-stream`, NDJSON, or the new `streams` config) generate `<op>Stream` and `use<Op>Stream` for every client; `lathe diff <before> <after>` renders the client-contract diff of two specs, surfaces or git revisions as text, a Markdown PR comment, GitHub annotations or JSON, naming the generated symbols each change reaches; the new `mcp` plugin emits every operation as an MCP tool definition. `api-surface.json` now records each operation's stream, module, summary and generated symbols (non-diffed metadata). Fixes: `application/stream+json` was parsed as one JSON document; axios `responseType: 'stream'` returned a Node `Readable` (now uses axios's fetch adapter); the axios client emitted an unused `devResponse` (TS6133 under `noUnusedLocals`); a stream-only operation no longer gets a `useQuery` over a one-shot body.
- `@pyreon/mcp` — `get_api_client`, `get_api_operation` and `explain_api_diff` serve the project's generated API client to assistants.
- `@pyreon/config` — `lathe.streams` and the `mcp` plugin name.
