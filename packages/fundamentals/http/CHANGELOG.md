# @pyreon/http

## 0.53.0

### Minor Changes

- [#3844](https://github.com/pyreon/pyreon/pull/3844) [`6df4450`](https://github.com/pyreon/pyreon/commit/6df4450bb57c834997796f8f37c59bae3e743d74) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The `@pyreon/http` and `@pyreon/query` native lowering moves out of `@pyreon/native-compiler` into the packages themselves (`@pyreon/http/native-plugin`, `@pyreon/query/native-plugin`). The compiler no longer names `@pyreon/http` anywhere in its source (the boundary count goes 5 → 0; hook-name literals 142 → 136). `@pyreon/http` owns the endpoint DSL's compile-time half (the `createHttp` / `.endpoint()` scan, request resolution, the "metadata emits nothing" skip); `@pyreon/query` owns `useQuery`, `useStream`, `new QueryClient()` and `<QueryClientProvider>`, their harnesses, typing and compile-gate stubs. Emitted Swift and Kotlin are byte-identical for every golden entry (920; 192 are http / query / validate fixtures recorded from the parent compiler before the code moved; none updated).

  `@pyreon/native-compiler` gains the file-level seams a library with shared facts needs, each library-agnostic and exported through `@pyreon/native-compiler/plugin-api`: `CompilerPlugin.scanModule` (a per-file pre-pass with plugin-owned `fileState`, a `skipTopLevel` predicate for metadata-only declarations and `lowered(module, name)` for imports consumed by lowering), `requestSources` (a call of a plugin-recorded binding resolved to a concrete request, read by the core's `useFetch` and by other plugins through `ParseContext.requests` — no package edge between the plugins), `destructureCalls`, and a `null` recognizer verdict (claim a call without declaring anything, so it never falls to the generic value-const emit). `ParseContext` gains `requests`, `recordDecode`, `staticString`, `statements`, `typeArgOf` and `fileState`; `CallSite.construct` lets a recognizer claim `new Name(…)`; `DeclEmitter` gains `typing.callRead` and `asyncState` (what `<Suspense>` / `<ErrorBoundary>` read), `DeclLifecycle` gains `tailOrder` (the fetch → query → stream modifier grouping), and `EmitContext` gains `statements`. The pure AST readers the parser used (`topLevelDeclarators`, `readObjectProp`, `propName`, `staticPropKey`, `hasDynamicKey`, `literalScalar`, `readJsonLiteral`, …) are now exported for plugins. The `query`, `stream` and `query-client` declaration kinds are gone from `DeclIR` (they are `ext` declarations owned by the query plugin).

  Behaviour changes: a bare `transform()` / `createCompiler()` with no discovery no longer lowers `@pyreon/query` or the `@pyreon/http` endpoint DSL (load `@pyreon/query/native-plugin` / `@pyreon/http/native-plugin` yourself; `pyreon-native` discovers them from the app's dependencies and `--no-plugins` turns them off); `<QueryClientProvider>` is claimed through the import guard (it must come from `@pyreon/query`) instead of by tag name alone. `@pyreon/lathe`'s native verifier loads the project's own `@pyreon/http` / `@pyreon/query` plugins before compiling generated output.

### Patch Changes

- Updated dependencies [[`c933f92`](https://github.com/pyreon/pyreon/commit/c933f92e20104aba2807e229f03b9f0530135cb3), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`068310d`](https://github.com/pyreon/pyreon/commit/068310dd9bd78663945348f579a7f5fd082c6944), [`c253ae2`](https://github.com/pyreon/pyreon/commit/c253ae23978b06904768d171f3eb7e2b7114e273), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`87879d0`](https://github.com/pyreon/pyreon/commit/87879d0a04b5e221482693596cff0f7352c1e3ed), [`4b207a7`](https://github.com/pyreon/pyreon/commit/4b207a7c56938fc326b79dae1d381b7af53c8681), [`792e27e`](https://github.com/pyreon/pyreon/commit/792e27ef09c9b3dcc88c85a7ab6d969f60388848), [`0c95de5`](https://github.com/pyreon/pyreon/commit/0c95de5911873d56543a28acc0bb23e0ad5b299c), [`6df4450`](https://github.com/pyreon/pyreon/commit/6df4450bb57c834997796f8f37c59bae3e743d74), [`9fed8dc`](https://github.com/pyreon/pyreon/commit/9fed8dc5982d850bf09a0d0afa95b6d0fc7e8bae), [`1ce711d`](https://github.com/pyreon/pyreon/commit/1ce711d63e715110f614fcc423530eb13ceee43a), [`f7b64d9`](https://github.com/pyreon/pyreon/commit/f7b64d9164eb34d202e3d84b0c729a8d6918a359), [`3ec86b7`](https://github.com/pyreon/pyreon/commit/3ec86b7d4fce4c2c2c19ae233e5387d112b97a9a), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`09839d5`](https://github.com/pyreon/pyreon/commit/09839d56f631df1743319211cd2c821c2f259990), [`a110468`](https://github.com/pyreon/pyreon/commit/a1104680b3cf44b9d062ee4906b76a3ff09b2634), [`b0d6ac0`](https://github.com/pyreon/pyreon/commit/b0d6ac0c32c0b678d97144f43e750683bf1225ae), [`cf21221`](https://github.com/pyreon/pyreon/commit/cf21221e4249823a8fd04be8601168817045f6eb), [`0c95de5`](https://github.com/pyreon/pyreon/commit/0c95de5911873d56543a28acc0bb23e0ad5b299c), [`09839d5`](https://github.com/pyreon/pyreon/commit/09839d56f631df1743319211cd2c821c2f259990), [`ed1e29d`](https://github.com/pyreon/pyreon/commit/ed1e29d20c98d7c6ae2c062c10aa73174afa35c3), [`9b84418`](https://github.com/pyreon/pyreon/commit/9b844189403ed062150edff9999d2cae7838f430), [`3de1c68`](https://github.com/pyreon/pyreon/commit/3de1c68b460f1f83deb9988192dfa4000ffb25b0)]:
  - @pyreon/native-compiler@0.53.0
  - @pyreon/validation@0.53.0

## 0.52.0

### Minor Changes

- [#3647](https://github.com/pyreon/pyreon/pull/3647) [`d2abd90`](https://github.com/pyreon/pyreon/commit/d2abd907e169567321e8033039d8a3467593beb9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Security and cancellation hardening.

  - **`dedupe()` no longer shares a response across users.** The default key now includes the `authorization` and `cookie` headers, so two concurrent requests to the same URL with different credentials (the SSR `forwardHeaders` / per-request `bearer` shape) each get their own response. When credentials are attached by middleware placed _after_ `dedupe()`, a joiner detects it and issues its own request instead of taking the leader's (with a one-time dev warning to reorder). A custom `key` takes over this responsibility.
  - **`dedupe()`: one caller aborting no longer cancels everyone.** The shared request runs on its own controller; each caller races its own signal, and the shared request is aborted only once every caller has left.
  - **Abort and timeout now cover the body read.** `.json()` / `.text()` / `.blob()` / `.arrayBuffer()` / `.formData()` / `.void()` keep the request's abort link alive until the body is consumed, so aborting during `.json()` rejects with `AbortError` and cancels the transfer, and a slow body surfaces as `TimeoutError`. Behaviour change: the default 30s `timeout` now bounds the whole request including the body, not just the headers.
  - **`retry()` / `refresh()` release discarded responses.** The body of a response being replayed (503, 401) is cancelled first, instead of holding its connection until GC (undici pool exhaustion under a burst of retries).
  - **`retry()` / `refresh()` never replay a `ReadableStream` request body.** A one-shot body cannot be sent twice; the original response is returned instead of an unrelated "body already used" error. Behaviour change for requests with stream bodies.
  - **`refresh()` works whichever side of `bearer()` it sits on.** With `use: [bearer(), refresh()]` the re-issued request now carries the refreshed token.
  - **`bearer()` keeps the token on the `baseUrl` origin.** A path that is itself an absolute URL on another origin no longer receives `Authorization`. Opt back in with `bearer(token, { crossOrigin: true })`. No change when the client has no `baseUrl`. Behaviour change. `HttpRequest` gains an optional `baseUrl` field.
  - **Error messages no longer include the query string**, fragment or userinfo of the URL (`HttpError`, `TimeoutError`, `AbortError`, `NetworkError`, `ParseError`, `ResponseValidationError`, the `validate: 'warn'` warning and `logger()` lines). The full URL remains on `error.request.url`.

- [#3680](https://github.com/pyreon/pyreon/pull/3680) [`f74c37c`](https://github.com/pyreon/pyreon/commit/f74c37cac8b162012b6bcb8494eef3bd5c3be85b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Request bodies beyond JSON. `form` sends `application/x-www-form-urlencoded` (per-field OpenAPI `style`/`explode` via `formEncoding`, including `deepObject` brackets — what Stripe and Twilio require), `multipart` sends `FormData` (a `Blob`/`File` becomes a file part), `body` is now accepted by endpoints, and `cookies` writes a `Cookie` header (server-side/native). `json`, `form`, `multipart` and `body` are mutually exclusive and passing two throws. A header record may carry numbers, booleans and `undefined` (omitted, instead of the literal text `"undefined"`). An endpoint's declared `headers` now MERGE with per-call `headers` instead of being replaced by them, and `formEncoding` can be declared on the endpoint. `encodeForm`, `encodeMultipart` and `encodeCookies` are exported.

- [#3689](https://github.com/pyreon/pyreon/pull/3689) [`2a85027`](https://github.com/pyreon/pyreon/commit/2a85027c190335e782bd581b5856ae2ef783207d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Typed error bodies. An `HttpError` now carries its decoded `body` (read from a clone, so `response.raw` stays readable), and an endpoint or request can declare `errors` schemas keyed by status, range (`'4XX'`) or `default`. The thrown error's body is validated against the most specific match under the client's `validate` mode and `matched` names the key it passed; a body that fails its schema stays the same HTTP failure with `matched` undefined. New types `HttpErrorOf<E>`, `EndpointError<EP>`, `RequestFailure` and `ErrorSchemas`; `Endpoint` gains an optional fourth type parameter and an `errors` property.

  Reading that error body is covered by the request's abort signal and `timeout`: a caller abort or timeout during the read surfaces as `AbortError` / `TimeoutError`, and the `validate: 'warn'` mismatch warning names the request without its query string.

- [#3735](https://github.com/pyreon/pyreon/pull/3735) [`fc91492`](https://github.com/pyreon/pyreon/commit/fc91492c18cba19e38811486884eba76a46ef832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - An int64 id can be passed back as a parameter without converting it. `@pyreon/http` accepts a `bigint` for a path, query (scalar, array or object), header and cookie parameter and writes its exact decimal digits. A query key holding one now hashes: `endpoint.key()` / `endpoint.query()` / `toQueryOptions` store its digits, because `JSON.stringify` (and so `@pyreon/query`'s key hash) throws on a bigint, which used to make the whole query fail before it fetched.

  Under `int64: 'bigint'`, `@pyreon/lathe` types every int64 path / query / header / cookie parameter `bigint | number` (it was `string | number` for a path parameter and `string` for the rest). This covers the `pyreon`, `fetch`, `axios` and `ky` clients. The `fetch` / `axios` / `ky` runtimes widen their parameter types the same way and emit the same key normalisation. In default mode the output is unchanged.

  The `@pyreon/http` browser suite can now run in WebKit and Firefox as well as Chromium (`test:browser:engines`), and it compares every lossless-JSON layer an engine supports against the others.

- [#3684](https://github.com/pyreon/pyreon/pull/3684) [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/lathe`: a public plugin API and author control over the output.

  - `definePlugin({ name, requires?, setup?, transformDocument?, emit? })` — third-party emitters and IR transforms, listed in `plugins` beside the built-in names. Hook failures name the plugin and the hook; the document a hook receives is frozen (return a modified copy; a copy with dangling model references is refused); each hook runs twice and must agree with itself, so a plugin cannot break byte-identical regeneration; plugin files are listed in `lathe-manifest.json` (pruned when dropped), compared by `lathe check`, passed to `format`, and refused on a path collision. The IR types, the `SourceFile` writer and the identifier helpers are exported for plugin authors.
  - `filters` — generate a subset: `include` / `exclude` matchers by tag (every tag), path glob, operationId glob (spec id or generated name) and method. Unreached models and their notes are dropped (`models: 'all'` keeps them). A matcher that selects nothing is an error with a suggestion.
  - `patches` — RFC 6902 `add` / `replace` / `remove` at RFC 6901 pointers, applied before the spec is read. A patch whose target moved fails the run.
  - `operations` — per operation, keyed by endpoint name or spec `operationId`: `hook` (a name, or `false` for no hook, preview or native component), `responseValidation`, and `pagination` (the same entry the top-level `pagination` takes).
  - `naming` — `operation` / `model` / `file` / `hook` functions receiving Lathe's own choice as `default`; results are validated and collision-checked (file names case-insensitively). `hook` may return `false`.
  - `format` — `(code, path) => string | Promise<string>`, applied before a file is written and before `lathe check` (and the Vite plugin's `checkOnBuild`) compares. `formatFiles` is exported for programmatic use.
  - New note code `plugin` (severity `loss`) for losses a plugin reports through `ctx.note`.

  Behaviour changes: `runPass` from `@pyreon/lathe/vite` is now async (it may run an async formatter). With the `queries` plugin on, generated hook names are now checked for collisions (with each other, with endpoint names and with `@pyreon/query`'s exports) and a collision is an error naming both sides — previously it produced a module that did not compile.

  `@pyreon/http`: a per-request `validate` option and a per-endpoint `validate` in `api.endpoint(spec, { validate })` override the client's response-validation mode (static or accessor) for that request or endpoint.

  `@pyreon/config`: `LatheSection` gains `operations`, `filters`, `patches`, `naming` and `format`, and `plugins` accepts `definePlugin` plugins (`LathePluginObject`), kept in parity with `@pyreon/lathe` by its compile-time test.

- [#3710](https://github.com/pyreon/pyreon/pull/3710) [`592c07b`](https://github.com/pyreon/pyreon/commit/592c07b848cb92cb1c0e5222b706f3c80c7c23ff) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lathe reads the spec constructs it used to leave behind. An `examples` entry that is a `$ref` (to `components.examples`, or to another file) is resolved before it becomes the `@example` and the preview argument; the bundler now treats an `examples` map as structure and only an example's `value` as data. A path item written as a `$ref` (3.1 `components.pathItems`, or shared between paths, webhooks and callbacks) is followed, with local fields winning. A `default` response with no 2xx beside it is carried through as the typed error body as well as the success type. A JSON spec's duplicate keys are reported (`duplicate-key`) with a pointer to each; `JSON.parse` still keeps the last, as every JSON reader does. A `trace` operation is reported (`unsupported-method`) rather than dropped silently: the Fetch standard forbids the method. Swagger 2: per-operation `schemes` that exclude the client's scheme become that operation's own servers on the document's host, and a query or form `collectionFormat: tsv` is carried as a new `tabDelimited` style.

  `@pyreon/http`: `QueryStyle` and `FormFieldEncoding` accept `tabDelimited`, which joins an array with a tab (Swagger 2's `collectionFormat: tsv`).

- [#3688](https://github.com/pyreon/pyreon/pull/3688) [`c41314d`](https://github.com/pyreon/pyreon/commit/c41314da54f7217a4a63cd0d6ec07583fd431001) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Streams, contract diffs and MCP for generated API clients.

  - `@pyreon/http/stream` — Server-Sent Events and NDJSON over any transport: `openEventStream` / `openNdjsonStream` (typed, validated events; `Last-Event-ID` reconnection with backoff; cancellation that closes the socket; POST bodies and auth headers, which `EventSource` cannot send), the bare `readEventStream` / `readNdjson` parsers, and `streamHeaders`.
  - `@pyreon/query` — `useStream(source, options)`: any async-iterable stream as signals (`events` / `latest` / `status` / `error`, `abort` / `restart`), re-opened when a tracked input changes, aborted on unmount.
  - `@pyreon/lathe` — operations that stream (`text/event-stream`, NDJSON, or the new `streams` config) generate `<op>Stream` and `use<Op>Stream` for every client; `lathe diff <before> <after>` renders the client-contract diff of two specs, surfaces or git revisions as text, a Markdown PR comment, GitHub annotations or JSON, naming the generated symbols each change reaches; the new `mcp` plugin emits every operation as an MCP tool definition. `api-surface.json` now records each operation's stream, module, summary and generated symbols (non-diffed metadata). Fixes: `application/stream+json` was parsed as one JSON document; axios `responseType: 'stream'` returned a Node `Readable` (now uses axios's fetch adapter); the axios client emitted an unused `devResponse` (TS6133 under `noUnusedLocals`); a stream-only operation no longer gets a `useQuery` over a one-shot body.
  - `@pyreon/mcp` — `get_api_client`, `get_api_operation` and `explain_api_diff` serve the project's generated API client to assistants.
  - `@pyreon/config` — `lathe.streams` and the `mcp` plugin name.
  - Stream mocks: a generated mock for a streaming operation answers with a real SSE / NDJSON body (three fixture events with ids; an SSE mock resumes after `Last-Event-ID`), and an operation offering JSON and a stream is mocked by `Accept`. `@pyreon/http/mock` routes gain `accept` and a computed `body: (call) => string`.

- [#3719](https://github.com/pyreon/pyreon/pull/3719) [`cf780e1`](https://github.com/pyreon/pyreon/commit/cf780e15f31bc55119be29482a0adf706cae6c54) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `webhooks.ts` now carries the receiving side as well as types and schemas.

  - `validateWebhook(name, body)` runs a payload's schema on its own.
  - `webhookHandler(handlers, { verify, event })` is framework-agnostic: a `Request` or `{ request }` in, a `Response` out, so a zero API route can use it as-is. It verifies over the exact bytes received, parses the body by its declared media type, picks the event, checks the method, validates, and dispatches. It answers `401`, `400`, `404`, `405` (with `Allow`), `422` (with the issues) or `204`. Signature checking is a pluggable `verify` hook; no vendor scheme is guessed.
  - `callbackUrl(name, ctx)` / `expandCallbackUrl` / `evaluateRuntimeExpression` implement the full OpenAPI runtime-expression grammar for callback URLs: `$url`, `$method`, `$statusCode`, and `$request.` / `$response.` with `header.`, `query.`, `path.` and `body#/pointer`.

  Stream mocks can simulate a lost connection. `mockOperation(id, { dropAfter: n })` delivers `n` events per connection and then errors the body, so a GET SSE stream's reconnect and `Last-Event-ID` resume run against the mocks. The generated adapters' dev transport accepts a streamed body.

  `@pyreon/http`: a `MockRoute` `body` may be a `ReadableStream`, or a function that returns one. The stream is delivered as it is read and may error mid-body.

- [#3684](https://github.com/pyreon/pyreon/pull/3684) [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Endpoint paths: `\:` now writes a LITERAL colon, for paths such as Google-style custom verbs (`'POST /v1/:name\\:cancel'`). Without it an unescaped `:cancel` read as a second parameter the caller could never supply. The type-level `PathParamNames` now mirrors the runtime matcher exactly: it honours the escape, stops a parameter name at the first non-identifier character (`/f/:name.json`, `/f/:a-:b`), and finds parameters that do not start their segment (`/f/file:id`) — all shapes where the type and the runtime used to disagree.

  Query parameters: an OBJECT value is now serialized with bracket keys (`filter[status]=open`) instead of `filter=[object Object]`, and its type is accepted (`QueryObject`). Endpoints can declare OpenAPI's serialization per key with `queryStyle` (`form` / `spaceDelimited` / `pipeDelimited` / `deepObject`, `explode`), e.g. `api.endpoint('GET /search', { queryStyle: { ids: { style: 'form', explode: false } } })` sends `ids=1,2`. `buildQuery` / `buildUrl` take the styles as an optional last argument. New exported types: `QueryStyle`, `QueryObject`, `QueryScalar`.

  Endpoints: `responseType` (`'text' | 'blob' | 'arrayBuffer' | 'stream' | 'void'`, default `'json'`) decodes non-JSON bodies and types the resolved value accordingly (`BodyOf`). A third generic narrows what a call sends — `api.endpoint<'POST /pets', typeof Pet, { json: NewPet }>(…)` makes a direct call as strictly typed as a hook (new `EndpointInput` / `EndpointCallOptions` types; `EndpointArgs` is their intersection, unchanged). `keyScope` (on `createHttp` or per endpoint) namespaces cache keys as `[keyScope, method, path, …]`, so two clients sharing a `QueryClient` no longer share `GET /users`.

  `createHttp({ baseUrl, validate })` accept ACCESSORS (`baseUrl: () => settings.apiUrl()`, `validate: () => mode()`), read per request — the seam for an environment switch or a runtime-configured client. `extend()` inherits an accessor `validate` and a static value replaces it.

- [#3735](https://github.com/pyreon/pyreon/pull/3735) [`fc91492`](https://github.com/pyreon/pyreon/commit/fc91492c18cba19e38811486884eba76a46ef832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lossless JSON for 64-bit integers. `JSON.parse` rounds an integer past 2^53 - 1 before any schema sees it (`9007199254740993` arrives as `9007199254740992`). The new `@pyreon/http/json` subpath exports `losslessJson` (plus `parseJsonLossless` / `stringifyJsonLossless`): such an integer decodes as a `bigint`, and a `bigint` in a request body is written as JSON number text instead of throwing. Everything else is byte-identical to `JSON.parse` / `JSON.stringify`.

  - `createHttp({ json })` takes any `{ parse, stringify }` codec; response bodies, error bodies (`HttpError.body`) and request `json` bodies all go through it, and an extended client inherits it. Default unchanged.
  - Streams take `parseJson` (`openEventStream` / `openNdjsonStream` options, `readNdjson`'s second argument).
  - `@pyreon/http/mock` writes a `bigint` fixture as JSON number text (it threw before).
  - `FormScalar` admits `bigint` — a form / multipart / cookie value is sent as its digits (the runtime already stringified it; only the type refused it).

  The decoder reads digits from the source text portably: plain `JSON.parse` when no 16-digit run is present, the reviver's `context.source` where the engine passes it, and an own strict parser wherever the engine lacks it that rejects exactly what `JSON.parse` rejects.

- [#2842](https://github.com/pyreon/pyreon/pull/2842) [`d873013`](https://github.com/pyreon/pyreon/commit/d873013b7c3ba8f4e2bc5984b974e684009a287d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - PMTC now lowers `@pyreon/http`'s endpoint DSL onto the existing PyreonFetch machinery: a same-file `const api = createHttp({ baseUrl })` + `const getUser = api.endpoint('GET /users/:id')` lets `useFetch<T>(getUser({ params: { id: '1' } }))` resolve at compile time to a concrete templated URL + method, emitting identically to `useFetch<T>('/api/users/1', { method: 'GET' })` on both targets. Literal params only — reactive params, a computed baseUrl, and the `.query()` fetcher form warn and stay web. No new emit/IR/stub; `createHttp`/`.endpoint` are metadata and emit nothing. `@pyreon/http`'s manifest declares the `nativeFrontend` (partial crossing).

- [#3755](https://github.com/pyreon/pyreon/pull/3755) [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Finish the Kotlin `Int` to `Long` move for the runtime APIs emitted code reaches. `PyreonToast.maxToasts`, `PyreonSortable.moveIndex`, `PyreonRateLimit` delays and scheduler, `PyreonSizedMap` (`maxEntries`, `size`), `PyreonScreenOrientation.angle`, `PyreonStream` (`maxEvents`, reconnect `attempts`) and the chart web-view selection indices now use `Long`, and the emit adds the `L` suffix to the literals it passes them. `PyreonChartPoints` takes `Long` counts, which fixes a real `gradle assembleDebug` failure in every chart-bearing Android example. `syncedSignal` and `PyreonCrdtMap.set` now accept `Long` (a `Long` signal previously threw `unsupported value type`).

- [#3732](https://github.com/pyreon/pyreon/pull/3732) [`7c69228`](https://github.com/pyreon/pyreon/commit/7c6922838c8c05695b320c62d5758e3379840560) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useStream`'s `enabled` and `onEvent` options, and a runtime `json` body, now lower to iOS and Android.

  - `@pyreon/native-compiler`: `enabled` (a boolean, an expression, a bare signal, or an accessor) joins the stream harness key — a flip stops or re-opens the stream, and `false` reads `idle` while keeping the events already received, the web hook's disabled branch. An inline `onEvent: (event) => …` runs after each event lands, with the event typed as the stream's item; one that reads its second (QueryClient) argument keeps the stream web by name, since native queries have no shared client. A RUNTIME `json` body (`json: { prompt: prompt() }`) is serialized per run through the `JSON.stringify` lowering with `content-type: application/json` and is part of the key, so a new value re-opens the stream as the web's tracked source does — an explicitly triggered POST stream is `enabled: () => sent()`. Before, the endpoint resolver sent such a request with NO body.
  - `@pyreon/http` native runtime: `PyreonStream.idle()` (both targets) and an `onEvent` parameter on `runSse` / `runNdjson` (Swift) and `startSse` / `startNdjson` (Kotlin). On Kotlin it runs on the stream's own thread, in wire order.
  - `@pyreon/lathe`: a stream-only non-GET operation's reach reason now names the real gap — the generated native components open on mount with params as their only props, so there is no generated trigger/body surface — instead of blaming the mutation lowering.
  - `@pyreon/query`: the `useStream` manifest entry documents the native lowering of the new options.

- [#3720](https://github.com/pyreon/pyreon/pull/3720) [`45a04fb`](https://github.com/pyreon/pyreon/commit/45a04fb6e95af5b6d0dad9d3e76d5d756a218f02) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Streaming operations now reach iOS and Android.

  - `@pyreon/http` ships a co-located native stream runtime (`native/swift/PyreonStream.swift`, `native/kotlin/.../PyreonStream.kt`, declared in `pyreon.native`): SSE and NDJSON parsers that agree with `@pyreon/http/stream` byte-for-byte, and a `useStream` container with the web's reconnect semantics — exponential backoff, a server `retry:` replacing the base delay, `Last-Event-ID` on every reconnect, 408/429/5xx/network retried and other 4xx / decode failures final — cancelled when the view goes away. Kotlin uses the JDK's `HttpURLConnection` (no new dependency); Swift uses `URLSession.bytes(for:)` over raw bytes, because `AsyncBytes.lines` drops the empty lines that dispatch SSE events.
  - `@pyreon/http/stream` web fix: the line reader stripped TWO leading BOMs (the `TextDecoder` consumed one, the reader another) where the spec strips one, and an empty chunk between the CR and LF of one CRLF reset the pending-CR state, so the LF read as a blank line and split one SSE event into two. Both found by the new cross-platform differential test.
  - `@pyreon/native-compiler` lowers `useStream<SseEvent<T>>((ctx) => openEventStream((c) => endpoint({ …, signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }))` (and `openNdjsonStream` + `useStream<T>`) over a same-file endpoint to that runtime on both targets — keyed on the request URL and a restart tick, so a runtime `:param` reopens the stream and `restart()` works. `events`, `lastEventId`, `reconnect`, `data: 'text'`, `maxEvents` and a non-default `accept` lower; `parse` is ignored with a named warning; `enabled` / `onEvent` keep the stream web. A `responseType: 'stream'` endpoint consumed by `useFetch` / `useQuery` is now refused by name instead of lowering to a JSON decode of a byte stream.
  - `@pyreon/lathe`: a stream-only `GET` with a typed event (or SSE read as text) gets a `<Op>Stream` component in its tag's native module, and the reach report names it `web+native` (the report and the emitter ask one predicate). An untyped stream stays `web-only` and says which event type is missing. The verifier recognises the `PyreonStream<` marker, and a stream-only tag module no longer imports an unused validator binding (which PMTC warned on by name).

  Known limit, disclosed: URLSession reports a chunked body cut off by a graceful close as a clean end, where `fetch` and `HttpURLConnection` report an error. The Swift runtime reads an event left half-built at EOF as a dropped connection; a cut landing exactly on an event boundary still reads as a clean end on iOS.

### Patch Changes

- [#3396](https://github.com/pyreon/pyreon/pull/3396) [`ed98e38`](https://github.com/pyreon/pyreon/commit/ed98e380716dacea266b65e25394b5157265a415) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Three correctness residuals from the pre-release audit:

  - **`@pyreon/state-tree` — a cyclic parent chain is now LOUD instead of a wrong answer.** `getRoot` / `getPath` bound their ancestor walk with a depth counter (the allocation win over a per-call `Set` is real and is kept), but reaching the bound exited SILENTLY: `getRoot` returned whatever node it was holding — a wrong root, on every call of the hot `reference()` resolve path — and `getPath` returned a 600,000-character garbage string built by 100,000 `unshift`s (~700ms per call). A cycle is reachable through the public API (`a.child.set(b)` then `b.child.set(a)` makes each the other's parent), so this was not hypothetical. Hitting the bound means the acyclicity invariant these walks rest on is already broken and there is no correct answer left to return, so both now throw a `[Pyreon]`-prefixed error naming the node and the fix. `getPath` also collects leaf-to-root and reverses instead of `unshift`ing, which was what made the failure O(n²).

  - **`@pyreon/styler` — prop forwarding iterated the prototype chain but copied own descriptors.** `filterProps` and `buildProps` (4 loops) enumerated with `for...in` while `keep`/`copyDescriptor` read an OWN descriptor, so an INHERITED enumerable prop was iterated and then silently dropped. They now iterate own keys, which makes the two halves agree by construction and matches the rest of the layer (`@pyreon/ui-core`'s `omit`/`pick` and `@pyreon/core`'s `mergeProps`/`splitProps` are all own-key operations). Output is unchanged — the drop was already happening; what changes is that it can no longer be "fixed" the other way, since copying an inherited accessor onto the target would sever the prototype link and rebind its `this`. Measured: `Object.keys` costs the same as `for...in` here (983 ns/call both), so the clarity is free. **Behaviour change:** both helpers now force `configurable: true` on copied descriptors, mirroring `mergeProps`. A source getter defined via `Object.defineProperty` without an explicit flag is non-configurable, and copying it verbatim made the key impossible to redefine downstream (`TypeError: Cannot redefine property`).

  - **`@pyreon/http` — the static-header semantic is now stated and pinned.** The client folds its leading run of static header sources once and memoizes it, so a caller passing a mutable record sees the value captured at the first request rather than the current one. That is the intended semantic — it is this module's immutability rule, and a function source is the supported seam for a per-request value — but it shipped with no test in either direction and no mention in the prop's docs. Both are now explicit. No behaviour change.

- [#3174](https://github.com/pyreon/pyreon/pull/3174) [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update third-party dependencies to their latest compatible releases,
  extending [#3174](https://github.com/pyreon/pyreon/issues/3174)'s sweep to every package.json the first pass hadn't reached
  (that pass touched only the root manifest, so nothing there tripped the
  Changeset gate — this one edits per-package manifests directly and does).

  Runtime dependencies that reach consumers: `oxc-parser`/`oxc-transform`
  0.147 → 0.148 (`@pyreon/compiler`, `@pyreon/native-compiler`, `@pyreon/lint`
  — `@oxc-project/types` alongside it), `magic-string` 1.2.2 → 1.2.3
  (`@pyreon/compiler`), the CodeMirror 6 family — `@codemirror/search` and
  `@codemirror/state` 6.7.1 → 6.7.2, `@codemirror/legacy-modes` 6.5.3 → 6.5.4
  (`@pyreon/code`), TipTap 3.30.3 → 3.31.2 (`@pyreon/rich-text`), TanStack Query
  5.102.2 → 5.102.8 across `@tanstack/query-core` and its persist/devtools
  companions (`@pyreon/query`, and the shared root override so `@pyreon/http`
  agrees), `@tanstack/table-core` 9.1.2 → 9.2.4 (`@pyreon/table`), the
  pragmatic-drag-and-drop family (`@pyreon/dnd`) — core 3.0.0 → 3.1.0,
  auto-scroll 3.1.0 → 3.2.0, hitbox 2.1.0 → 2.2.0, all in-range within the
  v3 major this repo already adopted.

  Dev-only comparison/tooling bumps across the touched packages: `rolldown`,
  `react-hook-form`, `hotkeys-js`, `axios`, `ky`, `i18next`, `xstate`, `joi`,
  `typia`, `nuqs`, `@tanstack/react-virtual`, `@tanstack/react-table`,
  `@tanstack/react-query`, `motion`, and `mobx-state-tree` 7.4.0 → 8.0.0 — a
  real major, but its own peer range for `mobx` moved `^6.3.0` → `^7.0.0`,
  which matches what this repo already declares (`^7.0.3`); the OLD pin was
  the one silently out of range.

  `happy-dom` deduped to ONE resolved version repo-wide — three stale copies
  (20.11.6/20.12.0/20.13.2) were co-installed before this pass across the ~17
  packages that each pin it independently. The unification target is
  **20.11.6, not the newest 20.13.2** — bumping past 20.11.6 breaks
  `@pyreon/styler`'s `memory-growth.test.ts` deterministically (5/5 local
  runs, plus a CI failure on `test (fundamentals+ui-system+zero)`), a pure
  `environment: 'happy-dom'` test whose eviction-cycle counting depends on
  CSSOM/`cssRules` behavior that changed somewhere between those versions —
  confirmed by isolating the version with an exact pin, not by assumption; 3/3
  clean at 20.11.6, 5/5 failing at 20.13.2. Verified pre-existing on `main`
  (3/3 passes there, at 20.11.6) so this is the same "routine bump, unvetted
  runtime behavior change" shape as the `@tanstack/virtual-core` finding
  below, just caught before push instead of by CI. The one other consumer
  pinning past 20.11.6 — `@happy-dom/global-registrator` in
  `examples/benchmark`, whose own 20.13.2 release requires `happy-dom
^20.13.2` as a peer — is reverted to `^20.11.6` alongside it, so the whole
  graph resolves to one version again.

  `examples/benchmark`'s framework competitors were refreshed too so the
  "fastest framework" comparisons stay honest against current releases: Vue +
  `@vue/server-renderer` + `@vue/compiler-dom` 3.5.41 → 3.5.42, Svelte 5.56.10
  → 5.57.0, and Octane 0.1.46 → 0.2.2 (its peer `@octanejs/vite-plugin`
  0.1.46 → 0.1.52 alongside it) — a real minor jump, verified with a clean
  production build before committing to it. Octane 0.2.2 replaces the
  `forBlock` fast-path flag the row-list bench's own doc comment describes
  un-handicapping with a new `fastKeyedForBlock` path; the bench impl still
  reaches it (confirmed by compiling `octane.tsrx` through `octane/compiler`
  0.2.2 and reading the emitted flags), so the comparison stays fair, but
  every previously-published Pyreon-vs-Octane number in
  `.agents/guides/benchmarks/README.md` was measured against 0.1.46 and
  needs re-verification against 0.2.2 before being cited again — flagged
  there, not restated as fact here.

  Held deliberately, each for a stated reason found by actually reading the
  dependency rather than assuming: TypeScript stays capped `<7.0.0` (removes
  the classic Compiler API `@pyreon/compiler`/`@pyreon/mcp`/`@pyreon/cli` are
  built on). `vitest`/`@vitest/browser`/`@vitest/browser-playwright`/
  `@vitest/coverage-v8` stay on 4.1.11 as one locked unit (5.0.0 just went GA
  and changes `clearMocks` to default `true`, tightens `coverage.include`/
  `exclude` matching, and removes several import entrypoints — exactly the
  class of change this repo's `Coverage (Full)` gate has already rotted on
  three times; a real migration, not a version bump). `@changesets/cli`
  2.31.1 → 3.0.1 and `@changesets/changelog-github` 0.7.0 → 1.0.0 stay put:
  1.0.0 ships `"type": "module"` with no CJS export, and this repo's own
  `.changeset/resilient-changelog.cjs` does `require('@changesets/changelog-
github')` — bumping it would break `changeset version` at release time with
  `ERR_REQUIRE_ESM`, verified by reading the published package's `exports`
  map, not assumed. The root `uuid` override stays at `11.1.1` for the same
  reason, one level removed: it force-pins a transitive dep of `exceljs`
  (`^8.3.0`, itself already outside its own declared range on purpose), and
  `uuid` 12.0.0 dropped CommonJS support entirely — `exceljs`'s own bundled
  code does `require('uuid')`, verified directly in its installed `dist/`, so
  the same ESM-only trap applies one hop further down the graph.

  One more found by actually running the browser test tier, not just typecheck
  and the node/happy-dom suite: `@tanstack/virtual-core` was bumped 3.17.4 →
  3.17.8 in this branch's first pass (a routine-looking override edit, not
  vetted as carefully as the deps above), and it broke
  `@pyreon/virtual`'s real-Chromium `repositions a STAYING row below when row 0
is remeasured taller` test deterministically (3/3 local runs, plus 3/3 CI
  retries) — bisected down to virtual-core's own 3.17.7 "synchronous
  notification for scroll compensation" change, not to anything else in this
  branch (ruled out `@tanstack/react-virtual`, unrelated — not imported by this
  code path at all; ruled out the `oxc-parser`/`magic-string`/`rolldown`
  bumps too, by reverting each in isolation and rebuilding). Reverted back to
  3.17.4, matching what's currently on `main`, and NOT bumped further.

  This surfaced something that predates this PR: `@pyreon/virtual`'s own
  `package.json` has declared `@tanstack/virtual-core: "^3.17.7"` since an
  earlier fix (commit 973c4e323, "the root overrides pinned
  @tanstack/virtual-core to 3.17.4 while three packages declared ^3.17.7, so
  the installed version did not satisfy its own consumers' declared range")
  — but the root override was only ever bumped to 3.17.4 there, not to
  3.17.7+, so the exact mismatch that fix describes is still live on `main`
  today: the declared floor and the resolved version disagree, silently,
  because the currently-resolved 3.17.4 happens to still pass. Bumping the
  override to actually satisfy the package's own declared range (3.17.7,
  confirmed — not just 3.17.8) is what surfaces the real compatibility break
  in `use-virtualizer.ts`'s remeasurement handling. Left as-is here rather
  than fixed, because closing it needs either updating the wrapper for
  virtual-core's new synchronous-notification timing or re-adjudicating the
  test's assumptions against it — real source-level work, not a version
  bump. Tracked as a known gap, not silently left broken: someone picking
  this up should treat `bun run test:browser` in `@pyreon/virtual` as the
  regression gate, not just `bun run test`, which does not exercise this
  path at all (confirmed: the full node/happy-dom suite passes 1805/1805
  regardless of which virtual-core version is resolved).

- [#2704](https://github.com/pyreon/pyreon/pull/2704) [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration).

- [#3752](https://github.com/pyreon/pyreon/pull/3752) [`fe29937`](https://github.com/pyreon/pyreon/commit/fe2993738a67840e666aa083497b524318d9a8e7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - No user-facing behavior change. `@pyreon/http`'s node test-coverage margin had thinned to 98.19% against its configured 98% statement floor (0.19%, roughly two statements) — thin enough that ordinary run-to-run variance (test scheduling, coverage-instrumentation load) could tip a CI run below the gate. Added real tests for a dozen genuinely-uncovered code paths (SSE-abort timing, form-encoding of a scalar object property, URL redaction of a fragment with no query string, an abort-aware mock delay completing normally, an already-aborted signal reaching `retry`'s backoff wait, a refresh that succeeds while the caller aborts mid-refresh, `forwardHeaders`' relative-URL fast path, `_resetRequestSource()`, and several error-body-read shapes: no signal, a genuinely unreadable body, a bodyless 304, and `.void()` draining a failing body) — statements now sit at 100%, branches at 97.17% (was 95.55%), comfortably clear of the 98%/95% floors.

  Also deflaked `stream.test.ts`'s "an external signal aborted mid-stream" spec: it asserted an EXACT event count against a 5ms-interval SSE endpoint, which is a timing race under scheduler load (observed failing once locally under a slower Node build) — relaxed to the same `>=1` shape its sibling spec already uses; the actual contract (the loop ends, without throwing) is unchanged and still asserted.

  Two lines in `src/schema.ts` and two in `src/middleware/dedupe.ts` are marked `/* v8 ignore */` with an in-code rationale rather than tested: they are defensive idempotency/fail-loud guards that the current call graph cannot reach (documented at each site). The `schema.ts` one is a real, small cross-package inconsistency — `@pyreon/validation`'s `isPyreonAdapter` requires `typeof value.parse === 'function'` at the door, so an adapter that fails ITS OWN documented "optional `parse`" contract can never reach this package's dedicated error message for that case. Fixing the guard belongs in `@pyreon/validation` as its own change (it has its own consumers — store, state-tree, form, feature); left as a follow-up rather than folded in here.

- [#2753](https://github.com/pyreon/pyreon/pull/2753) [`0f18357`](https://github.com/pyreon/pyreon/commit/0f183572631e53e5ca4a283f663bd64800810845) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Per-request hot path made ~37% faster (measured — the new `bench:http` head-to-head vs ky/ofetch/redaxios/axios now shows fastest-or-tied on every row; the headline `GET → decoded JSON` flipped from an outright loss to ofetch into a 1.4× win):

  - Static header sources are folded once (lazily, at first request) and cloned per request via one native `new Headers(folded)` instead of re-merging every source through intermediate `Headers` allocations (~360ns/request). Sources from the first function source onward stay dynamic, so accessor headers (rotating tokens) still re-evaluate per request and later sources still override earlier keys. Behavior note: mutating a plain static headers OBJECT after client creation is no longer picked up by later requests — that was never the documented dynamic mechanism; use the function-source form (`headers: () => ({...})`), which is unchanged.
  - `HttpResponsePromise` is now a prototype-based thenable class instead of `Object.assign`ing decoders onto the live promise (a measured ~260ns/request shape-transition penalty). `await`, `.then`/`.catch`/`.finally` chaining, and `Promise.all` behave identically; the one observable difference is `p instanceof Promise` → `false` (never part of the documented contract — the contract is the `HttpResponsePromise` interface, and `.then()` still returns a real native promise).
  - The no-signal/no-timeout request path reuses one frozen linked-signal constant, and the no-meta case allocates a bare `{}` instead of double-spreading empty objects.

- [#3772](https://github.com/pyreon/pyreon/pull/3772) [`164c48a`](https://github.com/pyreon/pyreon/commit/164c48a564656bc0aec9e94fc20b44c28aad28e7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Settle stream cancellation even when transports or asynchronous parsers ignore abort, release unused signal listeners and late response bodies, and scan chunked rows in linear work. Correct SSE control-only IDs, empty-ID resets, retry fields, filtered-event retry recovery, and terminal no-body responses on web, Swift and Kotlin.

- [#3061](https://github.com/pyreon/pyreon/pull/3061) [`b81dc7c`](https://github.com/pyreon/pyreon/commit/b81dc7cade1eca1fd0e5673e27587b72680fc2c3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update the benchmark's `ky` comparison arm from 1.x to 2.0.2 (devDependency
  only — `ky` is a head-to-head competitor in `bench/http-bench.ts`, not a runtime
  dependency of `@pyreon/http`).

  v2 renames `prefixUrl` → `prefix` and unifies every hook around a single state
  object, so the bench's `afterResponse` moves from `(request, options, response)`
  to `({ response })`.

- [#3674](https://github.com/pyreon/pyreon/pull/3674) [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Documentation-only: filled in manifest `api[]` gaps against each package's real `src/index.ts` exports. No runtime behavior changes.

  Notable additions: `@pyreon/hooks`'s 10 web-half hooks that had no manifest entry (`useGeolocation`, `useMap`, `useWebSocket`, `useAuth`, `usePush`, `usePayments`, `useDatabase`, `useCrashReporter`, `useAppState`, `setCrashTransport`); `@pyreon/http`'s typed error hierarchy, URL/transport utilities, and `defineEndpoint`; `@pyreon/router`'s active-router, link-classification, redirect-safety, and loader-serialization utilities; `@pyreon/reactivity`'s `registerSingleton`/context-owner APIs and `defineCrossModuleState`; `@pyreon/core`'s `Defer`, `registerErrorHandler`/`reportError`, `isClient`/`isServer`; `@pyreon/zero`'s theme system, locale runtime, `Meta`, typed-routes codegen, and `generateRssFeed`; `@pyreon/zero-content`'s remaining docs components (`Details`, `Tabs`, `PropTable`, `APICard`, `CompatMatrix`, `PackageBadge`, `Mermaid`, `Math`, `Sidebar`, `Breadcrumbs`, `PrevNext`, `Toc`, `Playground`, `Search`/`useSearch`, `getEntry`/`getEntries`); `@pyreon/form`'s `<Form>`/`<Submit>` components; smaller additions to `@pyreon/store`, `@pyreon/validate`, `@pyreon/validation`, `@pyreon/a11y`, `@pyreon/i18n`, `@pyreon/code`, `@pyreon/feature`, `@pyreon/charts`, `@pyreon/hotkeys`, `@pyreon/virtual`, `@pyreon/sync`, and `@pyreon/server`.

  Also corrected an inaccurate claim in `@pyreon/zero`'s `i18nRouting` manifest entry: it said components read the detected locale via `createLocaleContext`, but nothing in the framework reads `req.__localeContext` back out today — the working app-facing API is `useLocale()`/`setLocale()`. Verified `@pyreon/reactivity`'s `onCleanup` documentation is accurate (not outdated as initially suspected) via `effect.test.ts`'s explicit "onCleanup outside an effect is a silent no-op" test.

  `packages/tools/mcp/src/api-reference.ts` is the generated output of `bun run gen-docs` reflecting the above.

- [#3740](https://github.com/pyreon/pyreon/pull/3740) [`ea12a88`](https://github.com/pyreon/pyreon/commit/ea12a887e736882b5019388ad0c61ba0d1e1490c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native streams behave like the web in three more places.

  - `@pyreon/http` native runtime (Kotlin): the stream loop reads on its own thread but no longer writes from it. Every state write (`events`, `latest`, `status`, `error`) and every `onEvent` call is handed to a main executor — the emit passes `PyreonStreamMain`, the Android main looper (new `PyreonStreamAndroid.kt`) — so `onEvent` code touching main-bound state behaves as it does on the web, where the whole hook runs on one thread. Each queued write re-checks that its stream is still the live one, so a write queued before `stop()` / `idle()` / `abort()` can no longer land after it. On Swift the loop already ran on the main actor; the loop parity test now asserts it.
  - `@pyreon/native-runtime-swift` / `@pyreon/native-runtime-kotlin`: `PyreonJSON.stringify` / `PyreonJson.stringify` write exactly the bytes the web's `JSON.stringify` writes for the same value — keys in source order (Swift's `JSONEncoder` did not keep it), numbers laid out by ECMAScript's `Number::toString` (`1`, not `1.0`; `1e+21`; `-0` → `0`; `NaN` → `null`), and strings escaped as `JSON.stringify` escapes them (no `\/`).
  - `@pyreon/native-compiler`: `JSON.stringify(x)` lowers to those, so a stream's runtime `json` body (and every other stringified value) is byte-identical across web, iOS and Android. The Kotlin `useStream` emit passes `main = PyreonStreamMain`.
  - `@pyreon/lathe`: a stream-only non-GET operation with a JSON body (or none) now reaches native as a TRIGGERED `<Op>Stream` component — `enabled: boolean` opens the stream while true, the body is the `json` prop — the `useStream(src, { enabled })` + runtime `json` shape the native compiler lowers. A form / multipart / text / binary body, or a path parameter named `enabled` / `json` / `children`, stays web and the reach report says which.
  - `@pyreon/query`: the `useStream` manifest entry records the main-thread `onEvent` and the byte-identical body.

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

- Updated dependencies [[`443a646`](https://github.com/pyreon/pyreon/commit/443a646875093e1987fbf4be56ffac934ba60c17), [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`b1f9914`](https://github.com/pyreon/pyreon/commit/b1f991412dbd53cb2e943678aadbe89a6dfdb513), [`e56b865`](https://github.com/pyreon/pyreon/commit/e56b865f08946b7f848906bf2562911fa7f95066), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`cf64ac7`](https://github.com/pyreon/pyreon/commit/cf64ac738115998ade80f3c8ed984a2d109cbc17)]:
  - @pyreon/validation@0.52.0

## 0.51.0

### Minor Changes

- New `@pyreon/http` package — the transport layer beneath `@pyreon/query`. (663ac5a)

  It owns how a request is made (URL building, path params, query encoding, headers, body, cancellation, typed errors, optional response validation) and deliberately owns no cache, no dedup-by-key and no reactive container, because `@pyreon/query`, `useFetch` and `createResource` already do. That split mirrors the one the native runtime already made, where `PyreonFetch` is the reactive result container and `PyreonHttp` the request/response layer beneath it.

  The core has zero dependencies. Each capability lives behind its own entry so an unused one costs nothing: `@pyreon/http/middleware` (`retry`, `dedupe`, `bearer`, `refresh`, `logger`, `forwardHeaders`), `@pyreon/http/schema` (Standard Schema validation), `@pyreon/http/query` (TanStack adapters), `@pyreon/http/mock` (network-free mocking) and `@pyreon/http/server` (per-request SSR context, the only `node:async_hooks` import).

  Middleware is onion-shaped — `(request, next) => response` — because that is the only form in which retry, auth-refresh and short-circuiting are ordinary middleware; an axios-style interceptor pair cannot re-enter the chain. Clients are immutable: `extend()` returns a new instance, so no mutable shared default can leak across concurrent SSR requests. Response validation is three tiers, and only the third costs a dependency: an unchecked cast, any `(raw: unknown) => T` parse function, or any Standard Schema (zod, valibot, arktype, `@pyreon/validate`'s `s`, and `@pyreon/validation`'s typed adapters). `endpoint('GET /users/:id', { response })` derives the callable, a stable cache key and the response type from one declaration, so `queryKey` and URL cannot drift; `.query()` forwards TanStack's `AbortSignal`.

  Defaults are chosen against real failure modes: a 30s timeout is ON because `fetch` has none and a hung request otherwise never settles, while retry is OFF because it compounds with query's own retry into nine requests per logical query.

  `@pyreon/lint` gains three opt-in, dependency-gated rules and a new `http` category: `pyreon/query-fn-must-forward-signal` (a `queryFn` that performs a request but drops the `AbortSignal`, which silently disables cancellation), `pyreon/no-unencoded-path-interpolation` (interpolating into a path skips URL encoding, so a value containing `/` escapes its segment) and `pyreon/no-untimed-raw-fetch` (a raw `fetch` with no signal has no deadline).

### Patch Changes

- Every package manifest now declares its MULTIPLATFORM story as data: (4e53471)
  `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
  (a discriminated union — `web-only` REQUIRES the rationale sentence). The
  assignments transcribe the classification the multiplatform docs and the PMTC
  compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
  `check-multiplatform-tier` gate (validate-fast family) holds the contract:
  a manifest without a tier, a published package with neither manifest nor
  explicit exemption, a `web-only` without a rationale, or a stale generated
  tier table all fail CI — so a new package can never again silently default
  to web-only while the ecosystem advertises "one codebase, three targets".

  No runtime change in any package: manifests are docs-pipeline inputs and are
  stripped from published tarballs; every generated surface (llms, MCP
  api-reference, reference pages) is byte-identical.

- Updated dependencies:
  - @pyreon/validation@0.51.0
