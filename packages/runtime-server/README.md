# @pyreon/runtime-server

Server-side rendering for Pyreon. Renders VNode trees to HTML strings or Web-standard `ReadableStream` chunks with Suspense streaming support.

## Install

```bash
bun add @pyreon/runtime-server
```

## Quick Start

```ts
import { renderToString } from "@pyreon/runtime-server"
import { h } from "@pyreon/core"

function App() {
  return h("h1", null, "Hello from SSR")
}

const html = await renderToString(h(App, null))
// "<h1>Hello from SSR</h1>"
```

## API

### `renderToString(vnode)`

Render a VNode tree to a complete HTML string. Returns `Promise<string>`. Async components are awaited. Each call gets an isolated context stack.

### `renderToStream(vnode)`

Render a VNode tree to a `ReadableStream<string>` for progressive HTML streaming. Synchronous subtrees are flushed immediately. Suspense boundaries are streamed out-of-order: the fallback is emitted first, then resolved children are sent as `<template>` elements with inline swap scripts.

```ts
import { renderToStream } from "@pyreon/runtime-server"

const stream = renderToStream(h(App, null))
return new Response(stream, {
  headers: { "Content-Type": "text/html" },
})
```

### `runWithRequestContext(fn)`

Run an async function with a fresh, isolated context stack and store registry. Useful for calling Pyreon APIs (e.g. `useHead`, route loader prefetching) outside of `renderToString` while maintaining per-request isolation.

```ts
import { runWithRequestContext } from "@pyreon/runtime-server"

const result = await runWithRequestContext(async () => {
  // Pyreon context and stores are isolated to this call
  return await prefetchLoaderData(url)
})
```

### `configureStoreIsolation(setStoreRegistryProvider)`

Wire up per-request `@pyreon/store` isolation for concurrent SSR. Call once at server startup. Prevents store state from leaking between requests.

```ts
import { setStoreRegistryProvider } from "@pyreon/store"
import { configureStoreIsolation } from "@pyreon/runtime-server"

configureStoreIsolation(setStoreRegistryProvider)
```

## Behavior Notes

- Signal accessors are called synchronously to snapshot their current value. No effects are created on the server.
- Async component functions (`async function Component()`) are fully supported.
- Context isolation uses `AsyncLocalStorage` internally. Each `renderToString` and `renderToStream` call gets its own context stack.
- HTML output is escaped. Event handlers and custom directives (`on*`, `n-*`) are omitted. URL attributes are sanitized against `javascript:` and `data:` URIs.
