---
title: "Islands Mistakes"
description: "Common islands mistakes in Pyreon and how to fix them."
---

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Importing `island` from the `@pyreon/server` main barrel into client/route code

Import from `@pyreon/server/client` in any file that ships to the client (every `@pyreon/zero` route does).
  - The main barrel also exports `createHandler`/`prerender`, which pull `node:*` modules and a second `registerSingleton`. The SSG build then throws `[Pyreon] Duplicate @pyreon/server detected`, and a dual `@pyreon/core` crashes hydrated islands with `Cannot read properties of undefined (reading 'ref')`.
  - `packages/core/server/src/client.ts` re-exports `island`, `IslandOptions`, `IslandMeta`; `scripts/check-client-bundle-node-imports.ts` gates `@pyreon/server/client`.
  - Any package with a server barrel should re-export its client-safe pieces from a client-safe subentry.

---

### Island hydration that depends on the host's render or a one-shot scan

An island owns its hydration.
  - On the client, `island()` (`packages/core/server/src/island.ts`) renders only the `<pyreon-island>` marker (no children, so a hydrating host adopts the marker and never descends), then `onMount` loads the chunk and mounts per `data-hydrate` via `scheduleHydration`/`schedulePrefetch`.
  - Do not render the async component inline (a host mount cannot await it; the route error boundary swallows it) or rely on a one-shot `hydrateIslandsAuto` scan (it runs before lazy routes mount their markers).
  - Test: `e2e/zero-islands.spec.ts`.

---

### [FIXED, 2026-11] A component that is async on the server and sync on the client, hydrated against the `<!--$pas-->` comment.

Runtime-server wraps an async component's output in `<!--$pas-->…<!--$pae-->`; `island()` is async there (it awaits the loader) and returns its bare marker synchronously on the client. `hydrateComponent` consumed the range only for a Promise output, so a page hydrating an island mismatched (`expected pyreon-island, got 8`) and replaced it with an empty marker until the island's trigger fired. **Rule: the server's range markers are the component's extent whatever shape the client output takes** — a sync output hydrates inside the range (bounded by the depth-matched end marker, unclaimed nodes swept, the parent continuing after `$pae`). Any component whose server and client paths differ in sync/async needs that. Gate trap: `vite preview` serves a prerendered page only at its trailing-slash URL (`/island-demo/`); `/island-demo` is the SPA shell, where the route is client-mounted and nothing is hydrated. Reference: `runtime-dom/src/hydrate.ts:hydrateSyncOutputInAsyncRange`; locks `runtime-dom/src/tests/hydrate-sync-output-in-async-range.test.tsx` (incl. compiled `transformJSX` paths), `server/src/tests/island-in-hydrated-page.test.ts`, and the adoption spec in `e2e/zero-islands.spec.ts`.

---

### [FIXED, 2026-11] An async component's compiled templates built after its `await` (#4353).

`_tpl` defers its build while `_hydrationActive` is set, so each template adopts the server node at its own cursor. An async body's code after an `await` runs in a later microtask, after the synchronous walk has ended, so its `_tpl` calls built clones eagerly; the component's `.then` then hydrated that output against the `<!--$pas-->` range and every compiled element took the swap fallback (replaced by an identical node, no report; on the zero-content blog index, the header and empty state). A body that resolves before its first real `await` was unaffected, which is why the earlier async-hydration tests passed. **Rule: a window in which code builds templates that a LATER hydration step adopts must hold the template deferral until that step has run.** `hydrateComponent` takes `_holdTplDeferral()` (`template.ts`) for a pending async output over a marked range and releases it on every settle path and on unmount. The flag `_tpl` reads stays one boolean, recomputed on those cold enter/leave paths, so a mount outside hydration pays nothing; an unrelated render inside the window gets a deferred item whose first `.el` read builds the usual clone. Locks: `runtime-dom/src/tests/hydrate-async-component-tpl-adoption.test.tsx` (real compiler + SSR, late resolve, `<Suspense>`, an unrelated mount inside the window, the release on unmount) and its `.browser` twin.

---

### Deferred island hydration without the marker's context owner

Context is owner-based, and a late `hydrateRoot` has no parent owner, so `useContext()` cannot reach ancestor providers (rocketstyle crashes reading the theme: `Cannot read properties of undefined (reading 'base')`).
  - Capture `getContextOwner()` synchronously in the marker's render body (not in `onMount`), thread it through `scheduleHydration`, and mount with `runWithContextOwner(owner, () => hydrateRoot(...))` (`client.ts:hydrateIsland`). Static-islands apps pass `null`.
  - Applies to any primitive that defers a mount past the render frame. Test: `server/src/tests/island-client.test.tsx`.

---

### [FIXED, 2026-11] Observing an element that has no box (#4435).

The `visible` trigger observed the island element, then (one fix later) its element children when the island was `display: contents`. An IntersectionObserver never reports a box-less target, so an island whose content started under a further `contents` wrapper (a nested `<PyreonUI mode>` renders one) never hydrated and its chunk was never requested. **Rule: observe the first elements under the island that are not `display: contents`, at ANY depth (`client.ts:visibilityTargets`, shared with `prefetch: 'visible'`); an element hidden right now (`display: none`, closed `<details>`) is still a target and fires when shown; with no element at all (a `contents` island holding only text or nothing) observe the nearest boxed ancestor and warn once per page in dev (`[Pyreon] island "X" uses hydrate: 'visible' but nothing in it can be observed`, catalogued in `diagnose`).** Any API that needs geometry of a node the author does not control (IntersectionObserver, ResizeObserver, `getBoundingClientRect`) must say what it does when that node has no box. `interaction` is unaffected (events follow the DOM, capture phase); `idle`/`media` are layout-free. No static audit: whether a wrapper is box-less is CSS, often from a dependency. Locks: `server/src/tests/island-visible-targets.browser.test.tsx` (the class table in real Chromium) and `island-visible-targets.test.ts` — bisect-verified.

---

### [FIXED, 2026-11] Reading layout or computed style while islands are set up.

`visibilityTargets` called `getComputedStyle` for every `visible` island inside the islands module's evaluation, which usually runs before the first paint, so it forced a synchronous style recalc and a layout of the whole document there (10 ms of a 17 ms task on pyreon.dev's home page, unthrottled; Lighthouse multiplies that into Total Blocking Time). Observe the island element first and resolve its targets in the IntersectionObserver's first report, which arrives after the browser's own layout (`observeNearViewport` in `server/src/client.ts`). Any startup code that measures (`getComputedStyle`, `getBoundingClientRect`, `offset*`) has the same cost. Test: `server/src/tests/island-visible-targets.test.ts` ("reads no computed style until the observer reports").

---

### [FIXED, 2026-11] A deferred mount that drops the dispose it was handed (#4387).

`hydrateIsland` called `hydrateRoot` and discarded the unmount it returned, `scheduleHydration`'s cancel was ignored by `island()`, and the marker registered no unmount, so a client-side navigation away from an island left its `onUnmount` unrun and its effects, timers, listeners and pending triggers (IntersectionObserver, idle callback, matchMedia, interaction listeners, prefetch) alive; a chunk still loading mounted into a detached marker; a second `hydrateIslands()` hydrated a live island again. **Rule: whatever starts a root owns its end. `scheduleHydration` returns ONE idempotent dispose for every stage (cancel the trigger, drop an in-flight chunk, unmount a hydrated root and clear `data-island-hydrated`); every removal path calls it** — the `island()` marker's `onMount` cleanup (router navigation and HMR swap, `<Show>`/`<For>`, parent re-render, Suspense all unmount the marker) and the cleanup `hydrateIslands()` returns (static pages: the host owns removal it performs itself, e.g. an `innerHTML` swap — not observed, by design: no MutationObserver in the shell). Leak contract: no module-level registry; each island's state lives in its dispose closure, held by the marker's mount cleanup or the `hydrateIslands` cleanup array (emptied when called). An empty marker (client-rendered, or emptied by a previous unmount) is `mount`ed into rather than hydrated. Locks: `server/src/tests/island-lifecycle.browser.test.tsx` (every path in real Chromium, 50-navigation instance count), `island-dispose.test.tsx`, and the `#4387` specs in `e2e/zero-islands.spec.ts` (50 history round trips in a zero SSG app) — bisect-verified.

---

### Interactive markup outside an island on an islands-only page (`export const hydrate = 'islands'`, #4371)

The page never starts the app, so a handler, a signal or a `<RouterLink>`'s client navigation outside an `island()` silently does nothing (links are full page loads there, by design). Anything interactive on such a page is an island; an island that reads context gets its providers from `startClientLazy({ islandRoot })` / `hydrateIslandsAuto(registry, { root })`, which must render ONLY its children (an element around them breaks adoption). `useLoaderData()` inside an island there has nothing to read (no loader-data blob, no router): pass what it needs as props. Locks: `e2e/zero-islands-only.spec.ts`, `zero/src/tests/client-islands-only.browser.test.ts`.

---

### Registering a `hydrate: 'never'` island in `hydrateIslands({ ... })`

The loader never runs, but the import still pulls the component into the client bundle. Drop the entry.
  - `hydrateIslandsAuto(registry)` (from `pyreon({ islands: true })`, the default) already omits never-islands; the detector targets manual registries.
  - Detected when the `island()` and `hydrateIslands` call share a file (`compiler/src/pyreon-intercept.ts:detectIslandNeverWithRegistry`); cross-file cases belong to `pyreon doctor --only islands-audit`.

**Detected by:** `island-never-with-registry-entry` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### `hydrate: 'interaction'` for above-the-fold interactive components

Use `'load'` for anything the user interacts with on first paint.
  - `'interaction'` suits interactive content that is not visible at first paint (modals, dropdowns, command palettes).
  - Only clicks and form submits are replayed after hydration; focus, pointerenter and touchstart trigger hydration without replay.

---

### Pairing `prefetch: 'idle' | 'visible'` with `hydrate: 'load'` or `'never'`

Prefetch is a no-op there and `data-prefetch` is silently dropped. Drop the field. The canonical pairing is `hydrate: 'visible'` + `prefetch: 'idle'`.

---

### Passing children to an island

Island props are JSON-serialized into `data-props`; children, functions, symbols and `undefined` are stripped. Render content from serializable props (for example an id the island fetches with), or move the island wrapper inside the component.

---

### Duplicate `name` across `island()` declarations

The registry is keyed by `name`, so only the first loader fires and the second island silently never hydrates. Use distinct names. `pyreon doctor --only islands-audit` reports `duplicate-name`.

---

### Nested islands

An island whose loader target also declares an `island()` is unsupported (the outer `hydrateRoot` replaces the inner subtree first). Flatten them. `pyreon doctor --only islands-audit` reports `nested-island` (`compiler/src/island-audit.ts:detectNestedIsland`).

---

### Dead islands

An `island()` in a file nothing imports never renders. Route it or delete it. Auto-registry `() => import('PATH')` counts as an import. `pyreon doctor --only islands-audit` reports `dead-island`.

---

### Cross-file registry drift

A manual `hydrateIslands({ X })` key with no matching `island()` `name` (keys are case-sensitive). Use `hydrateIslandsAuto()` with `pyreon({ islands: true })` to avoid manual sync. `pyreon doctor --only islands-audit` reports `registry-mismatch`.

---

### `content-visibility: auto` on page sections of varying height.

It skips style, layout and paint of a section until it nears the viewport, using `contain-intrinsic-size` as a placeholder height. On pyreon.dev (sections 446–2,463 px against a 900 px placeholder) it broke two things real visitors rely on: a scroll to an element in a later section (`scrollIntoView`, an in-page link) landed where the placeholders put it, then the sections in between rendered at their real height and pushed the target out of view, so a `hydrate: 'visible'` island there never hydrated; and `innerText` of a skipped section is empty (copy, reading tools). Tried for Lighthouse TBT in #4766 and removed: use it only for a long list of items of known, uniform height.

---
