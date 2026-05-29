---
title: 'Island architecture'
summary: 'Use island() to ship per-island JS to a static page. Pick the hydrate strategy by interactivity timing; pair deferred strategies with prefetch.'
seeAlso: [routing-setup, ssr-safe-hooks]
---

# Island architecture

## When to use islands

Islands are the right shape when **most of the page is static content** but a few regions need interactivity. Marketing sites, blog posts, docs pages, content-heavy product pages. The rest of the page stays as zero-JS server-rendered HTML; only declared islands ship a client bundle.

If the WHOLE page is interactive (a typical SPA dashboard), use full SSR + hydration via `startClient()` from `@pyreon/server/client` instead — islands buy nothing when every region needs JS anyway.

## The pattern

```tsx
// src/islands.ts — declarations
import { island } from '@pyreon/server'

export const Counter = island(() => import('./components/Counter'), {
  name: 'Counter',
  hydrate: 'load',
})

export const Comments = island(() => import('./components/Comments'), {
  name: 'Comments',
  hydrate: 'visible',
  prefetch: 'idle', // pre-warm the chunk during browser idle
})

export const CommandPalette = island(() => import('./components/CommandPalette'), {
  name: 'CommandPalette',
  hydrate: 'interaction', // first focus/click/pointerenter/touchstart
})

export const StaticBadge = island(() => import('./components/StaticBadge'), {
  name: 'StaticBadge',
  hydrate: 'never', // server-rendered only, no client JS
})
```

```tsx
// src/App.tsx — usage
import { Counter, Comments, CommandPalette, StaticBadge } from './islands'

export default function App() {
  return (
    <main>
      <h1>Static heading (no JS)</h1>
      <Counter initial={5} />
      <p>
        Static paragraph. <StaticBadge label="zero JS" />
      </p>
      <CommandPalette />
      <Comments />
    </main>
  )
}
```

```ts
// src/entry-client.ts — auto-discovered registry under @pyreon/vite-plugin
import { hydrateIslandsAuto } from '@pyreon/server/client'
// @ts-expect-error virtual module — provided by @pyreon/vite-plugin
import * as registry from 'virtual:pyreon/islands-registry'

hydrateIslandsAuto(registry)
```

## Decision tree — which `hydrate` strategy?

| Strategy           | When it fires                           | Use for                                                                                                 |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `'load'`           | Immediately on page load                | Above-the-fold interactive components (header CTA, hero)                                                |
| `'idle'`           | After `requestIdleCallback` settles     | Non-critical widgets that should hydrate when free                                                      |
| `'visible'`        | When the island scrolls into view       | Below-the-fold content (comments, deep widgets)                                                         |
| `'interaction'`    | First focus/click/pointerenter/touch    | Modals, dropdowns, command palettes (interactive but not visible)                                       |
| `'media(<query>)'` | When `window.matchMedia(query)` matches | Mobile-only menus, viewport-conditional UI                                                              |
| `'never'`          | Never                                   | Pure-display content that needs the same component tree as exports (e.g. `@pyreon/document-primitives`) |

**Pick by question:** "When does the user need this island to be interactive?"

- "Right now, on first paint" → `'load'`
- "Soon, but not blocking the main thread" → `'idle'`
- "When they scroll to it" → `'visible'`
- "When they reach for it (modal/dropdown/palette)" → `'interaction'`
- "Only on small screens" → `'media((max-width: 768px))'`
- "Never (server-render only)" → `'never'`

## `prefetch` hint

Pair `prefetch: 'idle'` or `'visible'` with a deferred-hydration strategy to pre-warm the chunk BEFORE the hydration trigger fires. Without prefetch, a `visible`-strategy island flashes blank while the chunk loads on scroll-in. With `prefetch: 'idle'`, the chunk is fetched during browser idle so by scroll-in, hydration is instant.

```tsx
// Canonical pattern — visible hydration + idle prefetch
const Comments = island(() => import('./Comments'), {
  name: 'Comments',
  hydrate: 'visible',
  prefetch: 'idle', // chunk warm before user scrolls
})
```

Prefetch is silently suppressed (no `data-prefetch` attribute emitted) when paired with `hydrate: 'load'` (loader runs synchronously already) or `hydrate: 'never'` (defeats the zero-JS strategy).

## Auto-registry vs manual

Under `@pyreon/vite-plugin` (default config: `pyreon({ islands: true })`), the plugin pre-scans your source for `island()` declarations and emits a `virtual:pyreon/islands-registry` virtual module. Your `entry-client.ts` imports it and calls `hydrateIslandsAuto(registry)`. **No manual sync** between `island()` names and a `hydrateIslands({ ... })` registry — the #1 author foot-gun is closed by construction.

For non-Vite consumers, the manual form is still public:

```ts
// src/entry-client.ts — manual form (non-Vite consumers)
import { hydrateIslands } from '@pyreon/server/client'

hydrateIslands({
  Counter: () => import('./components/Counter'),
  Comments: () => import('./components/Comments'),
  CommandPalette: () => import('./components/CommandPalette'),
  // StaticBadge has hydrate: 'never' — DO NOT register; the runtime
  // short-circuits never-strategy before the registry lookup, and
  // registering would defeat the strategy by pulling its module
  // into the client bundle graph.
})
```

## Anti-patterns

```ts
// BROKEN — registering a hydrate: 'never' island
hydrateIslands({
  StaticBadge: () => import('./components/StaticBadge'), // defeats zero-JS
})
// The whole point of 'never' is shipping zero client JS. Registering
// pulls the component module into the client bundle graph; the runtime
// short-circuits and never calls the loader, but the bundler still
// includes it. Caught by the `island-never-with-registry-entry` detector.
```

```tsx
// BROKEN — using 'interaction' for an above-the-fold interactive component
const HeaderCTA = island(() => import('./HeaderCTA'), {
  name: 'HeaderCTA',
  hydrate: 'interaction',
})
// Defeats the strategy. 'interaction' is for modals / dropdowns /
// command palettes that are interactive BUT NOT VISIBLE on load.
// Use 'load' for above-the-fold interactive content.
```

```tsx
// BROKEN — relying on focus/pointerenter to fire the click action
const CmdPalette = island(() => import('./CmdPalette'), {
  name: 'CmdPalette',
  hydrate: 'interaction',
})
// The user tabs to the palette button (focus event) → island hydrates →
// but no replay fires for focus. Only CLICK events are replayed
// post-hydration on the equivalent live element. Non-click events trigger
// hydration but not action — the user has to click again to fire it.
```

```tsx
// BROKEN — prefetch on a 'load' island
const Counter = island(() => import('./Counter'), {
  name: 'Counter',
  hydrate: 'load',
  prefetch: 'idle', // pointless — load runs the loader synchronously
})
// The framework silently suppresses the data-prefetch attribute, so
// nothing breaks at runtime — but the user is signaling intent that
// doesn't apply. Drop the prefetch field.
```

```tsx
// BROKEN — passing children to an island
const Comments = island(() => import('./Comments'), { name: 'Comments' })

;<Comments>
  <p>Initial content</p> {/* stripped during JSON serialization */}
</Comments>
// Island props are JSON-serialized for SSR → client transit. Children
// (along with functions, symbols, undefined) are stripped. The island
// renders only what its component returns from its OWN body, not what
// the parent passes as children.
```

```tsx
// BROKEN — duplicate `name` across two islands
export const A = island(() => import('./A'), { name: 'Widget' })
export const B = island(() => import('./B'), { name: 'Widget' })
// The client-side registry is keyed by name; only the FIRST loader fires.
// The second island silently fails to hydrate. Use distinct names.
```

## Why JSON-only props

Island props are serialized to JSON to embed in `<pyreon-island data-props="...">` for the client to read on hydration. Anything not JSON-native is dropped:

- ✅ Strings, finite numbers, booleans, null, arrays, plain objects
- ❌ **Stripped**: `children`, functions, symbols, `undefined`
- ❌ **Coerced**: `Date` → ISO string (no auto-revival), `Map` / `Set` / class instances lose their type
- ⚠️ `BigInt` is unsupported by `JSON.stringify`; the framework catches the throw, logs in dev, emits `{}`

For anything richer than JSON, pass an ID and have the island fetch / restore the live data on the client.

## Real-app reference

The canonical reference is `examples/islands-showcase` — one island per strategy:

- `Counter` — `hydrate: 'load'`
- `IdleClock` — `hydrate: 'idle'`
- `VisibleComments` — `hydrate: 'visible'` + `prefetch: 'idle'`
- `MobileMenu` — `hydrate: 'media((max-width: 768px))'`
- `CommandPalette` — `hydrate: 'interaction'`
- `StaticBadge` — `hydrate: 'never'` (omitted from client registry)

Real-Chromium e2e gate: `e2e/islands-showcase.spec.ts` + `e2e/islands-showcase-mobile.spec.ts`.

## Related

- Detector: `island-never-with-registry-entry` — fires when `hydrate: 'never'` AND the same name appears in `hydrateIslands({ ... })`
- Reference API: `island` / `hydrateIslands` / `hydrateIslandsAuto` in `@pyreon/server` — see `get_api({ package: "server", symbol: "island" })`
- Anti-patterns: "Islands Mistakes" section in `.claude/rules/anti-patterns.md`
