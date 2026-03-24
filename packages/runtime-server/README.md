# @pyreon/runtime-server

Server-side rendering for Pyreon. Renders VNode trees to HTML strings or Web-standard `ReadableStream` chunks with Suspense streaming support.

## Install

```bash
bun add @pyreon/runtime-server
```

## Quick Start

```tsx
import { renderToString } from "@pyreon/runtime-server"

function App() {
  return <h1>Hello from SSR</h1>
}

const html = await renderToString(<App />)
// "<h1>Hello from SSR</h1>"
```

## API

### `renderToString(vnode)`

Render a VNode tree to a complete HTML string. Returns `Promise<string>`. Async components are awaited. Each call gets an isolated context stack.

### `renderToStream(vnode)`

Render a VNode tree to a `ReadableStream<string>` for progressive HTML streaming. Synchronous subtrees are flushed immediately. Suspense boundaries are streamed out-of-order: the fallback is emitted first, then resolved children are sent as `<template>` elements with inline swap scripts.

```tsx
import { renderToStream } from "@pyreon/runtime-server"

const stream = renderToStream(<App />)
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

### `configureStoreIsolation(registryProvider)`

Wire up per-request store isolation for concurrent SSR. Call once at server startup with a function that hooks your store registry into the request-scoped `AsyncLocalStorage`. Prevents store state from leaking between requests.

```ts
import { configureStoreIsolation } from "@pyreon/runtime-server"

configureStoreIsolation(provider => {
  // Wire your store registry to use the per-request provider
})
```

## Behavior Notes

- Signal accessors are called synchronously to snapshot their current value. No effects are created on the server.
- Async component functions (`async function Component()`) are fully supported.
- Context isolation uses `AsyncLocalStorage` internally. Each `renderToString` and `renderToStream` call gets its own context stack.
- HTML output is escaped. Event handlers (`on*`) are omitted. URL attributes are sanitized against `javascript:` and `data:` URIs.
