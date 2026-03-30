---
title: "@pyreon/vite-plugin"
description: Vite integration that applies Pyreon's JSX reactive transform and configures SSR dev middleware.
---

`@pyreon/vite-plugin` integrates Pyreon with Vite. It applies the Pyreon JSX reactive transform to `.tsx`, `.jsx`, and `.pyreon` files, configures the JSX runtime, and optionally provides SSR dev middleware for server-rendered applications.

<PackageBadge name="@pyreon/vite-plugin" href="/docs/vite-plugin" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/vite-plugin
```

```bash [bun]
bun add @pyreon/vite-plugin
```

```bash [pnpm]
pnpm add @pyreon/vite-plugin
```

```bash [yarn]
yarn add @pyreon/vite-plugin
```

:::

You also need `vite` and `@pyreon/compiler` as dependencies:

::: code-group

```bash [npm]
npm install vite @pyreon/compiler
```

```bash [bun]
bun add vite @pyreon/compiler
```

```bash [pnpm]
pnpm add vite @pyreon/compiler
```

```bash [yarn]
yarn add vite @pyreon/compiler
```

:::

---

## Basic Usage (SPA)

For a client-side single-page application, the plugin requires no options:

```ts
// vite.config.ts
import pyreon from "@pyreon/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [pyreon()],
});
```

This is all you need. The plugin automatically:

1. Configures Vite's esbuild to use `@pyreon/core` as the JSX import source with automatic JSX transform
2. Transforms `.tsx`, `.jsx`, and `.pyreon` files through the Pyreon compiler (`@pyreon/compiler`)
3. Applies reactive wrapping, static hoisting, and template emission optimizations
4. Adds `"bun"` to Vite's resolve conditions for Bun-compatible module resolution

### Minimal SPA Project

Here is a complete minimal SPA setup:

**Project structure:**

```
my-app/
  src/
    App.tsx
    main.ts
  index.html
  vite.config.ts
  package.json
  tsconfig.json
```

**vite.config.ts:**

```ts
import pyreon from "@pyreon/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [pyreon()],
});
```

**index.html:**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Pyreon App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

**src/main.ts:**

```tsx
import { mount } from "@pyreon/runtime-dom";
import { App } from "./App";

mount(document.getElementById("app")!, <App />);
```

**src/App.tsx:**

```tsx
import { signal } from "@pyreon/reactivity";

export function App() {
  const count = signal(0);

  return (
    <div>
      <h1>Hello Pyreon</h1>
      <p>{() => `Count: ${count()}`}</p>
      <button onClick={() => count.update((c) => c + 1)}>Increment</button>
    </div>
  );
}
```

Run the dev server:

```bash
npx vite
```

Build for production:

```bash
npx vite build
```

---

## Plugin Options

### PyreonPluginOptions

```ts
interface PyreonPluginOptions {
  ssr?: {
    /** Server entry file path (e.g. "./src/entry-server.ts") */
    entry: string;
  };
}
```

| Option      | Type     | Required              | Description                                                                                                                                                                             |
| ----------- | -------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ssr`       | `object` | No                    | Enable SSR dev middleware. When provided, the plugin adds middleware to Vite's dev server that handles server-rendered requests.                                                        |
| `ssr.entry` | `string` | Yes (if `ssr` is set) | Path to the server entry file, relative to the project root. This file must export a `handler` function (or a default export) with the signature `(req: Request) => Promise<Response>`. |

### Usage

```ts
// SPA mode (no options)
pyreon();

// SSR mode
pyreon({
  ssr: { entry: "./src/entry-server.ts" },
});
```

---

## What the Plugin Does

### JSX Transform

The plugin runs `@pyreon/compiler`'s `transformJSX` on every `.tsx`, `.jsx`, and `.pyreon` file during Vite's transform phase. The plugin is registered with `enforce: "pre"`, meaning it runs before other plugins.

The Pyreon compiler transform does three things:

1. **Reactive wrapping** -- Dynamic JSX expressions (those that read reactive signals) are wrapped in `() =>` arrow functions for fine-grained reactivity. This is what makes Pyreon reactive without a virtual DOM diff.

2. **Static hoisting** -- VNodes that are completely static (no dynamic props, no reactive children) are hoisted to module scope. This avoids re-creating the same VNode objects on every render, reducing GC pressure.

3. **Template emission** -- Element trees with 2 or more consecutive DOM elements (no components) are compiled into `_tpl()` calls. Templates use `cloneNode` internally, which is faster than creating elements one by one.

   Within templates, the compiler emits `_bindText` only for **simple identifiers** (e.g., `count()`, `name()`). Property access calls like `value.toLocaleString()` or `row.label()` use `_bind()` instead, which preserves the correct `this` context. The `_bindText` and `_bindDirect` runtime helpers include a fallback to `renderEffect` when the source is a non-signal callable (i.e., lacks `.direct()`), making them safe for any callable value.

Compiler warnings are surfaced in the terminal via Vite's warning system, including the file path, line, and column number.

### File Extensions

The plugin transforms files with these extensions:

| Extension | Description                         |
| --------- | ----------------------------------- |
| `.tsx`    | TypeScript JSX                      |
| `.jsx`    | JavaScript JSX                      |
| `.pyreon` | Pyreon single-file component format |

Files with query strings (e.g., `file.tsx?v=123`) are handled correctly -- the extension is extracted from the path before the `?`.

### Vite Configuration

The plugin automatically configures Vite with these settings:

```ts
{
  resolve: {
    conditions: ["bun"],  // Support Bun-specific module resolution
  },
  esbuild: {
    jsx: "automatic",             // Use automatic JSX transform (no manual imports needed)
    jsxImportSource: "@pyreon/core",  // Import JSX factory from @pyreon/core
  },
}
```

This means you do not need to configure JSX settings manually in your `tsconfig.json` or `vite.config.ts` -- the plugin handles it.

For SSR builds (when `env.isSsrBuild` is true and SSR config is provided), the plugin additionally configures:

```ts
{
  build: {
    ssr: true,
    rollupOptions: {
      input: ssrConfig.entry,  // Your server entry file
    },
  },
}
```

---

## The .pyreon File Format

Pyreon single-file components use the `.pyreon` extension. These files are processed by the same `transformJSX` pipeline as `.tsx` and `.jsx` files.

The `.pyreon` format allows you to write components in a single file that is transformed by the Pyreon compiler. The compiler handles reactive wrapping, static hoisting, and template emission the same way it does for regular `.tsx` files.

---

## SSR Mode

For server-side rendered applications, pass an `ssr` option with the path to your server entry file.

### Setup

```ts
// vite.config.ts
import pyreon from "@pyreon/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    pyreon({
      ssr: { entry: "./src/entry-server.ts" },
    }),
  ],
});
```

### Server Entry Requirements

Your SSR entry file must export a `handler` function (or a default export) that:

1. Accepts a Web-standard `Request` object
2. Returns a `Promise<Response>` (or `Response`)

```ts
// src/entry-server.ts
export async function handler(req: Request): Promise<Response> {
  // Render your app to HTML
  // Return a Response with the HTML
}
```

The plugin looks for `handler` first, then falls back to `default`:

```ts
const handler = mod.handler ?? mod.default;
```

If neither is found, the plugin logs an error and passes the request to the next middleware.

### SSR Dev Middleware

When SSR mode is enabled, the plugin adds middleware to Vite's dev server. The middleware is configured to run **after** Vite's built-in middleware (static files, HMR, etc.), so it only handles requests that Vite does not serve.

Here is what happens for each request:

1. **Skip non-GET requests** -- POST, PUT, DELETE, etc. are passed through to the next middleware.

2. **Skip asset requests** -- The plugin checks if the URL is an asset request and passes it through. Asset requests include:
   - URLs starting with `/@` (Vite internals: `@vite/client`, `@id/`, `@fs/`, etc.)
   - URLs starting with `/__` (`__open-in-editor`, etc.)
   - URLs containing `/node_modules/`
   - URLs ending with known asset extensions: `.css`, `.js`, `.ts`, `.tsx`, `.jsx`, `.json`, `.ico`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.woff`, `.woff2`, `.ttf`, `.eot`, `.map`

3. **Load the server entry** -- The entry module is loaded through Vite's `ssrLoadModule`, which is HMR-aware. When you edit the server entry or any of its dependencies, changes are reflected immediately without restarting the server.

4. **Construct a Web-standard Request** -- The Node.js `IncomingMessage` is converted to a Web-standard `Request` object, including headers.

5. **Call the handler** -- The exported `handler` function is called with the `Request`.

6. **Transform the HTML** -- The response HTML is passed through `server.transformIndexHtml`, which injects Vite's HMR client script and applies any dev-time HTML transforms.

7. **Return the response** -- The transformed HTML is sent back with the handler's status code and headers.

If the handler throws an error, Vite's `ssrFixStacktrace` is called to map the error back to original source locations, the error is logged, and it is passed to the next middleware (which triggers Vite's error overlay in the browser).

### SSR Dev Middleware Request Flow

```
Browser Request
  |
  v
Vite Static/HMR Middleware
  |
  |--> Asset request? --> Serve static file
  |
  v
Pyreon SSR Middleware
  |
  |--> Non-GET? --> Pass through
  |--> Asset URL pattern? --> Pass through
  |
  v
ssrLoadModule(entry)
  |
  v
handler(Request) --> Response
  |
  v
transformIndexHtml(html)  // Inject HMR client
  |
  v
Send Response to Browser
```

---

## Production SSR Build

For production, you need to build two bundles: the client bundle and the server bundle.

### Build Commands

```bash
# Build the client bundle (output: dist/)
npx vite build

# Build the server bundle (output: dist/server/)
npx vite build --ssr src/entry-server.ts --outDir dist/server
```

When `--ssr` is passed to `vite build`, the plugin detects `env.isSsrBuild === true` and configures:

- `build.ssr: true` -- Tells Vite to build for server (no code splitting, no CSS extraction)
- `build.rollupOptions.input` -- Uses your server entry as the input

### Production Server

After building, you need a production server to serve the client assets and run the SSR handler. Here is an example with a generic Node.js HTTP server:

```ts
// server.ts (production entry point)
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Import the built SSR handler
const { handler } = await import("./dist/server/entry-server.js");

const PORT = process.env.PORT ?? 3000;
const DIST = join(import.meta.dirname, "dist");

createServer(async (req, res) => {
  const url = req.url ?? "/";

  // Serve static assets from dist/
  if (url.startsWith("/assets/") || url.endsWith(".js") || url.endsWith(".css")) {
    try {
      const filePath = join(DIST, url);
      const content = readFileSync(filePath);
      const ext = url.split(".").pop();
      const mimeTypes: Record<string, string> = {
        js: "application/javascript",
        css: "text/css",
        svg: "image/svg+xml",
        png: "image/png",
        jpg: "image/jpeg",
      };
      res.setHeader("Content-Type", mimeTypes[ext ?? ""] ?? "application/octet-stream");
      res.end(content);
      return;
    } catch {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }
  }

  // SSR handler
  const origin = `http://localhost:${PORT}`;
  const request = new Request(new URL(url, origin).href);
  const response = await handler(request);
  const html = await response.text();

  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(html);
}).listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
```

### Production with Express

```ts
import express from "express";
import { join } from "node:path";

const { handler } = await import("./dist/server/entry-server.js");

const app = express();
const PORT = process.env.PORT ?? 3000;

// Serve static assets
app.use(express.static(join(import.meta.dirname, "dist"), { index: false }));

// SSR handler for all other routes
app.get("*", async (req, res) => {
  const origin = `${req.protocol}://${req.get("host")}`;
  const request = new Request(new URL(req.originalUrl, origin).href, {
    headers: new Headers(req.headers as Record<string, string>),
  });

  const response = await handler(request);
  const html = await response.text();

  res.status(response.status);
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
```

### Production with Hono

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";

const { handler } = await import("./dist/server/entry-server.js");

const app = new Hono();

// Serve static assets
app.use("/assets/*", serveStatic({ root: "./dist" }));

// SSR handler
app.get("*", async (c) => {
  const response = await handler(c.req.raw);
  return response;
});

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
```

---

## HMR Behavior

The plugin provides hot module replacement (HMR) behavior through Vite's built-in HMR system:

### What Gets Hot-Reloaded

- **Component files** (`.tsx`, `.jsx`, `.pyreon`) -- When you edit a component, the module is invalidated and re-evaluated. Pyreon's reactive system picks up the new component definition.
- **SSR entry and its dependencies** -- In SSR mode, changes to the server entry or any module it imports are reflected immediately via `ssrLoadModule`, which always loads the latest version of each module.
- **CSS and styles** -- Handled by Vite's built-in CSS HMR.
- **Static assets** -- Handled by Vite's built-in asset handling.

### HMR Client Injection

In SSR mode, the plugin injects Vite's HMR client into the HTML response via `server.transformIndexHtml`. This adds:

- The `/@vite/client` script for WebSocket-based HMR communication
- Dev-time CSS injection
- Error overlay support

This happens transparently -- you do not need to add any HMR scripts to your HTML template.

### Signal-Preserving HMR

In development mode, the plugin rewrites top-level `signal()` calls to preserve their values across hot module reloads. Without this, every HMR update would reset all signal state to initial values.

**How it works:**

1. Top-level `signal()` calls are rewritten to `__hmr_signal(moduleId, name, signal, initialValue)`.
2. On `import.meta.hot.dispose`, signal values are saved to `globalThis.__pyreon_hmr_registry__`.
3. When the module reloads, signals restore their previous values instead of reinitializing.

This means you can edit a component's rendering logic while keeping your application state intact -- counters keep their count, forms keep their input, and lists keep their items.

The HMR helpers are served from a virtual module `virtual:pyreon/hmr-runtime`. This is handled automatically by the plugin; no configuration is needed.

### Auto Signal Debug Naming

In development mode, the plugin automatically injects debug names into `signal()` calls based on the variable name. This makes signals easier to identify in devtools and debug output.

```tsx
// Your source code
const count = signal(0);
const userName = signal("Alice");

// What the plugin transforms it to (dev only)
const count = signal(0, { name: "count" });
const userName = signal("Alice", { name: "userName" });
```

This applies to all `signal()` calls -- both module-scope and function-scope. Signals that already have an options argument are skipped. Module-scope signals get their names via the `__hmr_signal` rewrite; function-scope signals get names via an injected options argument.

Auto signal naming is not applied in production builds -- the options arguments are tree-shaken away.

---

## Full SSR Example

### Project Structure

```
src/
  App.tsx
  entry-client.ts
  entry-server.ts
  routes.ts
vite.config.ts
package.json
```

### vite.config.ts

```ts
import pyreon from "@pyreon/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    pyreon({
      ssr: { entry: "./src/entry-server.ts" },
    }),
  ],
});
```

### src/entry-server.ts

```tsx
import { renderWithHead } from "@pyreon/head";
import { createRouter, prefetchLoaderData, serializeLoaderData } from "@pyreon/router";
import { routes } from "./routes";
import { App } from "./App";

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const router = createRouter({
    routes,
    url: url.pathname + url.search,
  });

  // Pre-fetch all loader data for the matched route
  await prefetchLoaderData(router, url.pathname + url.search);

  // Render the app to HTML with head management
  const { html, head, htmlAttrs, bodyAttrs } = await renderWithHead(<App router={router} />);

  const htmlAttrStr = Object.entries(htmlAttrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  const bodyAttrStr = Object.entries(bodyAttrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  const loaderData = JSON.stringify(serializeLoaderData(router));

  return new Response(
    `<!DOCTYPE html>
    <html ${htmlAttrStr}>
      <head>
        <meta charset="UTF-8" />
        ${head}
      </head>
      <body ${bodyAttrStr}>
        <div id="app">${html}</div>
        <script>window.__PYREON_LOADER_DATA__=${loaderData}</script>
        <script type="module" src="/src/entry-client.ts"></script>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
```

### src/entry-client.ts

```tsx
import { hydrateRoot } from "@pyreon/runtime-dom";
import { createRouter, hydrateLoaderData } from "@pyreon/router";
import { createHeadContext, HeadProvider } from "@pyreon/head";
import { routes } from "./routes";
import { App } from "./App";

// Create client-side router
const router = createRouter({ routes, mode: "history" });

// Hydrate server-fetched loader data to avoid re-fetching on the client
hydrateLoaderData(router, (window as any).__PYREON_LOADER_DATA__ ?? {});

// Set up head context for client-side head management
const headCtx = createHeadContext();

// Hydrate the server-rendered HTML
hydrateRoot(
  document.getElementById("app")!,
  <HeadProvider context={headCtx}>
    <App router={router} />
  </HeadProvider>,
);
```

### src/App.tsx

```tsx
import { RouterOutlet, Link } from "@pyreon/router";

export function App(props: { router: any }) {
  return (
    <div class="app">
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <RouterOutlet router={props.router} />
    </div>
  );
}
```

### src/routes.ts

```ts
export const routes = [
  {
    path: "/",
    component: () => import("./pages/Home"),
    loader: async () => {
      const res = await fetch("/api/data");
      return res.json();
    },
  },
  {
    path: "/about",
    component: () => import("./pages/About"),
  },
];
```

### Simple SSR (Without Router)

For simpler apps that do not need routing, the SSR entry can be straightforward:

```tsx
// src/entry-server.ts
import { renderToString } from "@pyreon/runtime-server";
import { App } from "./App";

export async function handler(req: Request): Promise<Response> {
  const html = await renderToString(<App />);

  return new Response(
    `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>My App</title>
      </head>
      <body>
        <div id="app">${html}</div>
        <script type="module" src="/src/entry-client.ts"></script>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
```

```tsx
// src/entry-client.ts
import { hydrateRoot } from "@pyreon/runtime-dom";
import { App } from "./App";

hydrateRoot(document.getElementById("app")!, <App />);
```

---

## Environment Variable Handling

Vite's built-in environment variable system works with Pyreon out of the box. Variables prefixed with `VITE_` are exposed to client-side code:

```bash
# .env
VITE_API_URL=https://api.example.com
VITE_APP_TITLE=My App
```

Access them in your code:

```ts
const apiUrl = import.meta.env.VITE_API_URL;
const title = import.meta.env.VITE_APP_TITLE;
const isDev = import.meta.env.DEV;
const isProd = import.meta.env.PROD;
const mode = import.meta.env.MODE;
```

In SSR mode, the server entry has access to all environment variables (not just `VITE_`-prefixed ones) through `process.env`, since it runs in Node.js:

```ts
// src/entry-server.ts -- server-only env vars
const dbUrl = process.env.DATABASE_URL; // Available
const secret = process.env.SESSION_SECRET; // Available

// Client-exposed env vars
const apiUrl = import.meta.env.VITE_API_URL; // Also available in SSR
```

---

## Dev Server Proxy Configuration

Vite's proxy configuration works normally with the Pyreon plugin. Configure API proxies in `vite.config.ts`:

```ts
import pyreon from "@pyreon/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [pyreon()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
      },
    },
  },
});
```

In SSR mode, the proxy runs before the SSR middleware (since Vite's built-in middleware runs first), so API requests are proxied as expected.

---

## Troubleshooting

### "SSR entry must export a handler or default export"

This error appears when the plugin loads your SSR entry but cannot find a `handler` named export or a `default` export.

**Fix:** Ensure your entry file exports one of:

```ts
// Named export (preferred)
export async function handler(req: Request): Promise<Response> { ... }

// Or default export
export default async function(req: Request): Promise<Response> { ... }
```

### JSX Transform Not Applied

If JSX is not being transformed (you see raw JSX in the browser), check:

1. Your file has a `.tsx`, `.jsx`, or `.pyreon` extension
2. The Pyreon plugin is listed in the `plugins` array
3. No other plugin is conflicting (e.g., a React plugin)

### Compiler Warnings in Terminal

The Pyreon compiler may emit warnings during transformation. These appear in the terminal as:

```
[pyreon] Warning message (path/to/file.tsx:line:column)
```

These are informational and usually indicate patterns that could be optimized.

### SSR Hydration Mismatch

If you see hydration warnings in the browser console, the server-rendered HTML does not match what the client would render. Common causes:

1. **Using `Date.now()` or `Math.random()` in render** -- These produce different values on server vs. client. Move them to effects or signals.
2. **Browser-only APIs in render** -- `window`, `document`, etc. are not available during SSR. Guard them with environment checks.
3. **Different data on server vs. client** -- Ensure loader data is serialized and hydrated correctly.

### Module Resolution Issues

If imports fail to resolve, check:

1. The `"bun"` condition is in your `resolve.conditions` (the plugin adds this automatically)
2. Your `tsconfig.json` has the correct `moduleResolution` setting
3. Pyreon packages are installed and accessible in `node_modules`

### Asset Requests Hitting SSR Handler

If static assets are incorrectly handled by the SSR middleware, the URL may not match the built-in asset detection patterns. The plugin skips URLs that:

- Start with `/@` or `/__`
- Contain `/node_modules/`
- Match common asset extensions (`.css`, `.js`, `.ts`, `.tsx`, `.jsx`, `.json`, `.ico`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.woff`, `.woff2`, `.ttf`, `.eot`, `.map`)

If you have custom asset types, ensure they are served by Vite's static middleware (which runs before the SSR middleware) by placing them in the `public/` directory.

---

## Exports Summary

| Export                   | Description                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `default` (pyreonPlugin) | The Vite plugin factory function. Call it with optional `PyreonPluginOptions` and pass the result to Vite's `plugins` array. |
| `PyreonPluginOptions`    | TypeScript type for the plugin options object.                                                                               |
