# @pyreon/a11y

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0
  - @pyreon/router@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/router@0.42.0
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0
  - @pyreon/router@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`d61d3d9`](https://github.com/pyreon/pyreon/commit/d61d3d9e3acb483b1b5fa8b79f23c03c309ab2c5), [`0ea9c60`](https://github.com/pyreon/pyreon/commit/0ea9c6006f19489eb42af9146b790ff826f2a0a3), [`0dc1f13`](https://github.com/pyreon/pyreon/commit/0dc1f1379434bbc855ee4e7a7a585759dfc2836e), [`8a7bff0`](https://github.com/pyreon/pyreon/commit/8a7bff0dda93f15afbee9a0d9ab040e2e8969ff0), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0
  - @pyreon/router@0.40.0
  - @pyreon/core@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a), [`8e8a0de`](https://github.com/pyreon/pyreon/commit/8e8a0de48a1c4aba4e09fc8e72fb72bc0c1ec68e)]:
  - @pyreon/reactivity@0.39.0
  - @pyreon/router@0.39.0
  - @pyreon/core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/core@0.38.0
  - @pyreon/router@0.38.0

## 0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0
  - @pyreon/router@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0
  - @pyreon/router@0.36.0

## 0.35.0

### Minor Changes

- [#1813](https://github.com/pyreon/pyreon/pull/1813) [`7a97c3e`](https://github.com/pyreon/pyreon/commit/7a97c3e3e64b2dab0fd9cc135a319270651ce19a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `<LiveRegion>` — a declarative `aria-live` region, the persistent and reactive complement to the imperative `announce()`. Place it once in your tree and drive its children with a signal; the browser announces every content change automatically (no `announce()` call, no effect to wire) — for status that lives somewhere specific in the layout: a form's validation summary, a "Saving…" → "Saved" indicator, an async result count, a connection-status banner. Screen-reader-only by default (reuses `VisuallyHidden`'s clipping); pass `visible` for status text that should also be seen. `politeness` accepts `'polite'` (default → `role="status"`), `'assertive'` (→ `role="alert"`), or `'off'` (silences without unmounting). Renders on the server too, so the region exists at hydration and the first reactive update is announced. SSR-safe.

- [#1765](https://github.com/pyreon/pyreon/pull/1765) [`8116eaf`](https://github.com/pyreon/pyreon/commit/8116eaf7c0a5dd1953b13da7655a06b3d8cc39b4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `<RouteAnnouncer>` + `useRouteAnnouncer()` (new `@pyreon/a11y/router` subpath) — announce client-side route changes to screen-reader users, closing the canonical SPA accessibility gap (single-page navigations change the URL + DOM but fire no page-load event, so assistive tech never announces the new page).

  Drop one `<RouteAnnouncer />` near the router root: it registers a single router `afterEach` hook that pushes the destination route's `meta.title` (or `"Navigated to <path>"`) to a polite `aria-live` region via the zero-setup `announce()`. Customize the message with a `format` callback; opt into `assertive` politeness, `clearAfter`, or `announceInitial` as needed.

  The router integration lives in the `@pyreon/a11y/router` subpath (with `@pyreon/router` as an **optional** peer dependency), so the base `@pyreon/a11y` entry stays router-free for consumers who only use `announce()` / `<VisuallyHidden>` / `createA11yId` — the `@pyreon/i18n` vs `@pyreon/i18n/core` split precedent. SSR-safe (the hook registers only in `onMount`; `announce()` no-ops on the server).

- [#1798](https://github.com/pyreon/pyreon/pull/1798) [`8f51ac7`](https://github.com/pyreon/pyreon/commit/8f51ac7e381a91eedf0412368bfa9e47d753c6c6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `<SkipLink>` — a keyboard "skip to content" link (WCAG 2.4.1 Bypass Blocks). Render it as the first focusable element on the page: it stays clipped out of view until focused (first Tab), then appears at the top-left, and activating it moves BOTH scroll and keyboard focus to the target landmark (default `#main`) — adding a programmatic-focus `tabindex` automatically when the target isn't natively focusable. A `style` object merges over the built-in reveal styles to restyle the focused appearance without losing the hide-until-focus behavior.

- [#1743](https://github.com/pyreon/pyreon/pull/1743) [`4c021f1`](https://github.com/pyreon/pyreon/commit/4c021f17e3405e34f71a8266ab1dda45d99ff100) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New package `@pyreon/a11y` — zero-setup accessibility primitives:

  - **`announce(message, options?)`** — speak status updates and errors to
    screen readers via an `aria-live` region created lazily on first call. No
    provider, no component to mount; SSR-safe (no-op on the server). `polite`
    (default, queued) / `assertive` (interrupts) politeness, optional
    `clearAfter`, and identical consecutive messages re-announce (clear-then-set).
  - **`<VisuallyHidden>`** — content invisible on screen but kept in the
    accessibility tree (unlike `display:none` / `hidden`).
  - **`createA11yId(prefix?)`** — stable, SSR-safe ids for ARIA relationship
    attributes (`aria-labelledby` / `aria-describedby` / `for`).

  The shared foundation other Pyreon packages build on for out-of-the-box
  accessibility (router announcements, form field wiring, etc.).

### Patch Changes

- Updated dependencies [[`06971cc`](https://github.com/pyreon/pyreon/commit/06971cc33850a70dbf5ab335e491a535823dd576), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`af85ce3`](https://github.com/pyreon/pyreon/commit/af85ce3dfc590db06838834c32d88f434e7f2769)]:
  - @pyreon/router@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0
