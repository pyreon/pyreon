---
title: "@pyreon/runtime-server"
description: SSR and SSG renderer that walks VNode trees and produces HTML strings or streams.
---

`@pyreon/runtime-server` is Pyreon's server-side rendering (SSR) and static site generation (SSG) renderer. It walks VNode trees and produces HTML strings or streams. Signal accessors are called synchronously to snapshot their current value -- no effects are set up on the server. Async components are fully supported.

The package provides four exports:

- **`renderToString`** -- render a VNode tree to a complete HTML string
- **`renderToStream`** -- render a VNode tree to a `ReadableStream<string>` with progressive streaming and out-of-order Suspense
- **`runWithRequestContext`** -- run an async function with a fresh, isolated context and store registry
- **`configureStoreIsolation`** -- enable per-request store isolation for concurrent SSR

<PackageBadge name="@pyreon/runtime-server" href="/docs/runtime-server" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/runtime-server
```

```bash [bun]
bun add @pyreon/runtime-server
```

```bash [pnpm]
pnpm add @pyreon/runtime-server
```

```bash [yarn]
yarn add @pyreon/runtime-server
```

:::

You will also need `@pyreon/core` for creating VNodes:

::: code-group

```bash [npm]
npm install @pyreon/core
```

```bash [bun]
bun add @pyreon/core
```

```bash [pnpm]
pnpm add @pyreon/core
```

```bash [yarn]
yarn add @pyreon/core
```

:::

---

## renderToString

Render a VNode tree to a complete HTML string. Returns a `Promise<string>` because it supports async component functions -- the renderer will `await` them before continuing the tree walk.

### Basic Usage

```tsx
import { renderToString } from "@pyreon/runtime-server";
import { h } from "@pyreon/core";

const html = await renderToString(<div class="greeting">Hello, world!</div>);
// => '<div class="greeting">Hello, world!</div>'
```

### Rendering a Component Tree

```tsx
import { renderToString } from "@pyreon/runtime-server";
import { h } from "@pyreon/core";
import { App } from "./App";

const html = await renderToString(<App />);

res.setHeader("Content-Type", "text/html");
res.end(`
  <!DOCTYPE html>
  <html>
    <head><meta charset="UTF-8" /><title>My App</title></head>
    <body><div id="app">${html}</div></body>
  </html>
`);
```

### Rendering null

Passing `null` returns an empty string immediately:

```ts
const html = await renderToString(null);
// => ''
```

### How renderToString Works

The renderer walks the VNode tree recursively and handles each node type:

| Node Type                       | Behavior                                                    |
| ------------------------------- | ----------------------------------------------------------- |
| `null`, `false`                 | Returns empty string                                        |
| `string`                        | HTML-escaped and output directly                            |
| `number`, `boolean`             | Converted to string via `String()`                          |
| `Array`                         | Each child rendered in parallel via `Promise.all`           |
| `Fragment`                      | Children rendered directly (no wrapper element)             |
| DOM element                     | Opening tag with attributes, children, closing tag          |
| Component function              | Called with props, output rendered recursively              |
| Async component                 | Awaited, then rendered recursively                          |
| `For` list                      | Items rendered with hydration markers (`<!--pyreon-for-->`) |
| Reactive accessor `() => value` | Called synchronously to snapshot the current value          |

### Context Isolation

Each `renderToString` call runs in its own `AsyncLocalStorage` store with a fresh context stack. Concurrent requests never share context frames, making it safe for multi-request server environments.

```tsx
// These two renders run concurrently -- their contexts are completely isolated
app.get("/page-a", async (req, res) => {
  const html = await renderToString(<PageA />);
  res.end(html);
});

app.get("/page-b", async (req, res) => {
  const html = await renderToString(<PageB />);
  res.end(html);
});
```

Even with 50+ concurrent requests and async components that resolve in unpredictable order, each render sees only its own context values:

```tsx
import { createContext, provide, useContext } from "@pyreon/core";

const RequestIdCtx = createContext("none");

async function AsyncReader(props: { delay: number }) {
  await new Promise((r) => setTimeout(r, props.delay));
  const id = useContext(RequestIdCtx);
  return <span>{id}</span>;
}

function RequestWrapper(props: { reqId: string; delay: number }) {
  provide(RequestIdCtx, props.reqId);
  return <AsyncReader delay={props.delay} />;
}

// All 50 renders see their own reqId, even with random delays
const results = await Promise.all(
  Array.from({ length: 50 }, (_, i) =>
    renderToString(<RequestWrapper reqId={`req-${i}`} delay={Math.random() * 20} />),
  ),
);
// results[0] contains "req-0", results[1] contains "req-1", etc.
```

### Async Component Support

Async components (components that return a `Promise<VNode>`) are fully supported. The renderer awaits each async component before continuing:

```tsx
async function UserProfile(props: { userId: string }) {
  const user = await fetchUser(props.userId);
  return (
    <div class="profile">
      <h1>{user.name}</h1>
      <p>{user.bio}</p>
    </div>
  );
}

const html = await renderToString(<UserProfile userId="123" />);
```

### For List Rendering

The `For` component renders list items with hydration markers so the client can claim existing DOM nodes during hydration:

```tsx
import { For, h } from "@pyreon/core";
import { signal } from "@pyreon/reactivity";

const items = signal(["apple", "banana", "cherry"]);

const vnode = For({
  each: () => items(),
  by: (item) => item,
  children: (item) => <li>{item}</li>,
});

const html = await renderToString(vnode);
// => '<!--pyreon-for--><li>apple</li><li>banana</li><li>cherry</li><!--/pyreon-for-->'
```

The `<!--pyreon-for-->` and `<!--/pyreon-for-->` markers are used by the client-side hydrator to match server-rendered list items with their reactive counterparts.

### Fragment Rendering

Fragments render their children without any wrapper element:

```tsx
import { Fragment, h } from "@pyreon/core";

const html = await renderToString(
  <>
    <span>a</span>
    <span>b</span>
  </>,
);
// => '<span>a</span><span>b</span>'
```

### Children Merging

When children are passed via `h(Component, props, child1, child2)`, they are merged into `props.children` automatically, matching the behavior of the client-side mount and hydrate functions:

```tsx
function Wrapper(props: { children: VNode }) {
  return <div class="wrapper">{props.children}</div>;
}

const html = await renderToString(
  <Wrapper>
    <span>child content</span>
  </Wrapper>,
);
// => '<div class="wrapper"><span>child content</span></div>'
```

Multiple children are passed as an array:

```tsx
function Layout(props: { children: VNode[] }) {
  return <div>{...props.children}</div>;
}

const html = await renderToString(
  <Layout>
    <header>Header</header>
    <main>Content</main>
  </Layout>,
);
```

If `props.children` is explicitly provided, it is not overridden by positional children.

---

## renderToStream

Render a VNode tree to a Web-standard `ReadableStream<string>` for progressive streaming. HTML is flushed to the client as soon as each node is ready.

### Basic Usage

```tsx
import { renderToStream } from "@pyreon/runtime-server";
import { h } from "@pyreon/core";
import { App } from "./App";

const stream = renderToStream(<App />);

return new Response(stream, {
  headers: { "Content-Type": "text/html" },
});
```

### Streaming Behavior

The streaming renderer has three distinct behaviors depending on the node type:

1. **Synchronous subtrees** -- opening tags, text content, and attributes are enqueued to the stream immediately as they are encountered
2. **Async component boundaries** -- awaited in document order; their output is enqueued as it resolves
3. **Suspense boundaries** -- streamed out-of-order; the fallback is emitted immediately, and the resolved children are sent later without blocking the rest of the page

The key advantage of streaming is that the browser can start parsing and rendering HTML before the entire page is ready. Opening tags are flushed before their children resolve:

```tsx
async function SlowChild() {
  await new Promise((r) => setTimeout(r, 1000));
  return <span>loaded</span>;
}

const stream = renderToStream(
  <div>
    <SlowChild />
  </div>,
);

// Stream chunks arrive as:
// 1. "<div>"        -- immediate
// 2. "<span>loaded</span>" -- after 1 second
// 3. "</div>"       -- after children complete
```

### Progressive Chunk Delivery

Each chunk is enqueued to the stream independently. The browser receives and renders content progressively:

```ts
const chunks: string[] = [];
const reader = stream.getReader();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
}

// chunks[0] === "<div>"
// chunks[1] === "<span>loaded</span>"
// chunks[2] === "</div>"
```

### Streaming null

Streaming `null` produces an empty stream that closes immediately:

```ts
const stream = renderToStream(null);
// Stream closes with no chunks
```

### Out-of-Order Suspense Streaming

This is the most powerful feature of `renderToStream`. When a `Suspense` boundary is encountered during streaming, the following sequence occurs:

**Step 1: Emit the swap helper script (once per stream)**

The first time a Suspense boundary is encountered, a small inline `<script>` is emitted that defines the `__NS` (Node Swap) function. This function replaces a placeholder element with the content from a `<template>` element:

```html
<script>
  function __NS(s, t) {
    var e = document.getElementById(s),
      l = document.getElementById(t);
    if (e && l) {
      e.replaceWith(l.content.cloneNode(!0));
      l.remove();
    }
  }
</script>
```

**Step 2: Emit the fallback with a placeholder ID**

The fallback UI is wrapped in a `<div>` with a unique ID and emitted immediately:

```html
<div id="pyreon-s-0">
  <p>Loading...</p>
</div>
```

**Step 3: Continue streaming the rest of the page**

Sibling and parent content continues streaming without waiting for the Suspense children to resolve. This means the user sees the rest of the page immediately.

**Step 4: Emit the resolved content as a template + swap**

Once the async children resolve, their HTML is buffered and then emitted as a `<template>` element followed by an inline script that performs the swap:

```html
<template id="pyreon-t-0"><div class="actual-content">Data loaded!</div></template>
<script>
  __NS("pyreon-s-0", "pyreon-t-0");
</script>
```

The browser executes the swap script immediately, replacing the fallback placeholder with the real content. No client-side JavaScript framework is needed for this swap -- it is pure DOM manipulation.

### Suspense Streaming Example

```tsx
import { renderToStream } from "@pyreon/runtime-server";
import { h, Suspense } from "@pyreon/core";

async function UserData() {
  const user = await fetchUser(); // takes 500ms
  return <div class="user">{user.name}</div>;
}

const stream = renderToStream(
  <div>
    <h1>Dashboard</h1>
    <Suspense fallback={<p>Loading user...</p>}>
      <UserData />
    </Suspense>
    <p>Footer content</p>
  </div>,
);
```

The stream produces chunks in this order:

1. `<div><h1>Dashboard</h1>` -- immediate
2. `<script>function __NS(s,t)&#123;...&#125;</script>` -- swap helper (first Suspense)
3. `<div id="pyreon-s-0"><p>Loading user...</p></div>` -- fallback placeholder
4. `<p>Footer content</p></div>` -- sibling content (not blocked!)
5. `<template id="pyreon-t-0"><div class="user">Alice</div></template>` -- resolved content
6. `<script>__NS("pyreon-s-0","pyreon-t-0")</script>` -- swap execution

The user sees "Dashboard", "Loading user...", and "Footer content" immediately. After 500ms, "Loading user..." is replaced with "Alice" -- all without a full-page JavaScript framework.

### Multiple Suspense Boundaries

Each Suspense boundary gets an incrementing ID. They resolve independently and in any order:

```tsx
const stream = renderToStream(
  <div>
    <Suspense fallback={<p>Loading A...</p>}>
      <SlowComponentA />
      {/* resolves in 200ms */}
    </Suspense>
    <Suspense fallback={<p>Loading B...</p>}>
      <SlowComponentB />
      {/* resolves in 100ms */}
    </Suspense>
  </div>,
);
```

- Placeholders: `pyreon-s-0` and `pyreon-s-1`
- Templates: `pyreon-t-0` and `pyreon-t-1`
- The `__NS` swap script is emitted only once (before the first placeholder)
- B may resolve before A -- each swap is independent

### Suspense in renderToString

When `Suspense` boundaries are encountered in `renderToString` (non-streaming), children are rendered synchronously through the Suspense component's normal resolution path. No placeholder/template/swap mechanism is used -- the result is a single complete HTML string.

### Context Inheritance in Suspense

Suspense boundary resolutions inherit the context stack from their parent scope. This means `useContext` calls inside async Suspense children see the correct per-request context values:

```tsx
const ThemeCtx = createContext("light");

function App() {
  provide(ThemeCtx, "dark");
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <AsyncContent />
      {/* useContext(ThemeCtx) returns "dark" */}
    </Suspense>
  );
}
```

---

## runWithRequestContext

Run an async function with a fresh, isolated context stack and store registry. This is useful when you need to call Pyreon APIs (such as `useHead` or `prefetchLoaderData`) outside of `renderToString` but still want per-request isolation.

### Basic Usage

```tsx
import { runWithRequestContext } from "@pyreon/runtime-server";

app.get("/page", async (req, res) => {
  const html = await runWithRequestContext(async () => {
    // Set up context, prefetch data, etc.
    await prefetchLoaderData(router, req.url);
    return renderToString(<App />);
  });
  res.end(html);
});
```

### Why Use runWithRequestContext?

`renderToString` already creates its own isolated context. However, there are cases where you need the isolation to begin before the render:

1. **Prefetching data** -- loader data must be prefetched in the same context that the render uses
2. **Setting up context providers** -- pushing context values before render
3. **Head management** -- collecting `<head>` tags across the render lifecycle

```tsx
import { runWithRequestContext, renderToString } from "@pyreon/runtime-server";
import { createRouter, prefetchLoaderData } from "@pyreon/router";
import { h } from "@pyreon/core";

app.get("*", async (req, res) => {
  const result = await runWithRequestContext(async () => {
    const router = createRouter({ routes, url: req.url });

    // Prefetch in the same context scope as the render
    await prefetchLoaderData(router, req.url);

    // Render in the same context scope
    const html = await renderToString(<App router={router} />);

    return { html, router };
  });

  res.end(`<!DOCTYPE html><html><body>${result.html}</body></html>`);
});
```

### Concurrent Isolation

Two concurrent `runWithRequestContext` calls are fully isolated, even with async operations and delays:

```ts
const [r1, r2] = await Promise.all([
  runWithRequestContext(async () => {
    pushContext(new Map([[Ctx.id, "ctx-A"]]));
    await new Promise((r) => setTimeout(r, 100));
    return useContext(Ctx); // "ctx-A"
  }),
  runWithRequestContext(async () => {
    pushContext(new Map([[Ctx.id, "ctx-B"]]));
    await new Promise((r) => setTimeout(r, 50));
    return useContext(Ctx); // "ctx-B"
  }),
]);
// r1 === "ctx-A", r2 === "ctx-B"
```

### Nesting with renderToString

You can nest `renderToString` inside `runWithRequestContext`. The render will use the outer context scope rather than creating a new one, since it is already running inside an `AsyncLocalStorage` context:

```tsx
const html = await runWithRequestContext(async () => {
  // Push context before render
  pushContext(new Map([[ThemeCtx.id, "dark"]]));

  // renderToString runs inside the existing context
  return renderToString(<App />);
});
```

---

## configureStoreIsolation

Wire up per-request store isolation for concurrent SSR. Call once at server startup. This ensures that `createStore` instances from `@pyreon/store` are isolated between concurrent requests, preventing data leaks.

### Basic Setup

```ts
import { configureStoreIsolation } from "@pyreon/runtime-server";
import { setStoreRegistryProvider } from "@pyreon/store";

// Call once at server startup:
configureStoreIsolation(setStoreRegistryProvider);
```

### How It Works

Without store isolation, all stores created via `createStore` are shared across all requests in the same Node.js process. This is fine for:

- Static site generation (SSG) where there is only one render at a time
- Development servers with sequential requests
- Single-request-at-a-time scenarios

But it is **required for concurrent SSR** where multiple requests are rendered simultaneously. Without it, store state from one request could leak into another.

When `configureStoreIsolation` is called, it sets up a second `AsyncLocalStorage` instance that provides a fresh `Map<string, unknown>` for each render call. Every `createStore` call during a render will register in that request-specific map rather than the global one.

### Full Server Setup with Store Isolation

```tsx
import express from "express";
import {
  renderToString,
  configureStoreIsolation,
  runWithRequestContext,
} from "@pyreon/runtime-server";
import { setStoreRegistryProvider } from "@pyreon/store";
import { h } from "@pyreon/core";
import { App } from "./App";

const app = express();

// Enable store isolation before any renders
configureStoreIsolation(setStoreRegistryProvider);

app.get("*", async (req, res) => {
  const html = await runWithRequestContext(async () => {
    return renderToString(<App />);
  });

  res.setHeader("Content-Type", "text/html");
  res.end(`<!DOCTYPE html>
    <html>
      <head><meta charset="UTF-8" /><title>My App</title></head>
      <body><div id="app">${html}</div></body>
    </html>`);
});

app.listen(3000);
```

### When Store Isolation is Not Active

If `configureStoreIsolation` is never called, the internal `withStoreContext` helper is a no-op -- it simply calls the function directly without wrapping it in an `AsyncLocalStorage` context. This means zero overhead for SSG or development builds that do not need isolation.

---

## Attribute Handling

The SSR renderer handles HTML attributes with specific rules for safety and correctness.

### Skipped Attributes (Client-Only)

These attributes are never emitted in server-rendered HTML:

| Attribute                | Reason                                         |
| ------------------------ | ---------------------------------------------- |
| `key`                    | Used by the client-side diffing algorithm only |
| `ref`                    | DOM element reference, client-only             |
| `onXxx` (event handlers) | Event listeners are attached on the client     |

### Reactive Props (Signal Snapshots)

When a prop value is a function (a reactive getter), it is called synchronously to snapshot the current value:

```tsx
import { signal } from "@pyreon/reactivity";

const count = signal(42);

const html = await renderToString(<span data-count={() => count()} />);
// => '<span data-count="42"></span>'
```

The same applies to reactive children:

```tsx
const name = signal("world");
const html = await renderToString(<p>{() => name()}</p>);
// => '<p>world</p>'
```

### Class Normalization

The `class` attribute accepts three formats:

**String:**

```tsx
<div class="foo bar" />
// => '<div class="foo bar"></div>'
```

**Array (falsy values filtered):**

```tsx
<div class={["foo", null, "bar", false, "baz"]} />
// => '<div class="foo bar baz"></div>'
```

**Object (truthy keys included):**

```tsx
<div class={{ active: true, hidden: false, bold: 1 }} />
// => '<div class="active bold"></div>'
```

An empty or non-matching class value results in no `class` attribute:

```tsx
<div class="" />
// => '<div></div>'
```

### Style Normalization

The `style` attribute accepts two formats:

**String:**

```tsx
<div style="color: red; font-size: 16px" />
// => '<div style="color: red; font-size: 16px"></div>'
```

**Object (camelCase keys converted to kebab-case):**

```tsx
<div style={{ color: "red", fontSize: "16px" }} />
// => '<div style="color: red; font-size: 16px"></div>'
```

### Prop Name Conversion

CamelCase prop names are converted to kebab-case HTML attributes. Two special cases are handled:

```tsx
<label className="lbl" htmlFor="inp" />
// => '<label class="lbl" for="inp"></label>'

<div dataTestId="val" />
// => '<div data-test-id="val"></div>'
```

### Boolean and Null Props

| Value       | Behavior                                            |
| ----------- | --------------------------------------------------- |
| `true`      | Rendered as bare attribute name: `<input disabled>` |
| `false`     | Attribute omitted                                   |
| `null`      | Attribute omitted                                   |
| `undefined` | Attribute omitted                                   |

### URL Injection Protection

URL-bearing attributes (`href`, `src`, `action`, `formaction`, `poster`, `cite`, `data`) are checked for `javascript:` and `data:` URI schemes. If detected, the attribute is silently omitted to prevent XSS:

```tsx
<a href="javascript:alert(1)" />
// => '<a></a>'  (href omitted)

<img src="data:text/html,<h1>hi</h1>" />
// => '<img />'  (src omitted)
```

### Void Elements

HTML void elements are rendered as self-closing tags:

```tsx
<br />             // => '<br />'
<img src="/pic.png" />  // => '<img src="/pic.png" />'
<input type="text" />   // => '<input type="text" />'
```

The complete list of recognized void elements: `area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track`, `wbr`.

### HTML Escaping

All text content and attribute values are HTML-escaped. The following characters are replaced:

| Character | Replacement |
| --------- | ----------- |
| `&`       | `&amp;`     |
| `<`       | `&lt;`      |
| `>`       | `&gt;`      |
| `"`       | `&quot;`    |
| `'`       | `&#39;`     |

```tsx
<p>{'<script>alert("xss")</script>'}</p>
// => '<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>'
```

---

## SSR Patterns

### Basic SSR with Web Standard Request/Response

```tsx
import { renderToString } from "@pyreon/runtime-server";
import { h } from "@pyreon/core";
import { App } from "./App";

export async function handler(req: Request): Promise<Response> {
  const html = await renderToString(<App />);

  return new Response(
    `<!DOCTYPE html>
    <html>
      <head><meta charset="UTF-8" /><title>My App</title></head>
      <body><div id="app">${html}</div></body>
    </html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
```

### SSR with Express

```tsx
import express from "express";
import {
  renderToString,
  runWithRequestContext,
  configureStoreIsolation,
} from "@pyreon/runtime-server";
import { setStoreRegistryProvider } from "@pyreon/store";
import { h } from "@pyreon/core";
import { App } from "./App";

const app = express();

configureStoreIsolation(setStoreRegistryProvider);

app.use(express.static("public"));

app.get("*", async (req, res) => {
  try {
    const html = await runWithRequestContext(async () => {
      return renderToString(<App />);
    });

    res.setHeader("Content-Type", "text/html");
    res.status(200).end(`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>My App</title>
          <link rel="stylesheet" href="/styles.css" />
        </head>
        <body>
          <div id="app">${html}</div>
          <script type="module" src="/client.js"></script>
        </body>
      </html>`);
  } catch (err) {
    console.error("SSR error:", err);
    res.status(500).end("Internal Server Error");
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
```

### SSR with Hono

```tsx
import { Hono } from "hono";
import {
  renderToString,
  runWithRequestContext,
  configureStoreIsolation,
} from "@pyreon/runtime-server";
import { setStoreRegistryProvider } from "@pyreon/store";
import { h } from "@pyreon/core";
import { App } from "./App";

const app = new Hono();

configureStoreIsolation(setStoreRegistryProvider);

app.get("*", async (c) => {
  try {
    const html = await runWithRequestContext(async () => {
      return renderToString(<App />);
    });

    return c.html(`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>My App</title>
        </head>
        <body>
          <div id="app">${html}</div>
          <script type="module" src="/client.js"></script>
        </body>
      </html>`);
  } catch (err) {
    console.error("SSR error:", err);
    return c.text("Internal Server Error", 500);
  }
});

export default app;
```

### SSR with Node.js HTTP

```tsx
import { createServer } from "node:http";
import {
  renderToString,
  runWithRequestContext,
  configureStoreIsolation,
} from "@pyreon/runtime-server";
import { setStoreRegistryProvider } from "@pyreon/store";
import { h } from "@pyreon/core";
import { App } from "./App";

configureStoreIsolation(setStoreRegistryProvider);

const server = createServer(async (req, res) => {
  try {
    const html = await runWithRequestContext(async () => {
      return renderToString(<App />);
    });

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!DOCTYPE html>
      <html>
        <head><meta charset="UTF-8" /><title>My App</title></head>
        <body><div id="app">${html}</div></body>
      </html>`);
  } catch (err) {
    console.error("SSR error:", err);
    res.writeHead(500);
    res.end("Internal Server Error");
  }
});

server.listen(3000);
```

### Streaming SSR with Document Shell

```tsx
import { renderToStream } from "@pyreon/runtime-server";
import { h } from "@pyreon/core";
import { App } from "./App";

export async function handler(req: Request): Promise<Response> {
  const appStream = renderToStream(<App />);

  const stream = new ReadableStream({
    async start(controller) {
      // Emit the document shell immediately
      controller.enqueue(
        `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <title>My App</title>
            <link rel="stylesheet" href="/styles.css" />
          </head>
          <body>
            <div id="app">`,
      );

      // Pipe the app stream
      const reader = appStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }

      // Close the document shell
      controller.enqueue(
        `</div>
            <script type="module" src="/client.js"></script>
          </body>
        </html>`,
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/html" },
  });
}
```

### SSR with Router Integration

```tsx
import { renderToString, runWithRequestContext } from "@pyreon/runtime-server";
import { createRouter, prefetchLoaderData } from "@pyreon/router";
import { h } from "@pyreon/core";
import { routes } from "./routes";
import { App } from "./App";

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const html = await runWithRequestContext(async () => {
    const router = createRouter({
      routes,
      url: url.pathname + url.search,
    });

    // Prefetch loader data for the matched route
    await prefetchLoaderData(router, url.pathname + url.search);

    return renderToString(<App router={router} />);
  });

  return new Response(
    `<!DOCTYPE html>
    <html>
      <head><meta charset="UTF-8" /></head>
      <body>
        <div id="app">${html}</div>
        <script>window.__INITIAL_DATA__ = ${JSON.stringify(/* serialized data */)};</script>
        <script type="module" src="/client.js"></script>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
```

### SSR with Head Management

```tsx
import { renderWithHead } from "@pyreon/head";
import { h } from "@pyreon/core";
import { App } from "./App";

export async function handler(req: Request): Promise<Response> {
  const { html, head, htmlAttrs, bodyAttrs } = await renderWithHead(<App />);

  const htmlAttrStr = Object.entries(htmlAttrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  const bodyAttrStr = Object.entries(bodyAttrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");

  return new Response(
    `<!DOCTYPE html>
    <html ${htmlAttrStr}>
      <head>
        <meta charset="UTF-8" />
        ${head}
      </head>
      <body ${bodyAttrStr}>
        <div id="app">${html}</div>
        <script type="module" src="/client.js"></script>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
```

---

## Error Handling During SSR

### Try/Catch Around Renders

Always wrap render calls in try/catch to handle errors from components, data fetching, or invalid VNode trees:

```tsx
app.get("*", async (req, res) => {
  try {
    const html = await runWithRequestContext(async () => {
      return renderToString(<App />);
    });
    res.status(200).end(wrapHtml(html));
  } catch (err) {
    console.error("SSR render error:", err);

    // Option 1: Return error page
    res.status(500).end(`<!DOCTYPE html>
      <html><body><h1>500 Server Error</h1></body></html>`);

    // Option 2: Fall back to client-side rendering
    // res.status(200).end(`<!DOCTYPE html>
    //   <html><body>
    //     <div id="app"></div>
    //     <script type="module" src="/client.js"></script>
    //   </body></html>`)
  }
});
```

### Stream Error Handling

`renderToStream` propagates errors through the stream's error channel. The `ReadableStream` will call `controller.error(err)` if any part of the render throws:

```tsx
const stream = renderToStream(<App />);

const reader = stream.getReader();
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // process chunk
  }
} catch (err) {
  console.error("Stream error:", err);
}
```

When using `new Response(stream)`, the connection will be aborted if an error occurs during streaming. Since partial HTML has already been sent, you cannot change the status code. Consider wrapping risky components in Suspense boundaries with error-safe fallbacks.

---

## Performance Optimization Tips

### 1. Use renderToStream for Large Pages

For pages with multiple async data sources, `renderToStream` with Suspense boundaries provides a significantly better Time to First Byte (TTFB) than `renderToString`:

```tsx
// Slower: waits for everything before sending any HTML
const html = await renderToString(<App />);

// Faster: starts sending HTML immediately
const stream = renderToStream(<App />);
```

### 2. Enable Store Isolation Only When Needed

`configureStoreIsolation` adds an `AsyncLocalStorage` layer. Skip it for SSG builds or single-threaded scenarios:

```ts
// Only enable for production SSR with concurrent requests
if (process.env.NODE_ENV === "production") {
  configureStoreIsolation(setStoreRegistryProvider);
}
```

### 3. Avoid Deep Component Nesting

Each component call requires a function invocation and potential `await`. Flatten deeply nested component trees where possible to reduce the render call stack depth.

### 4. Prefetch Data Before Render

Use `runWithRequestContext` to prefetch all necessary data before calling `renderToString`, rather than having each component independently fetch:

```tsx
const html = await runWithRequestContext(async () => {
  // One prefetch call, not N component-level fetches
  await prefetchLoaderData(router, url);
  return renderToString(<App />);
});
```

### 5. Parallelize Array Children

The renderer already uses `Promise.all` for array children, meaning sibling async components render in parallel automatically. Structure your component tree to take advantage of this.

---

## Exports Summary

| Export                            | Type                                                           | Description                                           |
| --------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| `renderToString(root)`            | `(VNode \| null) => Promise<string>`                           | Render VNode tree to complete HTML string             |
| `renderToStream(root)`            | `(VNode \| null) => ReadableStream<string>`                    | Render VNode tree to progressive HTML stream          |
| `runWithRequestContext(fn)`       | `<T>(fn: () => Promise<T>) => Promise<T>`                      | Run function with isolated context and store registry |
| `configureStoreIsolation(setter)` | `(fn: (provider: () => Map<string, unknown>) => void) => void` | Enable per-request store isolation for concurrent SSR |
