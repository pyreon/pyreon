# Configuration

## Vite config

Zero is configured as a Vite plugin in `vite.config.ts`:

```ts
import pyreon from "@pyreon/vite-plugin"
import zero from "@pyreon/zero"

export default {
  plugins: [
    pyreon(),
    zero({
      mode: "ssr",
      port: 3000,
    }),
  ],
}
```

## Options

| Option         | Type                          | Default     | Description                          |
| -------------- | ----------------------------- | ----------- | ------------------------------------ |
| `mode`         | `"ssr" \| "ssg" \| "spa" \| "isr"` | `"ssr"` | Default rendering mode            |
| `port`         | `number`                      | `3000`      | Dev/preview server port              |
| `base`         | `string`                      | `"/"`       | Base URL path                        |
| `adapter`      | `string`                      | `"node"`    | Deploy target                        |
| `ssr.mode`     | `"string" \| "stream"`        | `"string"`  | SSR output mode                      |
| `ssg.paths`    | `string[] \| () => string[]`  | —           | Paths to prerender (SSG mode)        |
| `isr.revalidate` | `number`                    | —           | Revalidation interval in seconds     |
| `middleware`   | `Middleware[]`                | `[]`        | App-level middleware                 |

## Rendering modes

### SSR (Server-Side Rendering)

The default. Every request is rendered on the server and hydrated on the client.

```ts
zero({ mode: "ssr" })
```

Options:
- `ssr.mode: "string"` — render to string (default)
- `ssr.mode: "stream"` — streaming SSR

### SSG (Static Site Generation)

Pages are pre-rendered at build time.

```ts
zero({
  mode: "ssg",
  ssg: {
    paths: ["/", "/about", "/blog/hello-world"],
  },
})
```

For dynamic paths, use a function:

```ts
zero({
  mode: "ssg",
  ssg: {
    paths: async () => {
      const posts = await fetchPosts()
      return posts.map(p => `/blog/${p.slug}`)
    },
  },
})
```

### SPA (Single Page Application)

Client-only rendering. No server required.

```ts
zero({ mode: "spa" })
```

### ISR (Incremental Static Regeneration)

Static pages with automatic revalidation.

```ts
zero({
  mode: "isr",
  isr: { revalidate: 60 },  // revalidate every 60 seconds
})
```

### Per-route override

Any route can override the global mode:

```tsx
// src/routes/dashboard.tsx
export const renderMode = "spa"

export default function Dashboard() { /* ... */ }
```

## Adapters

The `adapter` option configures the production build output. The build command runs the adapter after building client and server bundles to produce a deployable output in `dist/output/`.

| Adapter        | Description                          | Status        |
| -------------- | ------------------------------------ | ------------- |
| `"node"`       | Standalone Node.js server (default)  | Built-in      |
| `"bun"`        | Bun-optimized `Bun.serve()` server   | Built-in      |
| `"static"`     | Static HTML files only (for SSG)     | Built-in      |
| `"vercel"`     | Vercel serverless functions          | Planned       |
| `"cloudflare"` | Cloudflare Workers                   | Planned       |
| `"netlify"`    | Netlify Functions                    | Planned       |

### Node adapter

Generates a standalone `index.js` that serves static files and falls through to SSR:

```ts
zero({ adapter: "node" })
```

Run in production:

```bash
node dist/output/index.js
```

### Bun adapter

Generates a `Bun.serve()` entry with native file serving:

```ts
zero({ adapter: "bun" })
```

Run in production:

```bash
bun dist/output/index.ts
```

### Static adapter

Copies the client build output for static hosting. Best combined with SSG mode:

```ts
zero({ mode: "ssg", adapter: "static" })
```

### Custom adapters

Implement the `Adapter` interface:

```ts
import type { Adapter, AdapterBuildOptions } from "@pyreon/zero"

const myAdapter: Adapter = {
  name: "my-platform",
  async build(options: AdapterBuildOptions) {
    // options.serverEntry — path to built server entry
    // options.clientOutDir — path to client build output
    // options.outDir — where to write final output
    // options.config — ZeroConfig
  },
}
```

## Middleware

App-level middleware runs on every request before rendering:

```ts
import type { Middleware } from "@pyreon/server"

const logger: Middleware = (ctx) => {
  console.log(`${ctx.req.method} ${ctx.url.pathname}`)
}

const auth: Middleware = (ctx) => {
  if (!ctx.req.headers.get("authorization")) {
    return new Response("Unauthorized", { status: 401 })
  }
  ctx.locals.user = decodeToken(ctx.req.headers.get("authorization"))
}

zero({
  middleware: [logger, auth],
})
```

Middleware can:

- Return `void` to continue to next middleware / rendering
- Return a `Response` to short-circuit (skip remaining middleware and rendering)
- Set `ctx.headers` for custom response headers
- Store data in `ctx.locals` for use in components
