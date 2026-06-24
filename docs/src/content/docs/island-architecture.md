---
title: 'Island Architecture'
description: Partial hydration in Pyreon — zero JS by default, six hydration strategies, the prefetch hint, the prop codec, auto-registry, the zero integration, and the doctor + MCP audit gates.
---

Pyreon's island architecture is **partial hydration**: the page renders as zero-JS server HTML, and only the components you explicitly mark as islands ship JavaScript to the client and hydrate. Each island also decides *when* it hydrates — immediately, when the browser is idle, when it scrolls into view, on first interaction, on a media-query match, or never.

<PackageBadge name="@pyreon/server" href="/docs/server" />

Islands live in `@pyreon/server`. There is no `@pyreon/islands` package — `island()` is a server-side factory and `hydrateIslands()` / `hydrateIslandsAuto()` are client-side entry helpers, both shipped from `@pyreon/server` (and its client-safe `@pyreon/server/client` subentry).

## The idea

A normal SSR app server-renders HTML and then hydrates the **entire** component tree on the client — every component's JavaScript is downloaded and re-run to attach event handlers. For a content-heavy page (a blog post, a docs page, a marketing landing page) where 95% of the DOM is static prose, that's a lot of JavaScript shipped to make a handful of widgets interactive.

Islands invert the default:

- The page is **static HTML** — zero client JavaScript, zero hydration.
- Each interactive zone is wrapped in `island()`, which renders inside a `<pyreon-island>` custom element carrying serialized props and a hydration strategy.
- On the client, only the JavaScript for the islands actually present in the HTML is loaded — and only when each island's strategy says to.

```tsx
import { island } from '@pyreon/server/client'

const Counter = island(() => import('./Counter'), { name: 'Counter' })
const Search = island(() => import('./Search'), { name: 'Search' })

function Article() {
  return (
    <article>
      <h1>How signals work</h1>      {/* static — no JS */}
      <Counter initial={5} />        {/* island — hydrated */}
      <p>… long static prose …</p>   {/* static — no JS */}
      <Search />                     {/* island — hydrated */}
    </article>
  )
}
```

The `<h1>` and `<p>` ship as plain HTML. Only `Counter` and `Search` carry client JavaScript.

:::warning{title="Import island() from @pyreon/server/client in any client-bundled file"}
`island()` itself is client-safe — it only renders the `<pyreon-island>` marker via `h()` and encodes props. But the `@pyreon/server` **main barrel** also re-exports `createHandler` / `prerender`, which pull in `node:` modules (`node:fs/promises`, `node:path`, `node:async_hooks`) and the package's singleton guard.

If you call `island()` in a file that gets bundled client-side — most importantly **any `@pyreon/zero` route**, since every route ships to the client for hydration — a `from '@pyreon/server'` barrel import drags the whole server module into the browser bundle. That crashes the build (duplicate `@pyreon/server` singleton sentinel) and breaks the hydrated island (split context graph). Always use `import { island } from '@pyreon/server/client'` in client-reachable code.

A server-only declaration file (imported solely by `entry-server.ts`, as in `examples/islands-showcase`) may use either path, but `@pyreon/server/client` is the safe default everywhere.
:::

## When to use islands (and when not to)

Islands pay off on **content-heavy pages with isolated interactive zones** — blogs, marketing pages, documentation, news. Most of the page is static; a few regions are interactive (a counter, a search bar, a comment thread, a video player).

Islands are **not** the right tool for:

- **App shells where most of the UI is interactive.** Use the regular SSR + hydrate-everything pattern (`createHandler` + `startClient`) — it ships less HTML wrapper overhead per route than islands' per-zone markers.
- **Static displays that never become interactive.** Just server-render them with no island wrapper at all — zero JS, zero hydration cost, no registry entry.
- **Components whose content depends on live parent state.** Island props are JSON-serialized for the SSR-to-client transit (see [Props serialization](#props-serialization)) — children, functions, and live closures don't survive. Move the island wrapper *inside* the component if it needs live parent state.

Rule of thumb: if you'd write `<App />` and hydrate the whole tree under it, use the regular SSR pipeline. If you'd write `<Article />` with a few `<Counter />` / `<Comments />` islands inside it, this page is for you.

## How it works

**Server side.** `island(loader, options)` wraps an async component import and returns a `ComponentFn`. During SSR/SSG it:

1. Serializes the props to a JSON string (via the [prop codec](#props-serialization)).
2. Resolves the dynamic import and renders the component output **inside** a `<pyreon-island>` element, so the static HTML carries the island's first-paint content (good for SEO, no-JS visitors, and avoiding layout shift).
3. Stamps the element with `data-component`, `data-props`, `data-hydrate`, and (when relevant) `data-prefetch` attributes.

Every non-island component renders to plain HTML with no client wiring.

**Client side.** Your `entry-client.ts` calls `hydrateIslandsAuto(registry)` (or the manual `hydrateIslands({ ... })`). It:

1. Scans the DOM for `<pyreon-island>` elements.
2. For each one, reads its `data-hydrate` strategy and schedules WHEN to fetch the chunk and hydrate — immediately, on idle, on scroll-in, on first interaction, on a media-query match, or never.
3. Loads JavaScript only for components actually present in the HTML; unused components are tree-shaken.

The returned cleanup function disconnects any pending observers / idle callbacks / event listeners.

## `island()` reference

```ts
function island<P extends Props>(
  loader: () => Promise<{ default: ComponentFn<P> } | ComponentFn<P>>,
  options: IslandOptions,
): ComponentFn<P> & IslandMeta
```

The `loader` is a dynamic `import()`. It may resolve to a module with a `default` export OR a bare `ComponentFn` — both shapes are accepted.

### `IslandOptions`

| Option     | Type                 | Default    | Description                                                                                          |
| ---------- | -------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `name`     | `string`             | (required) | Unique island name. Must match the key in the client-side registry (manual `hydrateIslands` form). Two islands sharing a name is a foot-gun — see the [audit](#pyreon-doctor-check-islands). |
| `hydrate`  | `HydrationStrategy`  | `'load'`   | When to hydrate on the client. See [the six strategies](#the-six-strategies).                        |
| `prefetch` | `PrefetchStrategy`   | `'none'`   | Pre-warm the chunk before the hydration trigger fires. See [Prefetch hint](#prefetch-hint).          |

The returned component carries an `IslandMeta` marker (`{ __island: true, name, hydrate, prefetch }`) so build tooling (the CLI scanner, MCP, the auto-registry) can detect islands without runtime introspection.

## The six strategies

The `HydrationStrategy` type:

```ts
type HydrationStrategy =
  | 'load'
  | 'idle'
  | 'visible'
  | 'interaction'
  | 'never'
  | `media(${string})`
  | `interaction(${string})`
```

| Strategy             | Hydrates when…                                                                  | Use for                                                                            |
| -------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `'load'`             | Immediately on page load (default).                                             | Above-the-fold interactive content meant to be used on first paint (header CTAs, hero buttons, primary forms). |
| `'idle'`             | Next `requestIdleCallback` (falls back to `setTimeout`).                         | Above-the-fold but non-critical (typeahead, analytics widgets, share buttons).     |
| `'visible'`          | The island scrolls within `~200px` of the viewport (`IntersectionObserver`).    | Below-the-fold content (comment threads, related-posts widgets).                   |
| `'interaction'`      | First `focus` / `click` / `pointerenter` / `touchstart` / `submit` on the marker. | Interactive but NOT visible until reached for (modals, dropdowns, command palettes). |
| `'interaction(...)'` | First matching event from a custom comma-separated list.                        | Same as above, but narrowing the trigger events.                                   |
| `'media(...)'`       | The `matchMedia()` query matches (now, or on the next match).                    | Viewport-/device-/preference-specific components (mobile menu, desktop sidebar).   |
| `'never'`            | Never — render only, ship zero client JS.                                        | Server-rendered "live" data that never re-renders (badges, timestamps, counts).    |

Choosing wrong has user-visible consequences:

- `'idle'` for above-the-fold content makes forms look unresponsive for the first idle window after load.
- `'visible'` without prefetch shows a blank-while-fetching flash when the user scrolls to the island — pair it with `prefetch: 'idle'`.
- `'interaction'` for above-the-fold content means the button shows but doesn't respond on the first click; the click is *replayed* once hydration finishes (see below), but there's a perceptible lag.
- `'never'` registered in the client registry defeats the whole point of `'never'` (zero client JS) — see the [warning](#never-render-only-zero-client-js).

### `'load'` — hydrate immediately

The default. The island fetches its chunk and hydrates synchronously on page load.

```tsx
import { island } from '@pyreon/server/client'

export const Counter = island(() => import('./components/Counter'), {
  name: 'Counter',
  hydrate: 'load', // explicit; this is also the default
})
```

### `'idle'` — hydrate when the browser is idle

Defers hydration to the next `requestIdleCallback`. The user sees content immediately; interactivity is deferred until the browser has finished critical work. Falls back to a `setTimeout` of `~200ms` in browsers without `requestIdleCallback`.

```tsx
export const SearchBar = island(() => import('./components/SearchBar'), {
  name: 'SearchBar',
  hydrate: 'idle',
})
```

### `'visible'` — hydrate when the island scrolls into view

Uses an `IntersectionObserver` with `rootMargin: '200px'`, so hydration starts roughly 200px before the island crosses the viewport — the fetch-and-hydrate window is hidden behind the user's scroll velocity. In browsers without `IntersectionObserver`, the island hydrates immediately as a fallback.

```tsx
export const Comments = island(() => import('./components/Comments'), {
  name: 'Comments',
  hydrate: 'visible',
  prefetch: 'idle', // pre-warm the chunk during idle — see below
})
```

### `'interaction'` — hydrate on first user interaction

Best for components that are interactive **but not visible on initial paint** — modals, dropdowns, command palettes. The runtime registers one-shot capture-phase listeners on the `<pyreon-island>` element for the default event set:

`focus`, `click`, `pointerenter`, `touchstart`, `submit`

The first matching event triggers hydration, then **all** listeners are removed (one-shot).

```tsx
export const CommandPalette = island(() => import('./components/CommandPalette'), {
  name: 'CommandPalette',
  hydrate: 'interaction',
})

// Custom event list — narrow the trigger
export const Tooltip = island(() => import('./components/Tooltip'), {
  name: 'Tooltip',
  hydrate: 'interaction(focus,pointerenter)',
})
```

**Clicks and form submits are captured and replayed.** The SSR DOM has no live handlers yet, so a pre-hydration interaction would otherwise be lost (or, for a form, trigger a full-page navigation before the live handler exists). The runtime:

1. Captures the `click` or `submit`, calling `preventDefault()` + `stopImmediatePropagation()` so the browser doesn't act on it prematurely.
2. Records an identifying *replay path* for the target — preferring `data-testid`, falling back to a tag-and-child-index walk relative to the island root (so it survives the DOM swap hydration may perform).
3. After hydration completes, re-dispatches the equivalent event on the live element: a synthetic `MouseEvent('click')` for clicks, a synthetic `SubmitEvent('submit')` (re-dispatched on the live `<form>`, so the handler reads the user's current `FormData`) for submits.

This closes both the "user clicks but nothing happens until they retry" trap and the more severe "form silently navigates away before the island wakes up" data-loss trap. Other trigger events (`focus`, `pointerenter`, `touchstart`) start hydration but are not replayed — `focus` can't be reliably re-dispatched once the user has tabbed past, and `pointerenter` is passive.

:::warning{title="'interaction' is not for above-the-fold content"}
`'interaction'` is for components that are interactive **but not visible** on first paint. For a button the user sees and is meant to click on load, use `'load'` — `'interaction'` shows the button but doesn't respond until the first click is replayed through a hydration round-trip, which the user perceives as lag.
:::

### `'media(...)'` — hydrate when a media query matches

The string between the parens is passed verbatim to `matchMedia()`. If the query already matches at page load, hydration starts immediately; otherwise the runtime listens for the query to start matching and hydrates then.

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

### `'never'` — render only, zero client JS

The component renders during SSR but the client runtime short-circuits before fetching any JS. Useful for content that's "live" at the server (timestamps, counts, badges) but never needs client-side reactivity.

```tsx
export const StaticBadge = island(() => import('./components/StaticBadge'), {
  name: 'StaticBadge',
  hydrate: 'never',
})
```

:::warning{title="Never register a 'never' island in the client registry"}
A `hydrate: 'never'` island MUST NOT appear in the manual `hydrateIslands({ ... })` registry. Registering it pulls the component module into the client bundle graph — defeating the zero-JS goal — even though the runtime short-circuits before invoking the loader. The auto-registry omits `'never'` islands automatically; the manual form is your responsibility. The `pyreon doctor --check-islands` audit catches the mistake (finding code: `never-with-registry-entry`).
:::

## Prefetch hint

Pair a deferred strategy (`'visible'`, `'interaction'`, `'media(...)'`) with a `prefetch` hint to start fetching the island's chunk **before** the hydration trigger fires, so hydration is instant against an already-warm module cache instead of blank-while-fetching.

```ts
type PrefetchStrategy = 'none' | 'idle' | 'visible'
```

| Prefetch    | Meaning                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| `'none'`    | Default. The loader runs only when the hydration trigger fires.                |
| `'idle'`    | Fire-and-forget the loader during the next `requestIdleCallback` (falls back to a `~200ms` timeout). |
| `'visible'` | Fire-and-forget the loader when the island scrolls within `~200px` of the viewport. |

The canonical pairing is `hydrate: 'visible'` + `prefetch: 'idle'` — "fetch during browser idle, hydrate on scroll-in":

```tsx
export const Comments = island(() => import('./components/Comments'), {
  name: 'Comments',
  hydrate: 'visible',
  prefetch: 'idle',
})
```

Prefetch and hydration schedule independently — each registers its own observer / idle callback — and rely on JavaScript's import-promise deduplication to share the underlying module fetch. So a `'visible'` island with `prefetch: 'idle'` hits a warm cache when its `IntersectionObserver` finally fires.

Prefetch is suppressed (no `data-prefetch` attribute emitted) when paired with `hydrate: 'load'` (the loader runs synchronously already) or `hydrate: 'never'` (defeats zero-JS). The framework silently drops the field in those cases — nothing breaks, but you're signaling intent that doesn't apply.

## Props serialization

Island props are JSON-serialized into the `<pyreon-island data-props="…">` attribute on the server and decoded back on the client. Pyreon ships a roundtrip-preserving codec (`encodeIslandProps` / `decodeIslandProps`) that goes beyond naive `JSON.stringify`:

| Prop value                                                | Survives the SSR-to-client roundtrip?                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Strings, finite numbers, booleans, `null`, arrays, plain objects | Yes — JSON-native, byte-identical.                                                                              |
| `Date`, `Map`, `Set`, `RegExp`, `BigInt`                  | Yes — tagged with an internal `__pyreon_t` marker on the wire; the client decoder restores the real type, not an ISO string or empty object. |
| Functions, symbols, `undefined`                           | Dropped silently on plain objects (mirrors `JSON.stringify`); replaced with `null` in arrays / `Map` values / `Set` items. |
| `children`                                                | Dropped (with a dev-mode warning — it's the most common surprise).                                                     |
| Instances of custom classes                               | Fail loud — a dev-mode error naming the prop path + constructor; props fall back to `{}`.                              |
| Circular references / nesting deeper than 100 levels      | Fail loud — same named-path error, falls back to `{}`. The error is caught so it never 500s the SSR.                   |

```tsx
// ✅ These all round-trip:
<EventCard date={new Date('2026-01-01')} tags={new Set(['a', 'b'])} />
<Pricing tiers={new Map([['pro', 29], ['team', 99]])} pattern={/\d+/g} id={42n} />

// ❌ children are dropped — render content inside the island instead:
<Widget>{someContent}</Widget>          // `someContent` never reaches the client

// ❌ class instances fail loud — pass an ID and restore on the client:
<Profile user={new User(...)} />        // dev error; use user={{ id, name }} or user-id
```

For anything more complex than the supported set, pass an ID and have the island component fetch or restore the rich value on the client.

:::note{title="If your data literally has a __pyreon_t key"}
If one of your plain objects legitimately uses `__pyreon_t` as an own key, the codec wraps it in an automatic escape marker (`'e'`) so the decoder doesn't mistake it for a tagged value — your object round-trips unchanged. You don't need to do anything.
:::

## Client hydration: auto-registry vs manual

### Auto-registry (recommended)

Under `@pyreon/vite-plugin`, the client-side registry is **auto-discovered from your source**. The plugin pre-scans for `island(() => import('PATH'), { name, hydrate })` calls and emits a virtual module you import in your entry. This is enabled by default (`pyreon({ islands: true })` is the default; only `pyreon({ islands: false })` opts out).

```ts title="src/entry-client.ts"
import { hydrateIslandsAuto } from '@pyreon/server/client'
// @ts-expect-error virtual module — provided by @pyreon/vite-plugin
import * as registry from 'virtual:pyreon/islands-registry'

hydrateIslandsAuto(registry)
```

That's the entire island client entry. No manual map to keep in sync with your `island()` declarations — registry drift (a typo, a forgotten entry, a renamed island) is the #1 island foot-gun, and the auto-registry closes it by construction.

`'never'`-strategy islands are deliberately omitted from the auto-registry, so their components stay out of the client bundle entirely.

`hydrateIslandsAuto()` throws a descriptive error if it's handed the stub registry the plugin emits when `pyreon({ islands: false })` is set — pointing you to either re-enable islands or switch to the manual form.

### Manual registry

For non-Vite consumers (library authors, custom build pipelines), pass an explicit map of names to loaders:

```ts title="src/entry-client.ts"
import { hydrateIslands } from '@pyreon/server/client'

const cleanup = hydrateIslands({
  Counter: () => import('./components/Counter'),
  Comments: () => import('./components/Comments'),
  // StaticBadge intentionally omitted — it's hydrate: 'never'
})
```

`hydrateIslands` returns a cleanup function that disconnects every pending observer, idle callback, and listener. **Wire it up under HMR / SPA route changes** — calling `hydrateIslands()` again without invoking the previous cleanup leaks the prior observers and listeners (a dev-mode warning fires):

```ts
const cleanup = hydrateIslands({ /* … */ })
if (import.meta.hot) import.meta.hot.dispose(cleanup) // HMR
// or, on SPA route change: cleanup() before re-registering
```

:::warning{title="Registry keys must match the island name exactly"}
A `hydrateIslands({ X })` entry whose key doesn't exactly match an `island()` declaration's `name` (case-sensitive) is a no-op — the island logs `No loader registered for island "…"`, stamps `data-island-error="no-loader"`, and stays un-hydrated. The auto-registry eliminates this class of bug entirely; the `pyreon doctor --check-islands` audit catches it for the manual form (finding code: `registry-mismatch`).
:::

## Using islands with `@pyreon/zero`

`@pyreon/zero` re-exports `island` (from `@pyreon/server/client`), so a zero app declares islands with `import { island } from '@pyreon/zero'` and needs **no manual `hydrateIslands` wiring** — `startClient({ routes })` is enough.

This works because zero islands are **self-hydrating**. A zero route is a reactive child of `RouterView`, so on the client the server-rendered route DOM is discarded and re-mounted (not hydrated in place). A one-shot external `hydrateIslandsAuto` scan would race that async route mount, and an inline async island render would throw with no Suspense boundary. So in a client context, `island()` renders only its `<pyreon-island>` marker, then on mount loads the chunk and mounts the component into the marker per its strategy — the island owns its own hydration lifecycle.

The marker also captures its context owner synchronously at render time and re-establishes it at hydration time, so a component inside the island (e.g. a `rocketstyle` component reading the `PyreonUI` theme) resolves ancestor context correctly even though hydration is deferred.

```tsx title="src/routes/blog/[slug].tsx (a @pyreon/zero route)"
import { island } from '@pyreon/zero'

const Comments = island(() => import('../../islands/Comments'), {
  name: 'Comments',
  hydrate: 'visible',
  prefetch: 'idle',
})

export default function Post() {
  return (
    <article>
      <h1>…</h1>
      <Comments postId="123" />
    </article>
  )
}
```

The inverse pattern — a cacheable page with per-request **server**-rendered holes — is **server islands** (`serverIsland()`). That's a different feature; see [Zero → Server Islands](/docs/zero#server-islands).

## Foot-guns — caught by audits

Pyreon ships static + runtime gates that catch the recurring island foot-guns at build time, not at runtime against a confused user.

### `pyreon doctor --check-islands`

Walks your project's source roots and runs five cross-file detectors. Each finding includes a file path, line/column, and an actionable fix.

```bash
pyreon doctor --check-islands         # human-readable
pyreon doctor --check-islands --json  # CI-pipeable JSON
```

| Finding code                | Catches                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `duplicate-name`            | Two `island()` declarations with the same `name`. The runtime hydrates only the first loader; the rest fail silently.                         |
| `never-with-registry-entry` | A `hydrate: 'never'` island that's also in the client registry — defeats the zero-JS goal.                                                    |
| `registry-mismatch`         | A `hydrateIslands({ X })` entry where `X` has no matching `island()` declaration anywhere (typo / removed / forgotten import).                |
| `nested-island`             | An `island()` whose loader-imported file ALSO contains an `island()` call. The outer's `hydrateRoot` would replace the inner subtree before its loader runs. |
| `dead-island`               | An `island()` declared in a file no other source imports. The component never reaches a rendered tree.                                        |

Wire it into CI by piping `--json` and gating the merge on a non-empty findings array.

:::warning{title="Don't nest islands"}
An `island()` whose loader target also contains an `island()` is unsupported — when the outer island hydrates, its `hydrateRoot` replaces the inner subtree before the inner loader runs, so the inner island never hydrates. The runtime detects this at hydration time (logs an error, stamps `data-island-error="nested"`, and skips), and `--check-islands` catches it statically. Flatten the two components, or move the inner island out of the outer's tree.
:::

### MCP `audit_islands` tool

The same five detectors are exposed via the `audit_islands` MCP tool, so AI coding assistants can surface project-wide island issues before writing island code.

```ts
audit_islands({})              // markdown-grouped report
audit_islands({ json: true })  // machine-readable findings
```

### MCP `validate` tool — per-snippet detector

`island-never-with-registry-entry` is also implemented as a per-file static detector in `@pyreon/compiler` and surfaced via the MCP `validate` tool — same finding shape, fired on a single snippet rather than the whole project.

## Diagnostic attributes

The runtime stamps `<pyreon-island>` elements with state/error attributes you can read in tests or devtools:

| Attribute                              | Meaning                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `data-island-state="awaiting-interaction"` | An `'interaction'` island is waiting for its first trigger event.        |
| `data-island-state="hydrating"`        | Hydration is in flight (set during `'interaction'` hydration).                |
| `data-island-error="nested"`           | Skipped — nested inside another island.                                       |
| `data-island-error="no-loader"`        | No registry loader matched `data-component` (manual-registry mismatch).       |
| `data-island-error="invalid-props"`    | The `data-props` JSON failed to parse.                                        |
| `data-island-error="hydration-failed"` | The loader resolved but the component threw during hydration.                 |

A successfully hydrated island clears its `data-island-state` and carries no `data-island-error`.

## Real-app reference

[`examples/islands-showcase`](https://github.com/pyreon/pyreon/tree/main/examples/islands-showcase) ships one island per strategy, with a `'visible'` + `prefetch: 'idle'` comments island as the canonical "below the fold + warmed" pattern. It uses `hydrateIslandsAuto()` and is exercised by the project's e2e gate (real Chromium, desktop + mobile viewports), so every strategy is end-to-end verified on every PR.

## See also

- [`@pyreon/server`](/docs/server) — the SSR handler and the rest of the server-side surface
- [`@pyreon/zero`](/docs/zero) — file-system routing, the self-hydrating zero integration, and server islands
- [`@pyreon/runtime-server`](/docs/runtime-server) — the lower-level `renderToString` / `renderToStream` primitives
- [`@pyreon/vite-plugin`](/docs/vite-plugin) — the build-time integration that powers the auto-registry
- [`@pyreon/cli`](/docs/cli) — `pyreon doctor --check-islands`
- [`@pyreon/mcp`](/docs/mcp) — the `audit_islands` + `validate` tools for AI agents
