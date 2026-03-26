# API Reference

## `@pyreon/zero`

### `default` (zeroPlugin)

Vite plugin for Pyreon Zero. Adds file-based routing and zero-config conventions.

```ts
import zero from "@pyreon/zero"

export default {
  plugins: [zero(config?)],
}
```

**Parameters:**

| Name     | Type         | Description      |
| -------- | ------------ | ---------------- |
| `config` | `ZeroConfig` | Optional config  |

### `createServer(options)`

Create an SSR request handler for production.

```ts
import { routes } from "virtual:zero/routes"
import { createServer } from "@pyreon/zero"

export default createServer({ routes })
```

**Parameters:**

| Name                  | Type             | Description              |
| --------------------- | ---------------- | ------------------------ |
| `options.routes`      | `RouteRecord[]`  | Route definitions        |
| `options.config`      | `ZeroConfig`     | Zero config (optional)   |
| `options.middleware`   | `Middleware[]`   | Additional middleware    |
| `options.template`    | `string`         | HTML template override   |
| `options.clientEntry` | `string`         | Client entry path        |

### `createApp(options)`

Assemble the full app — router, head provider, and root layout. Used internally by `startClient` and `createServer`.

```ts
import { createApp } from "@pyreon/zero"

const { App, router } = createApp({
  routes,
  routerMode: "history",
})
```

**Parameters:**

| Name                      | Type                   | Default      | Description                |
| ------------------------- | ---------------------- | ------------ | -------------------------- |
| `options.routes`          | `RouteRecord[]`        | —            | Route definitions          |
| `options.routerMode`      | `"hash" \| "history"`  | `"history"`  | Router mode                |
| `options.url`             | `string`               | —            | Initial URL for SSR        |
| `options.layout`          | `ComponentFn`          | —            | Root layout component      |
| `options.errorComponent`  | `ComponentFn`          | —            | Global error component     |

**Returns:** `{ App: ComponentFn, router: Router }`

## `@pyreon/zero/client`

### `startClient(options)`

Start the client-side app. Auto-detects whether to hydrate (SSR content present) or mount fresh (SPA).

```ts
import { routes } from "virtual:zero/routes"
import { startClient } from "@pyreon/zero/client"

startClient({ routes })
```

**Parameters:**

| Name              | Type             | Description          |
| ----------------- | ---------------- | -------------------- |
| `options.routes`  | `RouteRecord[]`  | Route definitions    |
| `options.layout`  | `ComponentFn`    | Root layout (optional) |

## `@pyreon/zero/config`

### `defineConfig(config)`

Type-safe config helper for `zero.config.ts` files.

```ts
import { defineConfig } from "@pyreon/zero/config"

export default defineConfig({
  mode: "ssr",
  ssr: { mode: "stream" },
})
```

### `resolveConfig(config?)`

Merge user config with defaults. Used internally.

## ISR

### `createISRHandler(handler, config)`

Wrap an SSR handler with stale-while-revalidate caching.

```ts
import { createServer, createISRHandler } from "@pyreon/zero"

const handler = createServer({ routes })
const isrHandler = createISRHandler(handler, { revalidate: 60 })
```

**Parameters:**

| Name               | Type                              | Description                    |
| ------------------ | --------------------------------- | ------------------------------ |
| `handler`          | `(req: Request) => Promise<Response>` | SSR handler to wrap        |
| `config.revalidate`| `number`                          | Revalidation interval (seconds)|

Response headers:

- `x-isr-cache: HIT | MISS | STALE`
- `x-isr-age: <seconds>`

## Adapters

### `resolveAdapter(config)`

Resolve a built-in adapter from config. Returns an `Adapter` instance.

### `nodeAdapter()`

Create a Node.js adapter (standalone `node:http` server).

### `bunAdapter()`

Create a Bun adapter (`Bun.serve()` entry).

### `staticAdapter()`

Create a static adapter (copies client build output).

## File-system routing utilities

### `parseFileRoutes(files, defaultMode?)`

Parse file paths into `FileRoute` objects.

```ts
import { parseFileRoutes } from "@pyreon/zero"

const routes = parseFileRoutes(["index.tsx", "users/[id].tsx"])
```

### `filePathToUrlPath(filePath)`

Convert a file path (without extension) to a URL path pattern.

```ts
filePathToUrlPath("users/[id]")       // → "/users/:id"
filePathToUrlPath("blog/[...slug]")   // → "/blog/:slug*"
filePathToUrlPath("(auth)/login")     // → "/login"
```

### `scanRouteFiles(routesDir)`

Recursively scan a directory for route files. Returns paths relative to the routes directory.

### `generateRouteModule(files, routesDir)`

Generate a virtual module string that exports a nested route tree. Wires up:

- Lazy-loaded components via `lazy()` with loading/error fallbacks
- `loader`, `guard` (as `beforeEnter`), `meta`, `errorComponent` from route module exports
- Nested `children` arrays for `_layout.tsx` files
- `_error.tsx` and `_loading.tsx` as directory-level fallbacks

## Types

```ts
import type {
  ZeroConfig,
  RenderMode,       // "ssr" | "ssg" | "spa" | "isr"
  ISRConfig,
  RouteModule,
  LoaderContext,
  RouteMeta,
  FileRoute,
  Adapter,
  AdapterBuildOptions,
} from "@pyreon/zero"
```

## CLI

### `zero dev [root]`

Start the development server.

| Flag             | Default | Description              |
| ---------------- | ------- | ------------------------ |
| `--port <port>`  | `3000`  | Server port              |
| `--host [host]`  | —       | Bind to host             |
| `--open`         | —       | Open browser on start    |

### `zero build [root]`

Build for production. Outputs `dist/client/`, `dist/server/`, and `dist/output/` (adapter output).

The build pipeline:

1. Build client bundle with SSR manifest
2. Build server SSR bundle
3. Run SSG prerendering (if mode is `"ssg"` or `"isr"`)
4. Run adapter to produce deployable output

| Flag             | Default | Description              |
| ---------------- | ------- | ------------------------ |
| `--mode <mode>`  | —       | Override rendering mode  |

### `zero preview [root]`

Preview the production build locally.

| Flag             | Default | Description              |
| ---------------- | ------- | ------------------------ |
| `--port <port>`  | `3000`  | Server port              |
| `--host [host]`  | —       | Bind to host             |
