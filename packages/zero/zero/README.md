# @pyreon/zero

Core meta-framework for building full-stack apps with [Pyreon](https://github.com/pyreon/pyreon) and [Vite](https://vite.dev).

## Install

```bash
bun add @pyreon/zero
```

## Features

- **File-based routing** — `[param]`, `[...catchAll]`, `_layout`, `_error`, `_loading`, `(groups)`
- **Rendering modes** — SSR (streaming + string), SSG, ISR, SPA (per-route configurable via `renderMode` export)
- **API routes** — `.ts` files in `src/routes/api/` export HTTP method handlers (`GET`, `POST`, `PUT`, `DELETE`)
- **Server actions** — `defineAction()` for mutations with automatic client/server boundary detection
- **Per-route middleware** — route files export `middleware` using `@pyreon/server`'s signature
- **Components** — `<Image>` (lazy load, srcset, blur-up), `<Link>` (prefetch, active state), `<Script>` (loading strategies)
- **Theme** — Dark/light/system with `theme` signal, `<ThemeToggle>`, and anti-flash inline script
- **Fonts** — Google Fonts self-hosting at build time, local fonts, size-adjusted fallbacks
- **Image optimization** — Build-time processing via `?optimize` imports (WebP/AVIF, blur placeholders)
- **SEO** — Sitemap, robots.txt, JSON-LD helpers (Vite plugin + dev middleware)
- **Middleware** — `cacheMiddleware()`, `securityHeaders()`, `corsMiddleware()`, `rateLimitMiddleware()`, `compressionMiddleware()`
- **Adapters** — Node.js, Bun, static
- **Testing** — `createTestContext()`, `testMiddleware()`, `createTestApiServer()`, `createMockHandler()`
- **Dev overlay** — Styled error overlay with source-mapped stack traces for SSR errors

## Usage

```ts
// vite.config.ts
import pyreon from "@pyreon/vite-plugin"
import zero from "@pyreon/zero"

export default {
  plugins: [pyreon(), zero({ mode: "ssr", ssr: { mode: "stream" } })],
}
```

## Subpath Exports

| Export | Description |
| --- | --- |
| `@pyreon/zero` | Vite plugin, config, adapters, components, middleware |
| `@pyreon/zero/client` | Client-side entry (`startClient`) |
| `@pyreon/zero/config` | `defineConfig`, `resolveConfig` |
| `@pyreon/zero/image` | `<Image>` component |
| `@pyreon/zero/link` | `<Link>`, `useLink`, `createLink` |
| `@pyreon/zero/script` | `<Script>` component |
| `@pyreon/zero/theme` | Theme system and `<ThemeToggle>` |
| `@pyreon/zero/font` | Font optimization plugin |
| `@pyreon/zero/cache` | Cache and security middleware |
| `@pyreon/zero/seo` | SEO plugin, sitemap, robots.txt |
| `@pyreon/zero/image-plugin` | Image optimization Vite plugin |
| `@pyreon/zero/actions` | `defineAction`, `createActionMiddleware` |
| `@pyreon/zero/api-routes` | API route utilities and middleware |
| `@pyreon/zero/cors` | CORS middleware |
| `@pyreon/zero/rate-limit` | Rate limiting middleware |
| `@pyreon/zero/compression` | Compression middleware |
| `@pyreon/zero/testing` | Test utilities for middleware and API routes |

## License

[MIT](LICENSE)
