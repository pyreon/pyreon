# @pyreon/a11y

## 0.50.0

### Patch Changes

- [#2458](https://github.com/pyreon/pyreon/pull/2458) [`24df62e`](https://github.com/pyreon/pyreon/commit/24df62ee3e27d1cc624f627c1277fbed4866e91e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Focus-management hardening (audited a11y gaps):

  - **`useFocusTrap` upgraded to focus-scope quality.** Concurrent traps now form a scope STACK — one shared pair of document listeners, only the most recently activated trap whose container exists handles events, and deactivating/unmounting it reactivates the trap beneath (stacked modals no longer fight over the same Tab event). NEW focusin containment: a programmatic `.focus()` or mouse click that lands focus outside the container is recaptured back in (Tab-only trapping missed those escapes); the recapture is microtask-deferred and re-checked so a close flow that restores focus + unmounts in the same flush is never fought. `initialFocus: true` now prefers a `[data-autofocus]` descendant over the first tabbable. Existing call shapes (`useFocusTrap(getEl)`, positional `active`, options object) are unchanged.
  - **New `useInertOthers(getEl, options?)` hook** — applies the native `inert` attribute to every sibling subtree outside the given element (walking up to `document.body`), making `aria-modal="true"` actually true for sighted keyboard users AND assistive tech. Exact-restore on cleanup (elements that were already `inert` stay inert), per-element refcount so stacked overlays never un-inert what an outer overlay still needs, live regions (`[aria-live]`) skipped so announcements keep working, reactive application via a signal-backed getter.
  - `@pyreon/ui-primitives` `ModalBase` (private) now wires `useInertOthers` behind its open lifecycle and arms its focus trap in OPEN order.
  - `@pyreon/a11y` README: documents the shipped `<LiveRegion>` + `<SkipLink>` (previously absent) and the `<RouteAnnouncer>` ↔ `RouterView announceRouteChanges` double-announcement overlap.

- Updated dependencies [[`f3f5d3b`](https://github.com/pyreon/pyreon/commit/f3f5d3b70d2bd19b23b802ea21ad8ba9d5e416a7)]:
  - @pyreon/core@0.50.0
  - @pyreon/reactivity@0.50.0
  - @pyreon/router@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [[`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85), [`d935083`](https://github.com/pyreon/pyreon/commit/d935083033edd2c0e74c8fa71e46d9dfcdb661e7)]:
  - @pyreon/core@0.49.0
  - @pyreon/router@0.49.0
  - @pyreon/reactivity@0.49.0

## 0.48.0

### Patch Changes

- [#2369](https://github.com/pyreon/pyreon/pull/2369) [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Whole-class bundle-size fix: every module-level `nativeCompat(X)` STATEMENT (28 sites across 16 packages) converted to the `/* @__PURE__ */` assignment form. Inside a built lib's shared chunk the bare statement is an unremovable side effect that retains the component's body in every consumer bundle that never imports it — measured ~1.2KB gz of dead transition machinery in a mount-only app from runtime-dom's three sites alone; the sweep applies the same fix to ErrorBoundary, HeadProvider, Router components, RouteAnnouncer, Form components, providers across i18n/permissions/query (6 sites)/toast's Toaster, and the ui-system providers. Marker semantics are unchanged (`nativeCompat` returns the same fn; live-probed and locked by the existing native-marker suites). Two new locks: a lib-level tree-shake spec (mount-only bundle must not contain transition machinery, with a positive control) and a repo-wide census guard that fails on any new bare statement.

- Updated dependencies [[`0ba8da3`](https://github.com/pyreon/pyreon/commit/0ba8da3c22bdf722b5f6a6aea11ee7a9e53a2e7d), [`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`c3dab73`](https://github.com/pyreon/pyreon/commit/c3dab7368cb22ea2229b5d5a03e7f86b94098cd6), [`c1f398a`](https://github.com/pyreon/pyreon/commit/c1f398aff02411a49c922902be7721a253ba2443), [`068754c`](https://github.com/pyreon/pyreon/commit/068754caba2fbea93a794342f6d6ccdf87d047c1), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/router@0.48.0
  - @pyreon/reactivity@0.48.0
  - @pyreon/core@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715)]:
  - @pyreon/core@0.47.0
  - @pyreon/reactivity@0.47.0
  - @pyreon/router@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [[`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04), [`f807c5e`](https://github.com/pyreon/pyreon/commit/f807c5e4e1f64da2a1786b1c3578861c77749d8d), [`cfb2862`](https://github.com/pyreon/pyreon/commit/cfb2862480f48fa3eeaf647e17e25c70e8bb5a3d), [`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`33d9b55`](https://github.com/pyreon/pyreon/commit/33d9b555bb501b4341c1c5cc92400b162323ced5), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435), [`6164409`](https://github.com/pyreon/pyreon/commit/6164409767c2b7a9668a004ab085406ae8e2178b)]:
  - @pyreon/router@0.46.0
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0
  - @pyreon/router@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`28fbd77`](https://github.com/pyreon/pyreon/commit/28fbd7799f015503d45c8642d8822bff64e9e155), [`9ef1b14`](https://github.com/pyreon/pyreon/commit/9ef1b1422313b49a020b7deb1ffa0871a5cc012a), [`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/router@0.44.0
  - @pyreon/reactivity@0.44.0
  - @pyreon/core@0.44.0

## 0.43.1

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
