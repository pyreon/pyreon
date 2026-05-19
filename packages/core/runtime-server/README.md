# @pyreon/runtime-server

VNode → HTML renderer with progressive streaming and per-request `AsyncLocalStorage` isolation.

Walks a VNode tree and produces an HTML string or a Web-standard `ReadableStream` of chunks. Signal accessors are called synchronously to snapshot their current value — there is no reactivity on the server. `renderToStream` flushes progressively and resolves Suspense boundaries out-of-order (fallback first, then a `<template>` + inline swap script). Every `renderToString` / `renderToStream` / `runWithRequestContext` call runs in its own ALS store so concurrent requests never share `provide()` frames; `configureStoreIsolation()` extends the same isolation to the `@pyreon/store` registry. Most apps consume this transitively through `@pyreon/server.createHandler` or `@pyreon/zero` rather than calling directly.

## Install

```bash
bun add @pyreon/runtime-server @pyreon/core @pyreon/reactivity
```

## Quick start

```ts
import {
  renderToString, renderToStream, runWithRequestContext, configureStoreIsolation,
} from '@pyreon/runtime-server'
import { setStoreRegistryProvider } from '@pyreon/store'

// Once at server startup — wire per-request store isolation:
configureStoreIsolation(setStoreRegistryProvider)

// One-shot HTML
const html = await renderToString(<App />)

// Progressive stream
return new Response(renderToStream(<App />), {
  headers: { 'content-type': 'text/html' },
})

// Pre-fetch loader data + render, all under one isolated request context
const html = await runWithRequestContext(async () => {
  await prefetchLoaderData(router, url.pathname, request)
  return renderToString(<App />)
})
```

## renderToString

```ts
const html = await renderToString(vnode): Promise<string>
```

One-shot HTML. Awaits async components. Each call gets its own context stack — no cross-request leakage even under high concurrency. Returns the complete document fragment for the rendered tree (the surrounding `<!doctype html>` shell is your responsibility).

## renderToStream

```ts
const stream = renderToStream(vnode): ReadableStream<string>
```

Progressive flush. Synchronous subtrees stream as soon as they're rendered. `<Suspense>` boundaries are streamed **out-of-order**: the fallback is emitted in-place, and when the async work resolves the resolved children arrive later as a `<template>` element followed by an inline `<script>` that swaps the template into the original slot. The browser parses both inline-and-resolved without needing a second request.

```ts
return new Response(renderToStream(<App />), {
  headers: { 'content-type': 'text/html; charset=utf-8' },
})
```

**30-second Suspense timeout**: if a boundary hasn't resolved within 30 seconds, the fallback stays in place forever and a dev-mode warning fires. No error is thrown — the stream completes cleanly with the fallback persisted.

## Per-request context isolation

Pyreon's `provide()` / `useContext` use a module-level context stack at runtime — fine for a browser process with one document. On the server, concurrent requests would share that stack. `runtime-server` wraps each render in an `AsyncLocalStorage` store, so every `renderToString` / `renderToStream` / `runWithRequestContext` call gets its own isolated context frames.

```ts
// Outside any render? Use runWithRequestContext to isolate manual API calls
await runWithRequestContext(async () => {
  router.preload(pathname, request)
  return renderToString(<App />)
})
```

## Store isolation

```ts
import { configureStoreIsolation } from '@pyreon/runtime-server'
import { setStoreRegistryProvider } from '@pyreon/store'

configureStoreIsolation(setStoreRegistryProvider) // once at startup
```

Without this call, the `@pyreon/store` registry is a process-global singleton — concurrent requests would share defined stores. `configureStoreIsolation` plumbs the registry through the same ALS, so each request gets its own store map. **Call once at startup**, not per request. Skip this if you don't use `@pyreon/store`.

## SSR-safe contracts the renderer enforces

- **No reactivity.** Signal accessors are snapshotted at render time. No effects are created on the server. `useHead`, `useStore`, and similar APIs run their setup once and read the resulting value.
- **HTML escape + URL sanitization.** All text content is escaped. URL attributes (`href`, `src`, `action`, `formaction`) reject `javascript:` and `data:` URIs by default.
- **Event handlers omitted.** `on*` props are stripped from the output — the server can't bind them. Hydration on the client wires them up.
- **`<For>` key markers** (`<!--k:KEY-->`) are URL-encoded so user-controlled keys cannot break out of the HTML comment. Companion `decodeKeyFromMarker(comment)` helper available for hydration / devtools consumers.
- **Compiler-emitted reactive props** are resolved via `makeReactiveProps` before each component invocation — parity with the CSR mount.ts path. SSR-rendered HTML matches what the client would render.

## When to use this directly

Most Pyreon apps use:

- **`@pyreon/server.createHandler`** — full SSR request handler with loader prefetching, error handling, head injection
- **`@pyreon/zero`** — full meta-framework wrapping the above plus routing, SSG, ISR

Use `@pyreon/runtime-server` directly when you need to:

- Render a fragment for a non-page response (RSS feed, OG image SVG, email body)
- Compose your own custom SSR pipeline outside of `@pyreon/server`
- Generate static HTML at build time without an HTTP layer

## Dev-mode gates

Server packages use `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` for dev-only diagnostics — the server-runtime convention. Server code doesn't go through Vite's bundle-time replacement (it runs in Node at startup), so the typeof guard reads correctly at runtime.

## Documentation

Full docs: [docs.pyreon.dev/docs/runtime-server](https://docs.pyreon.dev/docs/runtime-server) (or `docs/docs/runtime-server.md` in this repo).

## License

MIT
