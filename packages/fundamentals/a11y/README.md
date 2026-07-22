# @pyreon/a11y

Accessibility primitives for [Pyreon](https://github.com/pyreon/pyreon) — screen-reader announcements, visually-hidden content, and stable ARIA ids. **Zero setup**: no provider, no context, no component to mount.

```bash
bun add @pyreon/a11y
```

## `announce(message, options?)`

Speak a message to screen-reader users via an `aria-live` region. The first call lazily creates a visually-hidden region on `document.body` and reuses it — works from anywhere, no wiring. No-op on the server.

```ts
import { announce } from '@pyreon/a11y'

announce('Settings saved')                              // polite (queued)
announce('Connection lost', { politeness: 'assertive' }) // interrupts — errors only
announce('Copied to clipboard', { clearAfter: 1000 })    // auto-clear after 1s
```

- `politeness`: `'polite'` (default — queued, spoken when idle) or `'assertive'` (interrupts; reserve for errors / time-critical alerts).
- `clearAfter`: ms after which the region is emptied, so stale text isn't re-read.
- Identical consecutive messages are still re-announced (the region is cleared then re-written on the next frame).

## `<LiveRegion>`

The declarative, persistent complement to the imperative `announce()`: an `aria-live` region you OWN and position. Drive its children with a signal — whenever the content changes, screen readers announce the new value automatically (the browser's live-region machinery observes the DOM mutation; no `announce()` call, no effect to wire). Use it for status that lives somewhere specific in the layout: a form's validation summary, a "Saving…" → "Saved" indicator, a result count.

```tsx
import { LiveRegion } from '@pyreon/a11y'

<LiveRegion>{() => statusText()}</LiveRegion>                    // screen-reader-only, polite
<LiveRegion politeness="assertive">{() => errorText()}</LiveRegion>
<LiveRegion visible role="log" atomic={false}>{() => feed()}</LiveRegion>
```

- `politeness`: `'polite'` (default) / `'assertive'` / `'off'` (keeps the region in the DOM but silences it — toggle reactively without unmounting).
- `atomic` (default `true`): announce the WHOLE region on change; set `false` with `role="log"` for append-only feeds.
- `role`: defaults to `'status'` for polite, `'alert'` for assertive.
- `visible` (default `false`): render visibly instead of screen-reader-only (a visible "Saving…" line that doubles as the live region).

Because it renders on the server too, the region exists at hydration — the very first reactive update is announced. Prefer `announce()` for fire-and-forget global messages; prefer `<LiveRegion>` for owned, positioned, signal-driven status.

## `<VisuallyHidden>`

Content that's invisible on screen but kept in the accessibility tree (unlike `display:none` / `hidden`). For labels and status text sighted users get from context but screen-reader users need spelled out.

```tsx
import { VisuallyHidden } from '@pyreon/a11y'

<button>
  <SearchIcon />
  <VisuallyHidden>Search</VisuallyHidden>
</button>
```

Renders a `<span>` by default; pass `as="div"` (or any tag) where inline flow is wrong. Other props (`id`, `class`, `aria-*`, …) are forwarded; caller `style` merges over the clipping base. Don't put focusable controls inside — a visually-hidden focusable element is a keyboard trap.

## `<SkipLink>`

A "Skip to content" link — hidden until keyboard-focused (the first Tab on the page reveals it), then jumps BOTH scroll and keyboard focus to your main landmark, so keyboard / screen-reader users don't have to tab through the whole header on every page. Place it as the first element in `<body>` / your root layout.

```tsx
import { SkipLink } from '@pyreon/a11y'

<SkipLink />                                  // targets #main, text "Skip to content"
<SkipLink href="#content">Skip to article</SkipLink>

<main id="main">…</main>
```

- `href` (default `'#main'`): in-page fragment pointing at your main landmark. The target gets a programmatic-focus `tabindex="-1"` if it has none, so the next Tab continues from the content.
- Styling: hidden with the same clip technique as `<VisuallyHidden>`, revealed fixed at the top-left on focus with neutral defaults — pass `style` / `class` to restyle the focused appearance without losing the hide-until-focus behavior.

## `createA11yId(prefix?)`

Stable, SSR-safe unique id for ARIA relationship attributes (`aria-labelledby` / `aria-describedby` / `aria-controls` / `for`). Wraps `@pyreon/core`'s `createUniqueId`, so server and client agree — no hydration mismatch.

```tsx
import { createA11yId } from '@pyreon/a11y'

function Field() {
  const hintId = createA11yId('hint')
  return (
    <>
      <input aria-describedby={hintId} />
      <span id={hintId}>Must be at least 8 characters</span>
    </>
  )
}
```

Call it inside the component (not at module scope) so each instance gets its own id.

## `<RouteAnnouncer>` / `useRouteAnnouncer()` — `@pyreon/a11y/router`

Announce client-side route changes to screen-reader users. Single-page navigations change the URL + DOM but fire no page-load event, so assistive tech never announces the new page — this closes that gap. Drop one `<RouteAnnouncer>` near the router root: it registers a single router `afterEach` hook that pushes the destination route's `meta.title` (or `"Navigated to <path>"`) to a polite `aria-live` region via [`announce()`](#announcemessage-options).

```tsx
import { RouteAnnouncer } from '@pyreon/a11y/router'

function App({ router }) {
  return (
    <RouterProvider router={router}>
      <RouteAnnouncer />
      <RouterView />
    </RouterProvider>
  )
}
```

Customize the message with `format`, or opt into `assertive` / `clearAfter` / `announceInitial`:

```tsx
<RouteAnnouncer format={(to) => `${to.meta.title ?? to.path} page`} />
```

The hook form `useRouteAnnouncer(options?)` is equivalent — call it once from a long-lived component.

**Overlap with `@pyreon/router`'s built-in announcements**: the root `<RouterView>` already announces route changes by default (its `announceRouteChanges` prop) — mounting `<RouteAnnouncer>` alongside it produces DOUBLE announcements, so pass `<RouterView announceRouteChanges={false}>` when you use `<RouteAnnouncer>` (reach for it when you need `format` / politeness / `clearAfter` control the built-in doesn't offer).

Imported from the `@pyreon/a11y/router` subpath (with `@pyreon/router` as an **optional** peer dependency), so the base `@pyreon/a11y` entry stays router-free for consumers who only use `announce()` / `<VisuallyHidden>` / `createA11yId`. SSR-safe — the hook registers only in `onMount` and `announce()` no-ops on the server.

## License

MIT
