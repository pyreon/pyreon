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

Imported from the `@pyreon/a11y/router` subpath (with `@pyreon/router` as an **optional** peer dependency), so the base `@pyreon/a11y` entry stays router-free for consumers who only use `announce()` / `<VisuallyHidden>` / `createA11yId`. SSR-safe — the hook registers only in `onMount` and `announce()` no-ops on the server.

## License

MIT
