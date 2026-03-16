# @pyreon/vite-plugin

Vite plugin for the Pyreon framework. Applies the Pyreon JSX reactive transform to `.tsx`, `.jsx`, and `.pyreon` files, and optionally adds SSR dev middleware.

## Install

```bash
bun add -D @pyreon/vite-plugin
```

## Quick Start (SPA)

```ts
// vite.config.ts
import pyreon from "@pyreon/vite-plugin"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [pyreon()],
})
```

## SSR Mode

Pass an `ssr` option to enable SSR dev middleware. The plugin will load your server entry via Vite's `ssrLoadModule` and call its exported `handler` function for every non-asset GET request.

```ts
// vite.config.ts
import pyreon from "@pyreon/vite-plugin"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [pyreon({ ssr: { entry: "./src/entry-server.ts" } })],
})
```

Your server entry must export a `handler` (or default export) with the signature `(req: Request) => Promise<Response>`:

```tsx
// src/entry-server.ts
import { renderToString } from "@pyreon/runtime-server"
import App from "./App"

export async function handler(req: Request): Promise<Response> {
  const html = await renderToString(<App />)
  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  })
}
```

For production, build client and server bundles separately:

```bash
vite build                                                  # client bundle
vite build --ssr src/entry-server.ts --outDir dist/server   # server bundle
```

## API

### `pyreonPlugin(options?)`

Default export. Returns a Vite `Plugin`.

### Options

| Option | Type | Description |
|---|---|---|
| `ssr.entry` | `string` | Server entry file path. Enables SSR dev middleware. |

## What It Does

- Configures `resolve.conditions: ["bun"]` so Vite resolves Pyreon workspace source files.
- Sets `esbuild.jsx` to `automatic` with `@pyreon/core` as the JSX import source.
- Transforms `.tsx`, `.jsx`, and `.pyreon` files through `@pyreon/compiler` for reactive JSX optimizations.
- In SSR mode, adds a catch-all middleware that renders pages through your server entry with full HMR support.
