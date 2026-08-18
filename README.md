<p align="center">
  <img src=".github/assets/pyreon-banner.svg" alt="Pyreon — the signal-based UI framework: fine-grained reactivity, full-stack, AI-native" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/pyreon/pyreon/actions/workflows/ci.yml"><img src="https://github.com/pyreon/pyreon/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-22D3EE" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/row--list%20benchmark-mostly%20ties%20Octane%2C%20wins%20create--10k%20%2B%20append-F4EFE6?labelColor=0A0A0E" alt="Row-list benchmark: statistically tied with Octane on most ops, wins create-10k and append outright" />
</p>

# Pyreon

A signal-based UI framework with fine-grained reactivity. No virtual DOM, no component re-renders — only the exact DOM nodes that depend on a changed signal are updated.

## Why Pyreon

- **Components run once.** State changes update individual DOM nodes, not entire component subtrees.
- **No dependency arrays.** Signals track their own subscribers automatically.
- **~6 kB gzip** for core + runtime-dom. Tree-shakeable — only what you use ships to the client.
- **Full-stack.** SSR streaming, static site generation, island architecture, and client-side SPA — all from one framework.
- **Fast, and we retracted the parts of our own benchmark that overstated it — three times.** A synthetic row-list benchmark across an 8-framework field found our harness had handicapped [Octane](https://octanejs.dev) — the nearest rival — with a `String()` wrapper that disabled its compiler fast path; let a V8 engine artifact inflate the retained-memory numbers for five implementations; and used a CSS table-layout mode that forced a full-table re-measure on any op that widened a cell, which inflated our published Pyreon-vs-Solid `partial update` lead from a real ~2.1× to a false ~4.9× (retracted). Corrected (pending merge — see [benchmarks](https://pyreon.dev/docs/benchmarks)): Pyreon **wins bulk-create outright** — 10,000 rows in 80.3ms vs Octane 83.4ms, and **~2.6× faster than React and ~3.3× than Preact** at that size — plus an outright win on `append` (~1.14–1.20×, widened after the table-layout fix, 14.2ms vs Octane's 16.3ms) — and is **statistically tied with Octane** on create-1k, replace, partial-update, and remove. Octane, in turn, **wins `clear rows`** (a real, resolved ~1.45×, not a timer artifact). `select row` is at the floor of what real-Chromium timing can resolve for both. (Real Chromium, published deps, every competitor on its own documented fast path; retained memory is a 3-way tie with Preact for 3rd of 8, not a win.)
- **75 packages.** Forms, routing, state management, charts, drag & drop, i18n, multiplatform (SwiftUI + Compose), and more.
- **Migration paths.** Drop-in compat layers for React, Vue, Solid, and Preact.

## Quick Start

```bash
bun add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom
bun add @pyreon/vite-plugin --dev
```

**vite.config.ts**

```ts
import { defineConfig } from 'vite'
import pyreon from '@pyreon/vite-plugin'

export default defineConfig({
  plugins: [pyreon()],
})
```

**tsconfig.json**

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@pyreon/core"
  }
}
```

**src/App.tsx**

```tsx
import { signal } from '@pyreon/reactivity'

function Counter() {
  const count = signal(0)
  return (
    <div>
      <button onClick={() => count.update((n) => n - 1)}>-</button>
      <span>{count()}</span>
      <button onClick={() => count.update((n) => n + 1)}>+</button>
    </div>
  )
}

export default Counter
```

**src/main.tsx**

```tsx
import { mount } from '@pyreon/runtime-dom'
import Counter from './App'

mount(<Counter />, document.getElementById('app')!)
```

The `count()` call inside JSX is a reactive getter. Pyreon wraps it in an effect automatically, so only that text node updates when `count` changes. The `Counter` function itself runs exactly once.

## Packages

### Core

| Package | Description |
|---|---|
| [`@pyreon/reactivity`](packages/core/reactivity/) | `signal`, `computed`, `effect`, `batch`, `createSelector`, `createStore`, `untrack` |
| [`@pyreon/core`](packages/core/core/) | `h()`, JSX runtime, `Fragment`, `For`, `Show`, `Portal`, `Suspense`, `ErrorBoundary`, `lazy`, `Dynamic`, context, lifecycle |
| [`@pyreon/runtime-dom`](packages/core/runtime-dom/) | `mount()`, `hydrateRoot()`, `Transition`, `TransitionGroup`, `KeepAlive` |
| [`@pyreon/runtime-server`](packages/core/runtime-server/) | `renderToString()`, `renderToStream()` |
| [`@pyreon/compiler`](packages/core/compiler/) | JSX transform with smart `shouldWrap`, static hoisting, template emission |
| [`@pyreon/router`](packages/core/router/) | Hash/history router, nested routes, guards, loaders, prefetching, `useIsActive` |
| [`@pyreon/head`](packages/core/head/) | `useHead()` — reactive document head management with SSR |
| [`@pyreon/server`](packages/core/server/) | `createHandler` (SSR), `prerender` (SSG), `island()` architecture |
| [`@pyreon/primitives`](packages/core/primitives/) | 15 canonical multi-platform primitives — `Stack`, `Inline`, `Text`, `Button`, `Field`… one source → DOM + SwiftUI + Compose |
| [`@pyreon/sized-map`](packages/core/sized-map/) | Bounded `Map<K, V>` — FIFO (default) or LRU-on-read eviction |

### Fundamentals

| Package | Description |
|---|---|
| [`@pyreon/store`](packages/fundamentals/store/) | Composition stores — `defineStore`, patch, subscribe, plugins; schema-driven stores strictly typed from any Standard Schema |
| [`@pyreon/state-tree`](packages/fundamentals/state-tree/) | Structured reactive state — models, snapshots, patches, middleware |
| [`@pyreon/form`](packages/fundamentals/form/) | Signal-based forms — fields, validation, submission, arrays, context, dynamic + file fields, focus-on-error, raw Standard Schema |
| [`@pyreon/validation`](packages/fundamentals/validation/) | Universal validation gate — owns the validation contract + Standard Schema bridge (`standardSchemaToValidator`, `InferSchema`); adapters for Zod / Valibot / ArkType; zero pyreon deps |
| [`@pyreon/validate`](packages/fundamentals/validate/) | DX layer over Standard Schema — `withField` metadata, reactive parse, i18n-aware error formatting, plus its own `s` validator runtime |
| [`@pyreon/query`](packages/fundamentals/query/) | TanStack Query adapter with Suspense, SSE, WebSocket subscriptions |
| [`@pyreon/table`](packages/fundamentals/table/) | TanStack Table adapter with reactive state sync |
| [`@pyreon/virtual`](packages/fundamentals/virtual/) | TanStack Virtual adapter — element and window virtualizers |
| [`@pyreon/i18n`](packages/fundamentals/i18n/) | Reactive i18n — async namespaces, plurals, interpolation |
| [`@pyreon/feature`](packages/fundamentals/feature/) | Schema-driven CRUD — auto-generated queries, forms, tables, stores |
| [`@pyreon/charts`](packages/fundamentals/charts/) | Reactive ECharts bridge with lazy loading |
| [`@pyreon/storage`](packages/fundamentals/storage/) | Reactive storage — localStorage, sessionStorage, cookies, IndexedDB |
| [`@pyreon/hooks`](packages/fundamentals/hooks/) | 65 hooks — useHover, useFocus, useBreakpoint, useClipboard, useHaptics, useShare, useLinking, useNotifications, useBiometrics, useImagePicker, useFilePicker, useDialog, useTimeAgo, etc. |
| [`@pyreon/hotkeys`](packages/fundamentals/hotkeys/) | Keyboard shortcuts — scope-aware, modifier keys, conflict detection |
| [`@pyreon/permissions`](packages/fundamentals/permissions/) | Reactive RBAC/ABAC — wildcards, predicates, feature flags |
| [`@pyreon/machine`](packages/fundamentals/machine/) | Reactive state machines — type-safe transitions, guards |
| [`@pyreon/flow`](packages/fundamentals/flow/) | Flow diagrams — signal-native nodes, edges, pan/zoom, auto-layout |
| [`@pyreon/code`](packages/fundamentals/code/) | Code editor — CodeMirror 6 with signals, minimap, diff editor |
| [`@pyreon/document`](packages/fundamentals/document/) | Universal document rendering — 18 primitives, 20 output formats |
| [`@pyreon/rx`](packages/fundamentals/rx/) | Signal-aware transforms — filter, map, sortBy, groupBy, pipe, debounce, 39 functions |
| [`@pyreon/toast`](packages/fundamentals/toast/) | Toast notifications — imperative API, auto-dismiss, a11y |
| [`@pyreon/url-state`](packages/fundamentals/url-state/) | URL-synced state — auto type coercion, schema mode, SSR-safe |
| [`@pyreon/dnd`](packages/fundamentals/dnd/) | Drag and drop — sortable, droppable, file drop, keyboard support |
| [`@pyreon/sync`](packages/fundamentals/sync/) | Local-first CRDT sync — a synced signal IS a signal; Yjs, IndexedDB, cross-tab + WebSocket, presence / live cursors |
| [`@pyreon/rich-text`](packages/fundamentals/rich-text/) | Reactive WYSIWYG — signal-backed TipTap / ProseMirror, lazy-loaded, a11y-labeled |
| [`@pyreon/a11y`](packages/fundamentals/a11y/) | A11y primitives — `announce()` live regions, `<VisuallyHidden>`, `createA11yId`, zero setup |

### UI System

| Package | Description |
|---|---|
| [`@pyreon/ui-core`](packages/ui-system/ui-core/) | Config engine, `PyreonUI` provider, utilities |
| [`@pyreon/styler`](packages/ui-system/styler/) | CSS-in-JS — `styled()`, `css`, `keyframes`, theming |
| [`@pyreon/unistyle`](packages/ui-system/unistyle/) | Responsive breakpoints, CSS property mappings |
| [`@pyreon/elements`](packages/ui-system/elements/) | 5 primitives — Element, Text, List, Overlay, Portal |
| [`@pyreon/attrs`](packages/ui-system/attrs/) | Chainable HOC factory — `.attrs()`, `.config()`, `.statics()` |
| [`@pyreon/rocketstyle`](packages/ui-system/rocketstyle/) | Multi-state styling — states, sizes, variants, themes, dark mode |
| [`@pyreon/coolgrid`](packages/ui-system/coolgrid/) | 12-column responsive grid |
| [`@pyreon/kinetic`](packages/ui-system/kinetic/) | CSS-transition animations |
| [`@pyreon/kinetic-presets`](packages/ui-system/kinetic-presets/) | 120+ animation presets |
| [`@pyreon/connector-document`](packages/ui-system/connector-document/) | Bridge between ui-system styled components and `@pyreon/document` |
| [`@pyreon/document-primitives`](packages/ui-system/document-primitives/) | Rocketstyle document components — render in the browser, export to 18 formats |

### Tools

| Package | Description |
|---|---|
| [`@pyreon/vite-plugin`](packages/tools/vite-plugin/) | JSX transform, signal-preserving HMR, SSR middleware, compat aliases |
| [`@pyreon/lint`](packages/tools/lint/) | 99 Pyreon-specific lint rules across 19 categories — reactivity, JSX, SSR, performance |
| [`@pyreon/storybook`](packages/tools/storybook/) | Storybook renderer for Pyreon components |
| [`@pyreon/typescript`](packages/tools/typescript/) | TypeScript config presets |
| [`@pyreon/react-compat`](packages/tools/react-compat/) | Drop-in React compatibility layer |
| [`@pyreon/preact-compat`](packages/tools/preact-compat/) | Drop-in Preact compatibility layer |
| [`@pyreon/vue-compat`](packages/tools/vue-compat/) | Drop-in Vue compatibility layer |
| [`@pyreon/solid-compat`](packages/tools/solid-compat/) | Drop-in Solid compatibility layer |
| [`@pyreon/svelte-compat`](packages/tools/svelte-compat/) | Drop-in Svelte compatibility layer |
| [`@pyreon/testing`](packages/tools/testing/) | Test kit at Testing-Library parity — `render`/`screen`/`fireEvent`, jest-dom matchers, plus reactive fire-count / leak matchers |
| [`@pyreon/cli`](packages/tools/cli/) | `pyreon` CLI — `doctor`, `check`, `add`, `new`, `mcp`, `lint`, `info`, `upgrade` |
| [`@pyreon/mcp`](packages/tools/mcp/) | MCP server — API reference, patterns, `validate`, `diagnose` for AI assistants |

### Zero (meta-framework)

| Package | Description |
|---|---|
| [`@pyreon/zero`](packages/zero/zero/) | Zero-config full-stack framework — SSR / SSG / ISR / SPA, fs-router, islands, per-route render modes, deploy adapters (Vercel / Cloudflare / Netlify / Node / Bun) |
| [`@pyreon/zero-content`](packages/zero/zero-content/) | Content layer — compile-time `.md` / `.mdx` → Pyreon JSX, typed collections (zod), convention-scanned MDX components |
| [`@pyreon/zero-cli`](packages/zero/cli/) | `zero` CLI — dev, build, preview |
| [`@pyreon/create-zero`](packages/zero/create-zero/) | Scaffold a new Pyreon app (`create-pyreon-app`) |
| [`@pyreon/create-multiplatform`](packages/zero/create-multiplatform/) | Scaffold a web + iOS (SwiftUI) + Android (Compose) app from one source |
| [`@pyreon/meta`](packages/zero/meta/) | Barrel package re-exporting the full Pyreon fundamentals ecosystem |

## How It Works

```
Signal write -> notify subscribers -> re-run affected effects -> patch DOM nodes
```

There is no virtual DOM tree. There is no diffing pass. Each signal maintains a `Set<Effect>` of subscribers. When a signal is written, only those effects re-run, and each effect updates exactly one DOM node.

**React (every state change):**

```
setState -> re-run component -> build VDOM -> diff VDOM -> patch DOM
```

**Pyreon (every signal write):**

```
signal.set() -> re-run 1 effect -> update 1 DOM node
```

## Framework Comparison

| Feature | React 19 | Vue 3 | SolidJS | Pyreon |
|---|---|---|---|---|
| Reactivity | VDOM + re-render | Proxy + VDOM | Fine-grained signals | Fine-grained signals |
| Component re-runs | Every state change | Every state change | Never | Never |
| SSR streaming | Yes | Yes | Yes | Yes |
| Island architecture | No | No | Partial | Yes |
| Bundle (core) | ~42 kB | ~34 kB | ~7 kB | ~6 kB |
| Migration support | -- | -- | -- | React, Vue, Solid, Preact |

## Documentation

Full documentation at [pyreon.dev](https://pyreon.dev) (Pyreon-native site in `docs/` — powered by @pyreon/zero + @pyreon/zero-content).

## Development

```bash
bun install                # install dependencies
bun run test               # run all tests (7,500+)
bun run lint               # lint (oxlint)
bun run format             # format (oxfmt)
bun run typecheck          # typecheck all packages
```

The monorepo uses Bun workspaces with 75 packages across 6 categories (`packages/core/`, `packages/fundamentals/`, `packages/ui-system/`, `packages/tools/`, `packages/zero/`, `packages/native/`). Each package resolves `src/` directly via the `"bun"` export condition — no build step needed during development.

## License

MIT
