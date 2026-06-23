---
'@pyreon/a11y': minor
---

Add `<RouteAnnouncer>` + `useRouteAnnouncer()` (new `@pyreon/a11y/router` subpath) — announce client-side route changes to screen-reader users, closing the canonical SPA accessibility gap (single-page navigations change the URL + DOM but fire no page-load event, so assistive tech never announces the new page).

Drop one `<RouteAnnouncer />` near the router root: it registers a single router `afterEach` hook that pushes the destination route's `meta.title` (or `"Navigated to <path>"`) to a polite `aria-live` region via the zero-setup `announce()`. Customize the message with a `format` callback; opt into `assertive` politeness, `clearAfter`, or `announceInitial` as needed.

The router integration lives in the `@pyreon/a11y/router` subpath (with `@pyreon/router` as an **optional** peer dependency), so the base `@pyreon/a11y` entry stays router-free for consumers who only use `announce()` / `<VisuallyHidden>` / `createA11yId` — the `@pyreon/i18n` vs `@pyreon/i18n/core` split precedent. SSR-safe (the hook registers only in `onMount`; `announce()` no-ops on the server).
