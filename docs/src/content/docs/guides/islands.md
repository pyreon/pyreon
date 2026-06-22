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

## Hydration strategies

- `'load'` — hydrate immediately on page load (above-the-fold interactive content).
- `'idle'` — hydrate during browser idle.
- `'visible'` — hydrate when scrolled into view (pair with `prefetch: 'idle'`).
- `'interaction'` — hydrate on first interaction (modals, dropdowns, command palettes). Clicks and form submits are replayed after hydration.
- `'media'` — hydrate when a media query matches (e.g. mobile-only menu).
- `'never'` — never hydrate (zero client JS). **Do not register a `'never'` island in `hydrateIslands({...})`** — that pulls it into the bundle and defeats the point.

## In a zero app (zero-config)

`@pyreon/zero` re-exports `island` and self-hydrates each one — no manual registry:

```tsx
import { island } from '@pyreon/zero'
export const Counter = island(() => import('./Counter'), { name: 'Counter', hydrate: 'visible' })
```

With `@pyreon/vite-plugin`'s `islands: true` (default), the auto-registry wires `hydrateIslandsAuto()` for you and omits `'never'` islands from the client bundle.

## Common pitfalls

- **Importing `island` from `@pyreon/server`.** Use `@pyreon/server/client`; the barrel pulls in `node:fs` etc. and breaks the client build.
- **Passing children to an island.** Island props are JSON-serialized for the SSR→client transit — children, functions, and symbols are stripped. Have the island render its own content from string props.
- **Duplicate `name`.** The registry keys by `name`; only the first loader fires. Use distinct names. (`pyreon doctor --check-islands` catches this.)
- **`'interaction'` for above-the-fold content.** It only hydrates on first interaction — use `'load'` for content the user interacts with immediately.

## Related

- [Island Architecture](/docs/island-architecture) · [Islands pattern](/docs/patterns/islands)
- [SSR, SSG & ISR](/docs/guides/ssr-ssg-isr)
