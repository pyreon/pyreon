---
title: "Islands & Partial Hydration"
description: "How to ship mostly-static HTML and hydrate only the interactive parts with Pyreon islands — strategies, prefetch, and the zero-config zero integration."
---

# Islands & Partial Hydration

An island is a component that renders to static HTML on the server and hydrates **independently** on the client, on a strategy you choose. The rest of the page ships zero JS. This is how you keep a content-heavy page fast while still having interactive widgets.

## When to use it

- A mostly-static page (blog, docs, marketing) with a few interactive widgets (a counter, a menu, a comment box).
- You want to defer hydration until idle / scroll-into-view / first interaction.

## When **not** to use it

- A fully interactive app (dashboard, editor) — there, hydrate the whole tree; islands add overhead with no benefit.

## Declaring an island

```tsx
import { island } from '@pyreon/server/client' // NOT the @pyreon/server barrel

export const Counter = island(() => import('./Counter'), {
  name: 'Counter',
  hydrate: 'visible',     // hydrate when scrolled into view
  prefetch: 'idle',       // warm the chunk during browser idle first
})
```

Import `island` from `@pyreon/server/client`, never the `@pyreon/server` barrel — the barrel drags `node:` server code into the client bundle.

`name` is shown here for clarity, but under `@pyreon/vite-plugin` it's optional for a `const`-bound declaration — the plugin derives a collision-free one from the binding. See [`IslandOptions`](/docs/island-architecture#islandoptions).

## Hydration strategies

- `'load'` (default) — hydrate immediately on page load (above-the-fold interactive content).
- `'idle'` — hydrate when the browser is idle (`requestIdleCallback`).
- `'visible'` — hydrate when scrolled into view (pair with `prefetch: 'idle'`).
- `'interaction'` — hydrate on the first `focus` / `click` / `pointerenter` / `touchstart` / `submit` targeting the island (modals, dropdowns, command palettes — content that's interactive but not visible on load). First matching event triggers hydration and removes all the listeners (one-shot). Only `click` and form `submit` are **replayed** against the live element after hydration completes — a captured `focus`/`pointerenter`/`touchstart` wakes the island but isn't re-dispatched (focus in particular can't be reliably re-fired once the user has tabbed past it).
- `'interaction(<events>)'` — same, but hydrate on the first match from a custom comma-separated event list, e.g. `hydrate: 'interaction(focus)'` or `hydrate: 'interaction(click,touchstart)'`.
- `'media(<query>)'` — hydrate when a media query matches, e.g. `hydrate: 'media(max-width: 640px)'` (mobile-only menu).
- `'never'` — never hydrate (zero client JS). **Do not register a `'never'` island in `hydrateIslands({...})`** — that pulls it into the bundle and defeats the point (the manual registry form only; `@pyreon/vite-plugin`'s auto-registry already omits `'never'` islands).

## In a zero app (zero-config)

`@pyreon/zero` re-exports `island` and hydration is **per-component, no registry at all**:

```tsx
import { island } from '@pyreon/zero'
export const Counter = island(() => import('./Counter'), { name: 'Counter', hydrate: 'visible' })
```

That's the whole setup — you don't call `hydrateIslandsAuto()` or write any registry in a zero app's `entry-client.ts`. `island()`'s client branch renders only the `<pyreon-island>` marker (zero children), so a hydrating host adopts the marker and never descends into it; `onMount()` then loads the chunk and mounts the component INTO the marker per its strategy. This design is deliberately host-agnostic — it works whether a route's server-rendered DOM is adopted in place or rebuilt client-side, because the island owns its own hydration lifecycle rather than depending on a one-shot external registry scan that could race an async route mount.

`@pyreon/vite-plugin`'s `islands: true` (default) is still worth having: it's what makes `name` **optional** — the plugin derives a collision-free `name` from the `const X = island(...)` binding at build time, in both the compiled marker and the registry prescan, so they can never disagree.

The `hydrateIslandsAuto(registry)` + `virtual:pyreon/islands-registry` path shown in [Island Architecture](/docs/island-architecture) is for a **standalone `@pyreon/server` app** (no `@pyreon/zero` router) that writes its own `entry-client.ts` — see `examples/islands-showcase`. `'never'`-hydrate islands are omitted from that auto-generated registry so their components never reach the client bundle.

## Common pitfalls

- **Importing `island` from `@pyreon/server`.** Use `@pyreon/server/client`; the barrel pulls in `node:fs` etc. and breaks the client build.
- **Passing children to an island.** Island props are JSON-serialized for the SSR→client transit — children, functions, and symbols are stripped. Have the island render its own content from string props.
- **Duplicate `name`.** The registry keys by `name`; only the first loader fires. Use distinct names. (`pyreon doctor --check-islands` catches this.)
- **`'interaction'` for above-the-fold content.** It only hydrates on first interaction — use `'load'` for content the user interacts with immediately.

## Related

- [Island Architecture](/docs/island-architecture) · [Islands pattern](/docs/patterns/islands)
- [SSR, SSG & ISR](/docs/guides/ssr-ssg-isr)
