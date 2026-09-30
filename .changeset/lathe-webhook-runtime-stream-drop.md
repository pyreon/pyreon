---
"@pyreon/lathe": minor
"@pyreon/http": minor
---

`webhooks.ts` now carries the receiving side as well as types and schemas.

- `validateWebhook(name, body)` runs a payload's schema on its own.
- `webhookHandler(handlers, { verify, event })` is framework-agnostic: a `Request` or `{ request }` in, a `Response` out, so a zero API route can use it as-is. It verifies over the exact bytes received, parses the body by its declared media type, picks the event, checks the method, validates, and dispatches. It answers `401`, `400`, `404`, `405` (with `Allow`), `422` (with the issues) or `204`. Signature checking is a pluggable `verify` hook; no vendor scheme is guessed.
- `callbackUrl(name, ctx)` / `expandCallbackUrl` / `evaluateRuntimeExpression` implement the full OpenAPI runtime-expression grammar for callback URLs: `$url`, `$method`, `$statusCode`, and `$request.` / `$response.` with `header.`, `query.`, `path.` and `body#/pointer`.

Stream mocks can simulate a lost connection. `mockOperation(id, { dropAfter: n })` delivers `n` events per connection and then errors the body, so a GET SSE stream's reconnect and `Last-Event-ID` resume run against the mocks. The generated adapters' dev transport accepts a streamed body.

`@pyreon/http`: a `MockRoute` `body` may be a `ReadableStream`, or a function that returns one. The stream is delivered as it is read and may error mid-body.
