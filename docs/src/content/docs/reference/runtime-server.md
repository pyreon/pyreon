---
title: "SSR Renderer — API Reference"
description: "SSR/SSG VNode→HTML renderer — renderToString, renderToStream (out-of-order Suspense), per-request ALS context/store isolation"
---

# @pyreon/runtime-server — API Reference

> **Generated** from `runtime-server`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [runtime-server](/docs/runtime-server).

Pyreon's server-side renderer: walks a VNode tree and produces HTML. Signal accessors are called synchronously to SNAPSHOT their current value — no effects, no reactivity on the server (reactivity resumes post-hydration on the client). Async component functions are awaited. `renderToStream` flushes progressively and resolves Suspense boundaries out-of-order (fallback first, then a `<template>` + inline swap script). Concurrency-safe: every `renderToString` / `renderToStream` / `runWithRequestContext` call runs in its own `AsyncLocalStorage` store so concurrent requests never share context frames; `configureStoreIsolation()` extends the same isolation to the `@pyreon/store` registry. Most apps consume this transitively through `@pyreon/server` (`createHandler` / `prerender`) rather than calling it directly.

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`renderToString`](#rendertostring) | function | Render a VNode tree to a single HTML string. |
| [`renderToStream`](#rendertostream) | function | Render to a Web-standard `ReadableStream<string>` with true progressive flushing — synchronous subtrees enqueue immediat |
| [`runWithRequestContext`](#runwithrequestcontext) | function | Run an async function inside a fresh, isolated ALS context stack (and store registry, if `configureStoreIsolation` was c |
| [`configureStoreIsolation`](#configurestoreisolation) | function | Opt in to per-request `@pyreon/store` isolation. |
| [`decodeKeyFromMarker`](#decodekeyfrommarker) | function | Inverse of the internal For-list key encoder. |

## API

### renderToString `function`

```ts
renderToString(root: VNode | null): Promise<string>
```

Render a VNode tree to a single HTML string. Each call runs in a fresh isolated ALS context stack (and store registry if `configureStoreIsolation` was called) so concurrent requests never bleed `provide()` frames into each other. Signal accessors are invoked synchronously to snapshot their CURRENT value — there is no reactivity on the server, so a `<div>{count()}</div>` renders the value at render time and only becomes live after client hydration. Async component functions (`async function C()`) are awaited before the walk continues. Returns the empty string for a `null` root.

**Example**

```tsx
import { renderToString } from "@pyreon/runtime-server"

const html = await renderToString(<App />)
```

**Common mistakes**

- Expecting signal writes after `renderToString` to change the output — SSR is one-shot; the string is already produced. Reactivity is a post-hydration (client) concern
- Calling Pyreon context APIs (`useHead`, loaders) OUTSIDE `renderToString` and expecting per-request isolation — use `runWithRequestContext` for that; bare calls share the fallback stack across concurrent requests
- Reaching for `renderToString` directly when you have an HTTP handler — the `createHandler` in `@pyreon/server` wraps it with template precompilation, middleware, and loader-data injection; prefer that for request handling

**See also:** `renderToStream` · `runWithRequestContext`

---

### renderToStream `function`

```ts
renderToStream(root: VNode | null, options?: { signal?: AbortSignal; suspenseTimeoutMs?: number }): ReadableStream<string>
```

Render to a Web-standard `ReadableStream<string>` with true progressive flushing — synchronous subtrees enqueue immediately, async component boundaries are awaited in order. Suspense boundaries stream OUT OF ORDER: the fallback is emitted inline at once, and the resolved children arrive later as a `<template>` + a tiny inline swap `<script>` that replaces the placeholder client-side — without blocking the rest of the page. Each call gets its own isolated ALS context stack. A Suspense boundary that does not resolve within the per-boundary timeout (default 30_000 ms, configurable via `options.suspenseTimeoutMs`; pass `Infinity` to disable) leaves its fallback in place and a dev-mode warning fires; a boundary that throws also leaves the fallback (no swap script emitted). Pass `options.signal` (e.g. `Request.signal`) to abort pending Suspense work when the consumer disconnects.

**Example**

```tsx
import { renderToStream } from "@pyreon/runtime-server"

return new Response(renderToStream(<App />, {
  signal: req.signal,
  suspenseTimeoutMs: 5_000, // ops-controlled per-boundary cap
}), {
  headers: { "content-type": "text/html" },
})
```

**Common mistakes**

- Assuming Suspense children arrive in source order — they are swapped in as each boundary resolves; the fallback ships first, resolved content can arrive in any order
- Expecting `@pyreon/head` tags registered inside a Suspense child to reach the document `<head>` — the head is flushed in the shell BEFORE any boundary resolves, so async-loaded data does not contribute to it
- Treating a timed-out boundary as an error — by design the fallback simply stays; only a dev-mode `console.warn` signals it. Tune `options.suspenseTimeoutMs` to match your SLA (5_000–10_000 typical for user-facing apps; `Infinity` to disable entirely for export jobs / reports)
- Buffering the whole stream before responding — that throws away the progressive-flush benefit; pass the stream straight into the `Response`
- Forgetting `signal: req.signal` — without it, in-flight Suspense work keeps running (and tries to write to a closed stream) after the consumer disconnects

**See also:** `renderToString`

---

### runWithRequestContext `function`

```ts
runWithRequestContext<T>(fn: () => Promise<T>): Promise<T>
```

Run an async function inside a fresh, isolated ALS context stack (and store registry, if `configureStoreIsolation` was called). Use this when you need to call Pyreon context-aware APIs — `useHead`, `prefetchLoaderData`, router resolution — OUTSIDE a `renderToString` / `renderToStream` call but still want per-request isolation. Without it those calls land on a process-global fallback stack shared by every concurrent request.

**Example**

```tsx
import { runWithRequestContext } from "@pyreon/runtime-server"

const data = await runWithRequestContext(async () => {
  await prefetchLoaderData(router, url.pathname, request)
  return renderToString(<App />)
})
```

**Common mistakes**

- Calling `prefetchLoaderData` / `useHead` before `renderToString` WITHOUT wrapping the whole sequence in one `runWithRequestContext` — the prefetch lands in a different (or the shared fallback) context than the render, so the render sees no loader data
- Wrapping a synchronous function — the signature is `() => Promise<T>`; return the promise (or make the fn `async`) so the ALS scope spans the awaited work

**See also:** `renderToString` · `configureStoreIsolation`

---

### configureStoreIsolation `function`

```ts
configureStoreIsolation(setStoreRegistryProvider: (fn: () => Map<string, unknown>) => void): void
```

Opt in to per-request `@pyreon/store` isolation. Call ONCE at server startup, passing `@pyreon/store`'s `setStoreRegistryProvider`. After this, every `renderToString` / `renderToStream` / `runWithRequestContext` call gets its own fresh store registry via ALS. WITHOUT calling it, store isolation is a no-op and all concurrent requests share ONE process-global store registry — request A's `defineStore` state is visible to request B (SSR state bleed across users).

**Example**

```tsx
import { configureStoreIsolation } from "@pyreon/runtime-server"
import { setStoreRegistryProvider } from "@pyreon/store"

// once, at server startup:
configureStoreIsolation(setStoreRegistryProvider)
```

**Common mistakes**

- Not calling it at all in an SSR app that uses `@pyreon/store` — concurrent requests share one global registry, so one request’s store state leaks into another request’s render
- Calling it per request instead of once at startup — it only needs to wire the provider once; the per-request fresh `Map` is handled internally by the ALS run
- Passing something other than the `setStoreRegistryProvider` exported by `@pyreon/store` — the contract is specifically that provider-setter shape

**See also:** `runWithRequestContext` · `renderToString`

---

### decodeKeyFromMarker `function`

```ts
decodeKeyFromMarker(encoded: string): string
```

Inverse of the internal For-list key encoder. `<For>` SSR emits per-item `<!--k:KEY-->` markers; the encoder URL-encodes the key and replaces every `-` with `%2D` so a user-supplied key can never form `-->` and break out of the HTML comment (an injection vector). `decodeKeyFromMarker` reverses that. Not used by the runtime today (hydration does not read per-item markers) — shipped alongside the encoder so future hydration or devtools consumers decode symmetrically without re-deriving the scheme.

**Example**

```tsx
import { decodeKeyFromMarker } from "@pyreon/runtime-server"

decodeKeyFromMarker("a%2Db") // "a-b"
```

**Common mistakes**

- Assuming the runtime consumes this — it does not yet; it exists for forward-compat / devtools symmetry with the marker encoder

---

## Package-level notes

> **No reactivity on the server:** Signal accessors are called synchronously to snapshot their value — no effects are created. A `{count()}` expression renders the value at render time; it only becomes live after client hydration. SSR is one-shot.

> **Usually consumed via @pyreon/server:** `createHandler` (SSR HTTP) and `prerender` (SSG) in `@pyreon/server` wrap this renderer with template precompilation, middleware, and loader-data injection. Call `renderToString` / `renderToStream` directly only for custom integrations; for request handling prefer `@pyreon/server`.

> **Server dev-gate convention:** As a server package, `@pyreon/runtime-server` correctly uses `typeof process !== "undefined" && process.env.NODE_ENV !== "production"` for its dev-mode perf-counter sink — NOT the browser `import.meta.env.DEV` form. It always runs in Node/Bun where `process` is real.
