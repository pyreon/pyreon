---
title: 'Island Architecture'
description: Partial hydration in Pyreon — six strategies, decision tree, prefetch, auto-registry, and the doctor + MCP audit gates.
---

# Island Architecture

Pyreon's island architecture is **partial hydration** — only the components you mark as interactive ship JavaScript to the client. The rest of the page is zero-JS server-rendered HTML.

This page covers the full surface: when to reach for islands, the six hydration strategies and how to choose between them, the prefetch hint, the auto-registry that eliminates registry-drift bugs, and the static + runtime gates that catch the foot-guns at build time.

**Client islands vs server islands.** `island()` — this page — defers CLIENT hydration of interactive components inside a server-rendered page. `serverIsland()` (from `@pyreon/zero` or `@pyreon/server`) is the INVERSE: a cacheable page with per-request SERVER-rendered holes. Each hole is fetched from a fragment endpoint (`GET /_pyreon/fragment/<name>`, name-allowlisted against the registered islands), the marker self-activates on the client, fallback content renders for no-JS visitors, and an opt-in `cache` option controls fragment caching. See [Zero → Server Islands](/docs/zero#server-islands).

## When to use islands (and when not to)

Islands earn their keep on **content-heavy pages with isolated interactive components** — blogs, marketing pages, documentation sites, news. Most of the page is static; a few zones are interactive (a counter, a search bar, a comment thread, a video player).

Islands are **not** the right tool for:

- **App shells** where most of the UI is interactive. Use the regular SSR + hydrate-everything pattern (`createHandler` + `startClient`) — it ships less HTML overhead per route.
- **Below-the-fold data displays that never become interactive**. Just server-render them with no island wrapper at all — zero JS, zero hydration cost, no registry entry.
- **Components whose content depends on parent state at runtime**. Island props are JSON-serialized for the SSR → client transit; children, functions, symbols, and `undefined` are stripped. Move the wrapper inside the component if it needs live parent state.

Rule of thumb: if you'd write `<App />` and hydrate the whole tree under it, use the regular SSR pipeline. If you'd write `<Article />` with a few `<Counter />` / `<Comments />` islands inside, this page is for you.

## How it works

**Server side:**

1. `island(loader, options)` wraps an async component import and returns a `ComponentFn` that renders inside a `<pyreon-island>` custom element with serialized props + the hydration strategy as data attributes.
2. The rest of the page renders normally — every non-island component produces plain HTML with no client wiring.

> **Import `island` from `@pyreon/server/client` if the declaration ships to the client.** `island()` itself is client-safe, but the `@pyreon/server` *main* barrel also re-exports `createHandler` / `prerender` (which pull `node:` modules). If you call `island()` in a file that is bundled client-side — most importantly, **any `@pyreon/zero` route**, since every route ships to the client for hydration — a `from '@pyreon/server'` barrel import drags the whole server module into the browser bundle, which crashes the build (duplicate-`@pyreon/server` singleton sentinel) and breaks the hydrated island. Use `import { island } from '@pyreon/server/client'` there. A server-only declaration file (imported only by `entry-server.ts`, as in `examples/islands-showcase`) can use either path.

**Client side:**

1. `hydrateIslandsAuto(registry)` (or the manual `hydrateIslands({ ... })`) scans the DOM for `<pyreon-island>` elements.
2. For each island, the registered strategy decides WHEN to fetch the chunk and hydrate (immediately on `load`, during browser idle, on scroll-in, on first interaction, on a media-query match, or never).
3. Only components actually present in the HTML are loaded — unused components are tree-shaken.

## Decision tree — which strategy?

| Strategy        | Use when                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `'load'`        | Above-the-fold interactive content the user is meant to interact with on first paint (header CTAs, hero buttons, primary forms). |
| `'idle'`        | Above-the-fold but non-critical (typeahead search, analytics widgets, share buttons) — let the browser settle first.            |
| `'visible'`     | Below-the-fold content (comment threads, related-posts widgets) — only hydrate when the user scrolls to it.                     |
| `'interaction'` | Interactive but NOT visible until the user reaches for them (modals, dropdowns, command palettes, search overlays).             |
| `'media(...)'`  | Mobile-only or desktop-only components (mobile menu, desktop sidebar). Pair with `(min-width: …)` / `(max-width: …)`.           |
| `'never'`       | Render-only on the server, ship zero client JS (badges, static labels, server-rendered "live" data that never re-renders).      |

Choosing wrong has user-visible consequences:

- `'idle'` for above-the-fold = forms appear unresponsive for the first ~200ms after page load.
- `'visible'` without prefetch = blank-while-fetching flash when the user scrolls to the island. (Pair with `prefetch: 'idle'` — see below.)
- `'interaction'` for above-the-fold = button shows but doesn't respond on first click; the click is replayed once hydration finishes, but there's a perceptible lag.
- `'never'` registered in the client registry = the whole point of `'never'` (zero client JS) is defeated; the bundler still pulls the module into the chunk graph even though the runtime short-circuits before invoking the loader.

## The six strategies

### `'load'` — hydrate immediately

The default. The island fetches its JS chunk and hydrates synchronously on page load. Use for any interactive component the user is meant to engage with on first paint.

```tsx title="src/islands.ts"
import { island } from '@pyreon/server'

export const Counter = island(() => import('./components/Counter'), {
  name: 'Counter',
  hydrate: 'load', // explicit; this is also the default
})
```

### `'idle'` — hydrate when the browser is idle

Defers hydration to the next `requestIdleCallback`. The user sees content immediately, but interactivity is deferred until the browser has finished critical work. Falls back to `setTimeout` in browsers without `requestIdleCallback`.

```tsx
export const SearchBar = island(() => import('./components/SearchBar'), {
  name: 'SearchBar',
  hydrate: 'idle',
})
```

### `'visible'` — hydrate when the island scrolls into view

Uses `IntersectionObserver` with a small `rootMargin` so hydration starts ~200px before the island actually crosses the viewport — the chunk fetch + hydrate window is hidden behind the user's scroll velocity.

```tsx
export const Comments = island(() => import('./components/Comments'), {
  name: 'Comments',
  hydrate: 'visible',
  prefetch: 'idle', // see below — pre-warm the chunk during idle
})
```

### `'interaction'` — hydrate on first user interaction

Best for components that are interactive **but not visible on initial paint** — modals, dropdowns, command palettes. The runtime registers one-shot listeners on the `<pyreon-island>` element for `focus` / `click` / `pointerenter` / `touchstart`; the first matching event triggers hydration, then removes all listeners.

**Click events are replayed.** If the user clicks before hydration completes, the runtime captures the event, hydrates the island, and re-dispatches the equivalent click on the live element so the user's first click both wakes the island AND fires the action. (Replay only covers click — focus / pointerenter / touchstart fire hydration but no replay; focus is hard to re-dispatch reliably once the user has tabbed past, and pointerenter is passive.)

```tsx
export const CommandPalette = island(() => import('./components/CommandPalette'), {
  name: 'CommandPalette',
  hydrate: 'interaction',
})

// Custom event list (default = focus/click/pointerenter/touchstart)
export const Tooltip = island(() => import('./components/Tooltip'), {
  name: 'Tooltip',
  hydrate: 'interaction(focus,pointerenter)',
})
```

### `'media(...)'` — hydrate when a media query matches

The string between the parens is passed verbatim to `matchMedia()`. Use for components that only matter at specific viewport sizes / device classes / user preferences.

```tsx
export const MobileMenu = island(() => import('./components/MobileMenu'), {
  name: 'MobileMenu',
  hydrate: 'media((max-width: 768px))', // mobile only
})

export const DarkModeWidget = island(() => import('./components/DarkMode'), {
  name: 'DarkModeWidget',
  hydrate: 'media((prefers-color-scheme: dark))',
})
```

If the query is already matching at page load, hydration starts immediately. Otherwise the runtime listens for the query to start matching and hydrates then.

### `'never'` — render only, zero client JS

The component renders during SSR but the runtime short-circuits before fetching any JS. Useful for content that's "live" at the server (timestamps, counts, badges) but never needs client-side reactivity.

```tsx
export const StaticBadge = island(() => import('./components/StaticBadge'), {
  name: 'StaticBadge',
  hydrate: 'never',
})
```

:::warning
A `hydrate: 'never'` island MUST NOT appear in the client `hydrateIslands({ ... })` registry. Registering pulls the component module into the client bundle graph, defeating the zero-JS goal. The `pyreon doctor --check-islands` audit catches this — finding code: `never-with-registry-entry`. Auto-registry (see below) omits never-strategy islands automatically.
:::

## Prefetch hint — pre-warm the chunk

Pair a deferred-hydration strategy (`visible`, `interaction`, `media`, `idle`) with `prefetch: 'idle'` or `prefetch: 'visible'` to fetch the chunk BEFORE the hydration trigger fires. Hydration becomes instant against an already-warm module cache.

```tsx
export const Comments = island(() => import('./components/Comments'), {
  name: 'Comments',
  hydrate: 'visible',
  prefetch: 'idle', // chunk arrives during browser idle
})
```

| Prefetch    | Meaning                                                                       |
| ----------- | ----------------------------------------------------------------------------- |
| `'none'`    | Default. Loader runs only when the hydration trigger fires.                   |
| `'idle'`    | Fire-and-forget loader during the next `requestIdleCallback`.                 |
| `'visible'` | Fire-and-forget loader when the island scrolls within ~200px of the viewport. |

Prefetch is suppressed (no `data-prefetch` attribute emitted) when paired with `hydrate: 'load'` (the loader runs synchronously already) or `hydrate: 'never'` (defeats zero-JS). The framework silently drops the field — nothing breaks, but you're signaling intent that doesn't apply.

## Auto-registry — no manual sync

Under `@pyreon/vite-plugin` (default-on as of post-#461), the client-side registry is **auto-discovered from your source code**. The plugin pre-scans for `island(() => import('PATH'), { name, hydrate })` calls and emits a virtual module you import in `entry-client.ts`.

```ts title="src/entry-client.ts"
import { hydrateIslandsAuto } from '@pyreon/server/client'
// @ts-expect-error virtual module — provided by @pyreon/vite-plugin
import * as autoRegistry from 'virtual:pyreon/islands-registry'

hydrateIslandsAuto(autoRegistry)
```

That's the entire client entry. No manual `hydrateIslands({ Counter: () => import('./Counter'), ... })` to keep in sync with `island()` declarations — the #1 author foot-gun is closed by construction.

**Never-strategy islands are deliberately omitted** from the auto-registry. The plugin filters them out so their components stay out of the client bundle entirely.

For non-Vite consumers (library authors, custom build pipelines), the manual form is still public:

```ts
import { hydrateIslands } from '@pyreon/server/client'

hydrateIslands({
  Counter: () => import('./components/Counter'),
  Comments: () => import('./components/Comments'),
  // StaticBadge intentionally omitted — hydrate: 'never'
})
```

## Foot-guns — caught by audits

Pyreon ships two layers of static + runtime gates that catch the recurring island foot-guns at build time, not at runtime against a confused user.

### `pyreon doctor --check-islands`

Walks `packages/` + `examples/` (or your project's source roots) and runs five cross-file detectors. Each finding includes file path + line/column + actionable fix suggestion.

```bash
pyreon doctor --check-islands         # human-readable output
pyreon doctor --check-islands --json  # CI-pipeable JSON
```

| Finding code                 | Catches                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `duplicate-name`             | Two `island()` declarations with the same `name`. Runtime hydrates only the FIRST loader; second fails silently.                              |
| `never-with-registry-entry`  | A `hydrate: 'never'` island that's also in the client registry — defeats the zero-JS goal.                                                    |
| `registry-mismatch`          | A `hydrateIslands({ X })` entry where `X` has no matching `island()` declaration anywhere. Catches typos / removed islands / forgotten imports. |
| `nested-island`              | An `island()` whose loader-imported file ALSO contains an `island()` call. Outer's `hydrateRoot` would replace the inner subtree.             |
| `dead-island`                | An `island()` declared in a file that no other source imports. The component never reaches a rendered tree.                                   |

Wire it into CI by piping `--json` and grepping `findings.length > 0` to gate the merge.

### MCP `audit_islands` tool

The same five detectors are exposed via the `audit_islands` MCP tool — AI coding assistants (Claude Code, Cursor, etc.) call it before writing island code to surface project-wide issues.

```ts
audit_islands({})              // markdown-grouped report
audit_islands({ json: true })  // machine-readable findings
```

### MCP `validate` tool — per-snippet detector

`island-never-with-registry-entry` is also implemented as a per-file static detector in `@pyreon/compiler` and surfaced via the MCP `validate` tool. Same finding shape, fires on a single snippet rather than the whole project.

## Real-app reference

[`examples/islands-showcase`](https://github.com/pyreon/pyreon/tree/main/examples/islands-showcase) ships one island per strategy, with `VisibleComments` pairing `hydrate: 'visible'` + `prefetch: 'idle'` as the canonical "below the fold + warmed" pattern. The example uses `hydrateIslandsAuto()` and is exercised by the project's e2e gate (real Chromium, desktop + mobile viewports) so every strategy is end-to-end verified on every PR.

## See also

- [`@pyreon/server`](/docs/server) — the SSR handler, `island()` API reference, and the rest of the server-side surface
- [`@pyreon/runtime-server`](/docs/runtime-server) — the lower-level `renderToString` / `renderToStream` primitives
- [`@pyreon/vite-plugin`](/docs/vite-plugin) — the build-time integration that powers auto-registry
- [`@pyreon/cli`](/docs/cli) — `pyreon doctor --check-islands` flag
- [`@pyreon/mcp`](/docs/mcp) — `audit_islands` + `validate` tools for AI agents
