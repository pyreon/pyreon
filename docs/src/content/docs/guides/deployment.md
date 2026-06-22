---
title: "Deploying a Pyreon App"
description: "How to build and deploy a @pyreon/zero app to Vercel, Cloudflare, Netlify, Node, Bun, or any static host — with the right adapter and rendering mode."
---

# Deploying a Pyreon App

A `@pyreon/zero` app builds to a deployable artifact whose shape depends on your **rendering mode** and **adapter**. Static modes need only a static host; server modes emit a runnable handler the adapter wires to the platform.

## Build

```bash
bun run build      # vite build → dist/
```

What lands in `dist/` depends on the mode:

- **SSG** → fully prerendered HTML per route + assets. Deploy `dist/` to any static host.
- **SSR / ISR** → a client bundle **plus** a server handler (`dist/server/entry-server.js`) + the adapter's platform wiring.
- **SPA** → a client shell + assets.

## Choosing an adapter

Configure the adapter in your zero config; it shapes the build for the target platform:

```ts
import { zero } from '@pyreon/zero'
import { vercelAdapter } from '@pyreon/zero/server'

export default {
  plugins: [pyreon(), zero({ mode: 'ssr', adapter: vercelAdapter() })],
}
```

Available adapters:

- **`vercelAdapter()`** — Vercel (writes `.vercel/output` config; static `config.json` for SSG).
- **`cloudflareAdapter()`** — Cloudflare Pages (`_routes.json`, `_headers`; needs `nodejs_compat` for SSR).
- **`netlifyAdapter()`** — Netlify Functions (`netlify.toml`).
- **`nodeAdapter()`** / **`bunAdapter()`** — self-hosted; emits a runnable server (`node dist/index.js`).
- **`staticAdapter()`** — plain static output (SSG/SPA).

## Static hosting (SSG)

Deploy `dist/` to Netlify / Cloudflare Pages / GitHub Pages / S3+CloudFront. The host must serve `dist/404.html` for unmatched URLs (managed hosts do this by convention; nginx/S3 need explicit config). Subpath deploys (`zero({ base: '/blog/' })`) prefix asset + router URLs while keeping the on-disk layout unprefixed.

## Self-hosting (SSR/ISR with Node or Bun)

```bash
bun run build
node dist/index.js      # the emitted server serves SSR + static assets, hydrates
```

The build copies the production template (`dist/server/template.html`, with hashed asset refs) so the served pages hydrate. Assets under the build's `assetsDir` get a 1-year immutable cache.

## Caching, headers, env

- **CDN adapters** scope a 1-year `immutable` rule to `<base><assetsDir>/*` (your hashed chunks).
- **CSP** — `cspMiddleware({ directives })` with `useNonce()` for inline scripts.
- **Env validation** — `validateEnv({ PORT: 3000, API_KEY: String })`; `publicEnv()` for the client-safe subset.
- **ISR revalidation** — `Adapter.revalidate(path)` per platform (Vercel POSTs to a handler, Cloudflare purges the edge cache, Netlify triggers a build hook).

## Common pitfalls

- **Deploying an SSR build to a static host.** SSR/ISR need a server — use a static mode or a server adapter+host.
- **Cloudflare SSR without `nodejs_compat`.** The SSR bundle imports `node:async_hooks` / `node:fs`; workerd resolves them only with that flag (the create-zero scaffold sets it).
- **First publish of a new app to a platform.** Some platforms need a one-time setup; see the per-adapter notes in the Zero docs.

## Related

- [Zero guide](/docs/zero) · [SSR, SSG & ISR](/docs/guides/ssr-ssg-isr)
- [Images & Fonts](/docs/images-and-fonts)
