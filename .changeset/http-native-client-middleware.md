---
'@pyreon/http': minor
'@pyreon/hooks': minor
'@pyreon/query': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

`createHttp({ use: [...] })` middleware now crosses to iOS and Android.

Until now the client's `use` array was never read by the native compiler, so an endpoint call on a `use: [bearer(...)]` client lowered to a native request with no `Authorization` header, and a `retry()` client to one that never retried — on both targets, with no warning.

A literal `use` array now lowers when its entries are statically readable: `bearer(() => useSession().store.token(), { crossOrigin })`, `retry({ limit, methods, statuses, network, respectRetryAfter, maxDelay })` and `logger({ production })` become a `PyreonHttpMiddleware` list that the `useFetch` and `useQuery` harnesses pass to `PyreonHttp.send(…, middleware:)`. Both runtimes apply it as an onion with the web's semantics — array order, the same full-jitter backoff and `Retry-After` handling, the same header replacement and `baseUrl` origin boundary — and a differential test runs the web middleware and both native runtimes on 28 shared scenarios. `forwardHeaders` lowers to nothing, as it does in a browser.

Anything that cannot lower — `refresh`, `dedupe`, a custom middleware function, a `backoff` or `log` callback, a non-literal option, a token that reads a file-scope `signal()` — now keeps every call on that client on the web, with a warning naming the entry, instead of producing a request the web would never send. `useStream` refuses a client with middleware by name.

On Android, `logger()` cannot see the app's `BuildConfig`; set `PyreonHttpPipelineEnv.debugBuild = BuildConfig.DEBUG` at startup to silence it in release builds.
