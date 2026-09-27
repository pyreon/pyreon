---
'@pyreon/http': minor
---

Security and cancellation hardening.

- **`dedupe()` no longer shares a response across users.** The default key now includes the `authorization` and `cookie` headers, so two concurrent requests to the same URL with different credentials (the SSR `forwardHeaders` / per-request `bearer` shape) each get their own response. When credentials are attached by middleware placed *after* `dedupe()`, a joiner detects it and issues its own request instead of taking the leader's (with a one-time dev warning to reorder). A custom `key` takes over this responsibility.
- **`dedupe()`: one caller aborting no longer cancels everyone.** The shared request runs on its own controller; each caller races its own signal, and the shared request is aborted only once every caller has left.
- **Abort and timeout now cover the body read.** `.json()` / `.text()` / `.blob()` / `.arrayBuffer()` / `.formData()` / `.void()` keep the request's abort link alive until the body is consumed, so aborting during `.json()` rejects with `AbortError` and cancels the transfer, and a slow body surfaces as `TimeoutError`. Behaviour change: the default 30s `timeout` now bounds the whole request including the body, not just the headers.
- **`retry()` / `refresh()` release discarded responses.** The body of a response being replayed (503, 401) is cancelled first, instead of holding its connection until GC (undici pool exhaustion under a burst of retries).
- **`retry()` / `refresh()` never replay a `ReadableStream` request body.** A one-shot body cannot be sent twice; the original response is returned instead of an unrelated "body already used" error. Behaviour change for requests with stream bodies.
- **`refresh()` works whichever side of `bearer()` it sits on.** With `use: [bearer(), refresh()]` the re-issued request now carries the refreshed token.
- **`bearer()` keeps the token on the `baseUrl` origin.** A path that is itself an absolute URL on another origin no longer receives `Authorization`. Opt back in with `bearer(token, { crossOrigin: true })`. No change when the client has no `baseUrl`. Behaviour change. `HttpRequest` gains an optional `baseUrl` field.
- **Error messages no longer include the query string**, fragment or userinfo of the URL (`HttpError`, `TimeoutError`, `AbortError`, `NetworkError`, `ParseError`, `ResponseValidationError`, the `validate: 'warn'` warning and `logger()` lines). The full URL remains on `error.request.url`.
