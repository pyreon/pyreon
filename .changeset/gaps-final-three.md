---
'@pyreon/runtime-server': minor
'@pyreon/zero': minor
---

feat: close the three deferred SSR/ISR gaps from the deep-analysis pass

Three independent fixes that close gaps explicitly deferred in earlier
PRs (#738/#740/#742/#744) but called out as required by the goal-hook.

### 1. `renderToStream(root, { signal })` — AbortSignal threading

`renderToStream` now accepts `{ signal?: AbortSignal }`. The internal
controller forwards client-disconnect (`ReadableStream.cancel()`) AND
upstream aborts to a shared signal; the drain loop races each pending
Suspense batch against the abort-promise so the stream closes promptly
when the consumer hangs up. Per-boundary resolvers check
`ctx.signal.aborted` before enqueueing post-resolve HTML.

Before: a client navigating mid-stream left in-flight Suspense work
awaited server-side until its 30s timeout. Wasted CPU per dropped
connection.

After: cancellation propagates within ms; pending boundaries skip the
swap. Tests (`tests/integration.test.ts`): upstream-abort skips
post-resolve enqueue, pre-aborted signal still emits sync portion,
`ReadableStream.cancel()` closes the stream within 100ms (well under
the 200ms test boundary's pending work).

### 2. `ISRConfig.revalidateRequest` — auth-gated revalidation hook

New optional `(req: Request) => Request | null`. Lets auth-gated
`cacheKey` setups scope revalidation explicitly:

- Return a custom `Request` (e.g. stripped cookies for anonymous
  revalidation) — used in place of the original.
- Return `null` — SKIP revalidation entirely for this entry (stale
  stays stale until next live request).

Closes the footgun where the default behaviour re-uses the original
user's cookies for the background revalidation — if the session has
expired since cache-write, the new render may misbehave or embed
stale auth data. Tests: 2 specs covering null=skip and custom-request
scrubbing cookies.

### 3. Cloudflare `_worker.js` runtime-contract gate

New regression assertion in `adapters.test.ts` cloudflare suite: the
emitted `_worker.js` MUST contain none of `node:` imports / `fs` /
`path` / `__dirname` / `__filename` / `fileURLToPath` / `Buffer` /
`process.env`. Locks the Web-standard runtime contract — any future
template change that accidentally grows a Node API fails CI here
instead of 500ing in production on Cloudflare Workers (which doesn't
expose those APIs without the `nodejs_compat` flag).

The `node:fs/promises` / `node:path` USE inside cloudflare.ts itself
is build-time-only (runs in Node during `vite build`) and is
unaffected — this check covers the EMITTED file.

### Net diff

+220 / -10 lines (impl + 5 new tests + JSDoc + changeset). All
existing suites pass unchanged: runtime-server 35+ tests, zero ISR
15/15, adapters 37/37, typecheck + lint + build clean across both
packages, gen-docs + check-doc-claims green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
