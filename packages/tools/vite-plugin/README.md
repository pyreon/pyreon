# @pyreon/vite-plugin

Vite plugin for Pyreon — JSX transform, signal-preserving HMR, SSR middleware, islands auto-registry, compat aliasing.

`@pyreon/vite-plugin` is the single Vite integration Pyreon needs. It wires `@pyreon/compiler` into Vite's transform pipeline, sets `resolve.conditions: ["bun"]` so workspace source files resolve via the `bun` condition, configures the JSX runtime to `@pyreon/core`, and provides signal-preserving HMR (top-level `signal()` values survive hot reload). Optional features: SSR dev middleware (`ssr.entry`), an auto-discovered islands registry (`islands: true`, the `virtual:pyreon/islands-registry` module fed to `hydrateIslandsAuto()`), drop-in compat-mode aliasing (`compat: 'react' | 'preact' | 'vue' | 'solid' | 'svelte'`), and the opt-in compile-time rocketstyle wrapper collapse (`collapse: true`, build-only).

## Install

```bash
bun add -D @pyreon/vite-plugin
```

## Quick start (SPA)

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon()],
})
```

`tsconfig.json`:

```jsonc
{
  "extends": "@pyreon/typescript/app",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/core",
  },
}
```

## SSR dev mode

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'

export default {
  plugins: [pyreon({ ssr: { entry: './src/entry-server.ts' } })],
}
```

The entry must export a `handler` (or default export) of shape `(req: Request) => Promise<Response>`:

```tsx
// src/entry-server.ts
import { renderToString } from '@pyreon/runtime-server'
import App from './App'

export async function handler(req: Request): Promise<Response> {
  const html = await renderToString(<App />)
  return new Response(html, { headers: { 'Content-Type': 'text/html' } })
}
```

Production builds:

```bash
vite build                                                  # client bundle
vite build --ssr src/entry-server.ts --outDir dist/server   # server bundle
```

## Drop-in compat mode

Alias an existing framework's imports to Pyreon's compat layer — zero code changes:

```ts
pyreon({ compat: 'react' }) // react + react-dom → @pyreon/react-compat
pyreon({ compat: 'preact' }) // preact + hooks + signals → @pyreon/preact-compat
pyreon({ compat: 'vue' }) // vue → @pyreon/vue-compat
pyreon({ compat: 'solid' }) // solid-js → @pyreon/solid-compat
pyreon({ compat: 'svelte' }) // svelte + svelte/store → @pyreon/svelte-compat
```

Framework-internal `@pyreon/*` files are detected and skip the redirect so published `@pyreon/zero` etc. still load their real JSX runtime.

## Islands auto-registry

```ts
pyreon({ islands: true }) // default on
```

Pre-scans `island(() => import('PATH'), { name, hydrate })` calls at `buildStart` and emits `virtual:pyreon/islands-registry`. Consume it in your client entry:

```ts
// src/entry-client.ts
import { hydrateIslandsAuto } from '@pyreon/server/client'
import islands from 'virtual:pyreon/islands-registry'

hydrateIslandsAuto(islands)
```

`hydrate: 'never'` islands are deliberately OMITTED from the registry — the strategy ships zero client JS, so registering a loader (which would pull the component into the client bundle graph) would defeat it. Manual `hydrateIslands({ … })` stays public for non-Vite consumers.

## Rocketstyle collapse (opt-in, build-only)

```ts
pyreon({ collapse: true })
// or with overrides
pyreon({ collapse: { sources: ['@pyreon/ui-components'], components: ['Button'] } })
```

A literal-prop rocketstyle call site (`<Button state="primary" size="medium">Save</Button>`) collapses from a 5-layer wrapper mount into one `_rsCollapse` cloneNode. The plugin SSR-resolves the real component twice (light + dark) and the compiler bakes the classes into a `_tpl` template. **Build-only** by design — dev keeps the normal mount so theme-source HMR edits stay reactive.

## Options

| Option      | Type                                                  | Description                                                                                   |
| ----------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `compat`    | `'react' \| 'preact' \| 'vue' \| 'solid' \| 'svelte'` | Alias an existing framework's imports to the matching `@pyreon/*-compat` package.             |
| `ssr.entry` | `string`                                              | Server entry path. Enables SSR dev middleware.                                                |
| `islands`   | `boolean`                                             | Auto-discover `island()` declarations into `virtual:pyreon/islands-registry`. Default `true`. |
| `collapse`  | `boolean \| PyreonCollapseOptions`                    | Opt-in compile-time rocketstyle wrapper collapse. OFF by default. Build-only.                 |

`PyreonCollapseOptions`: `sources?: string[]` (default `['@pyreon/ui-components']`), `components?: string[]` (optional local-name allowlist), `provider?: { name, source }` (default `PyreonUI@@pyreon/ui-core`), `theme?: { name, source }` (default `theme@@pyreon/ui-theme`), `mode?: { name, source }` (default `useMode@@pyreon/ui-core`).

## What it does

- Wires `@pyreon/compiler`'s JSX reactive transform into `.tsx` / `.jsx` / `.pyreon` files (auto-call signals, hoist static subtrees, `_tpl` + `_bind`).
- Sets `resolve.conditions: ["bun"]` so Pyreon workspace source files resolve through the `bun` condition (no separate build step in dev).
- Configures the JSX runtime to `@pyreon/core` via `esbuild.jsx = 'automatic'` + `jsxImportSource`.
- In dev: auto-injects debug names into `signal()` calls so devtools show meaningful labels.
- In dev SSR: catch-all middleware loads the server entry via `ssrLoadModule` and renders every non-asset request.
- Provides signal-preserving HMR via `virtual:pyreon/hmr-runtime` — top-level signal values survive hot reload.
- Component-level fast-refresh: edits to a route component re-render in place via the router's `_hmrSwap` coordinator (registered on `globalThis.__pyreon_hmr_swap__`).
- Pre-scans signal exports across files so cross-module signal references auto-call correctly.

## Gotchas

- **Vite's config bundler hardcodes `conditions: ["node"]`** — plugin source changes are INVISIBLE to a running dev server until `lib/` is rebuilt. After editing the plugin, `bun run --filter='@pyreon/vite-plugin' build` + restart Vite.
- **Compat-mode applies `jsxImportSource`** automatically for the user's code. Set `jsxImportSource: "@pyreon/<compat>-compat"` in your tsconfig for type resolution.
- **`collapse` is build-only by design.** Dev keeps the normal mount (HMR-reactive); the plugin emits `this.info('[Pyreon] collapse is build-only …')` once per dev process if `collapse: true` is set in `vite dev`.
- **HMR accept callback uses the fresh module Vite hands it** — NOT a re-run of the lazy import thunk (that would return the frozen `?t=` old module).

## Peer dependencies

- `vite >= 8.0.0`

## Documentation

Full docs: [docs.pyreon.dev/docs/vite-plugin](https://docs.pyreon.dev/docs/vite-plugin) (or `docs/docs/vite-plugin.md` in this repo).

## License

MIT
