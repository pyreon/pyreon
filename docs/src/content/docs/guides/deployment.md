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

```ts title="vite.config.ts"
import pyreon from '@pyreon/vite-plugin'
import zero, { vercelAdapter } from '@pyreon/zero/server'

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

`adapter` also accepts a plain string instead of a constructed instance (`adapter: 'vercel'`) when you don't need to pass adapter-specific options.

**Zero-config auto-detect.** Omit `adapter` entirely and the build detects the platform from its well-known build env vars (`VERCEL`, `NETLIFY`, `CF_PAGES`) and picks the matching adapter automatically — a plain `zero({ mode: 'ssr' })` just works on Vercel/Netlify/Cloudflare Pages with zero adapter config, logging `[Pyreon] Detected <platform> build environment — using the "<platform>" adapter` once. Local and self-hosted builds (no platform env var set) default to `'node'`. An explicit `adapter` always overrides detection.

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
