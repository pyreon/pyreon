---
title: "Islands Mistakes"
description: "Common islands mistakes in Pyreon and how to fix them."
---

# Islands Mistakes

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

### Deferred island hydration without the marker's context owner

Context is owner-based, and a late `hydrateRoot` has no parent owner, so `useContext()` cannot reach ancestor providers (rocketstyle crashes reading the theme: `Cannot read properties of undefined (reading 'base')`).
  - Capture `getContextOwner()` synchronously in the marker's render body (not in `onMount`), thread it through `scheduleHydration`, and mount with `runWithContextOwner(owner, () => hydrateRoot(...))` (`client.ts:hydrateIsland`). Static-islands apps pass `null`.
  - Applies to any primitive that defers a mount past the render frame. Test: `server/src/tests/island-client.test.tsx`.

---

### Registering a `hydrate: 'never'` island in `hydrateIslands({ ... })`

The loader never runs, but the import still pulls the component into the client bundle. Drop the entry.
  - `hydrateIslandsAuto(registry)` (from `pyreon({ islands: true })`, the default) already omits never-islands; the detector targets manual registries.
  - Detected when the `island()` and `hydrateIslands` call share a file (`compiler/src/pyreon-intercept.ts:detectIslandNeverWithRegistry`); cross-file cases belong to `pyreon doctor --check-islands`.

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

The registry is keyed by `name`, so only the first loader fires and the second island silently never hydrates. Use distinct names. `pyreon doctor --check-islands` reports `duplicate-name`.

---

### Nested islands

An island whose loader target also declares an `island()` is unsupported (the outer `hydrateRoot` replaces the inner subtree first). Flatten them. `pyreon doctor --check-islands` reports `nested-island` (`compiler/src/island-audit.ts:detectNestedIsland`).

---

### Dead islands

An `island()` in a file nothing imports never renders. Route it or delete it. Auto-registry `() => import('PATH')` counts as an import. `pyreon doctor --check-islands` reports `dead-island`.

---

### Cross-file registry drift

A manual `hydrateIslands({ X })` key with no matching `island()` `name` (keys are case-sensitive). Use `hydrateIslandsAuto()` with `pyreon({ islands: true })` to avoid manual sync. `pyreon doctor --check-islands` reports `registry-mismatch`.

---
