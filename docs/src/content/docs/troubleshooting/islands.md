---
title: "Islands Mistakes"
description: "Common islands mistakes in Pyreon and how to fix them."
---

# Islands Mistakes

> **Generated** from `.claude/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Importing `island` from the `@pyreon/server` main barrel into client/route code

use `import { island } from '@pyreon/server/client'`, NOT `from '@pyreon/server'`, anywhere the file ships to the client (the dominant case being a route/component bundled client-side for hydration — and EVERY `@pyreon/zero` route ships to the client via `virtual:zero/routes`). `island.ts` is fully client-safe (only `@pyreon/core` `h` + `./island-codec`), but the `@pyreon/server` main barrel ALSO re-exports `createHandler` / `prerender`, which transitively pull `node:fs/promises` / `node:path` / `node:async_hooks` AND the package's `registerSingleton`. A barrel import drags that whole server module into the client/route bundle, producing TWO user-visible failures during the SSG build of that route: (1) the singleton sentinel throws — `[Pyreon] Duplicate @pyreon/server detected` — because the route chunk's bundled `@pyreon/server` (which runs `registerSingleton` at module-eval, OUTSIDE the SSG plugin's `withSilent`-wrapped handler import) is a second instance vs the build's node_modules copy; and (2) the dual `@pyreon/core` instance splits the context graph, so the hydrated island crashes with `Cannot read properties of undefined (reading 'ref')` (context lookup hits a different graph than the rocketstyle/`useContext` consumer expects). This is the exact failure that made islands unusable in zero routes. **Fix**: `island()` + its `IslandOptions`/`IslandMeta` types are exported from the CLIENT-safe `@pyreon/server/client` subentry; the `check-client-bundle-node-imports` gate now walks `/client` (bisect-verified) so it can never regress to transitively pulling a `node:` import. General rule for any package with a server barrel: a capability that is itself client-safe (renders a marker, encodes props) but lives in a barrel alongside `node:`-bearing siblings MUST be re-exported from a client-safe subentry, or a barrel import silently drags the server code into the client. Reference: `packages/core/server/src/client.ts` (`export { island } from './island'`) + `scripts/check-client-bundle-node-imports.ts` (`@pyreon/server/client` entry).

---

### An `island()` whose CLIENT render produces its component inline / relies on a one-shot external hydration scan, when the host re-mounts route content

(`@pyreon/zero`): zero's route is a reactive child of RouterView, so on the client the SSR route DOM is DISCARDED + re-mounted (`hydrateReactiveChild` → `mountChild`), not hydrated in place. An island whose client render is the original async "load + render component inline" then (1) throws inside the host mount/`hydrateRoot` (async component, no Suspense boundary → the route error boundary swallows it: "An error occurred while rendering this page"), and (2) can't be covered by a one-shot `hydrateIslandsAuto` scan either — that runs once after the initial `hydrateRoot`, BEFORE the async lazy-route + its `<pyreon-island>` marker mount, so it finds nothing. **Fix shape: the island must OWN its hydration lifecycle.** `island()`'s client branch (`typeof document !== 'undefined'`) renders ONLY the marker, then `onMount` loads the chunk + mounts the component INTO the marker per the `data-hydrate` strategy (reusing `scheduleHydration`/`schedulePrefetch`, dynamically imported from `@pyreon/server/client` to stay client-only + avoid a `client`↔`island` static cycle). This is robust across BOTH a host that hydrates in place (static islands app — where `island()` runs only at SSR, so the client branch never fires) and one that re-mounts (zero). The server branch is unchanged (async → marker + content). **General rule:** a "partial-hydration marker" primitive (island, or anything that defers loading a subtree) must be self-contained on the client — render the marker + schedule its own hydration on mount — not depend on (a) an inline async render that a host hydrate/mount can't await, or (b) external one-shot scan timing that a reactive/lazy host defeats. Bisect-verified: `e2e/zero-islands.spec.ts` (real-Chromium island hydrate + signal click) fails with the inline-async island, passes with self-hydration; the 9 islands-showcase strategy specs stay green (static model unaffected). Reference: `packages/core/server/src/island.ts` (the `typeof document` self-hydration branch).

---

### Deferred island hydration that mounts WITHOUT re-establishing the marker's context owner

(the 0.30.0 island-theme-context regression): under #1338's owner-based context (each mounted component's `EffectScope` is the context owner, linked to its parent by the renderer; `useContext()` walks the owner chain; there is NO global stack), an `island()` hydrates LATER (on idle/visible/interaction, after an async `import()`), in its OWN `hydrateRoot` mount. By then the marker component's owner is long gone, so the island's hydration root has NO parent owner → `useContext()` can't reach ancestor providers → a `rocketstyle` component reading the PyreonUI theme inside the island crashes (`Cannot read properties of undefined (reading 'base')`). Pre-#1338 the global stack still held the provider's frame, so a late mount found it; owner-based context removed that crutch. **Fix**: capture `getContextOwner()` SYNCHRONOUSLY in the island marker's render body (while its owner chain — up through `_layout`'s PyreonUI — is active), thread it through `scheduleHydration`, and re-establish it with `runWithContextOwner(owner, () => hydrateRoot(...))` (hydrate.ts sets `scope._parent = getContextOwner()`, so the island's root parents to the captured owner and `useContext` walks up to the real provider). Capture in the BODY, NOT inside `onMount`/the deferred callback — those run after the owner is restored away. Static-islands apps (`hydrateIslands` external scan, no client route tree → no owner) pass `null` and keep the prior detached-root behavior. **General rule**: any primitive that defers a mount past the synchronous render frame (islands, lazy boundaries, scheduled re-mounts) must capture the active owner at setup and restore it when it finally mounts — owner-based context only flows through links established at mount time, and a deferred mount has none unless you thread it. Bisect-verified: `island-client.test.tsx` (provider → island → context-reading component reads `'PROVIDED'`; drop the owner thread → reads `'DEFAULT'`). Reference: `packages/core/server/src/island.ts` (`getContextOwner()` capture) + `client.ts:hydrateIsland` (`runWithContextOwner` restore).

---

### Registering a `hydrate: 'never'` island in `hydrateIslands({ ... })`

the whole point of the `'never'` strategy is shipping zero client JS — registering a loader pulls the component module into the client bundle graph (the runtime short-circuits never-strategy before the registry lookup, so the loader never fires, but the bundler still includes the import). Drop the registry entry; the framework handles never-strategy islands at SSR with no client-side wiring. **Auto-registry omits never-islands by design**: under `@pyreon/vite-plugin` (`pyreon({ islands: true })`, default), `hydrateIslandsAuto(registry)` consumes a virtual module that's pre-filtered to skip never-strategy declarations. The detector exists to catch the bug shape in the manual-form `hydrateIslands({ ... })` call (non-Vite consumers, or Vite consumers who deliberately use the manual form). Reference: `packages/core/compiler/src/pyreon-intercept.ts:detectIslandNeverWithRegistry`. Caught syntactically when the `island()` declaration AND `hydrateIslands({ ... })` call appear in the same source — cross-file detection is `pyreon doctor --check-islands` territory (separate PR).

**Detected by:** `island-never-with-registry-entry` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### `hydrate: 'interaction'` for above-the-fold interactive components

defeats the strategy. `'interaction'` is for components that are interactive BUT NOT VISIBLE on initial paint — modals, dropdowns, command palettes. Above-the-fold interactive content (header CTAs, hero buttons) needs `'load'`; deferring to first user interaction means the hero button shows but doesn't respond until the user clicks, then there's a click-replay round-trip before the actual handler fires. The replay path ALSO only covers click events — focus/pointerenter/touchstart trigger hydration but no replay (focus can't be reliably re-dispatched once the user has tabbed past; pointerenter is passive). Use `'load'` for any component the user is meant to interact with on first paint.

---

### Pairing `prefetch: 'idle' | 'visible'` with `hydrate: 'load'` or `'never'`

prefetch is a no-op for these strategies. `'load'` runs the loader synchronously already (the chunk is already being fetched on page load), `'never'` defeats the zero-JS strategy by pulling the component into the client bundle. The framework silently suppresses the `data-prefetch` attribute in both cases — nothing breaks at runtime but the user is signaling intent that doesn't apply. Drop the `prefetch` field. The canonical pairing is `hydrate: 'visible'` + `prefetch: 'idle'` (chunk warms during browser idle, hydration is instant by scroll-in).

---

### Passing children to an island

island props are JSON-serialized for the SSR → client transit (embedded in `<pyreon-island data-props="...">`). Children, functions, symbols, and `undefined` values are stripped during serialization — the island sees only what its own component returns from its own body, not what the parent passes as `children`. Refactor the island to render its own content from props (string IDs work fine; the island can fetch / restore the rich data on the client) or move the island wrapper inside the component itself.

---

### Duplicate `name` across `island()` declarations

the client-side hydration registry is keyed by `name`; only the FIRST loader fires. The second island silently fails to hydrate with no error flag — the user sees broken interactivity on the second component without any signal pointing at the cause. Always use distinct names. The `pyreon doctor --check-islands` audit catches this at the project level (finding code: `duplicate-name`).

---

### Nested islands

an `island()` whose loader-target file ALSO contains an `island()` declaration. Unsupported — the outer's `hydrateRoot` replaces the inner's subtree before its loader runs, so the inner never hydrates. Refactor to flatten (move the inner's content into the outer, OR remove the inner `island()` wrapper). The `pyreon doctor --check-islands` audit detects this statically (finding code: `nested-island`); reference: `packages/core/compiler/src/island-audit.ts:detectNestedIsland`.

---

### Dead islands

an `island()` declared in a file that no other source imports (statically OR dynamically). The component never reaches a rendered tree — effectively unreachable code. Either wire it up via a route OR remove the declaration. Auto-registry's `() => import('PATH')` counts as an import, so registered islands aren't flagged. The `pyreon doctor --check-islands` audit catches this (finding code: `dead-island`).

---

### Cross-file registry drift

a manual `hydrateIslands({ X })` entry whose key has no matching `island()` declaration anywhere in the project. Common cause: typo (the registry key must EXACTLY match the `name` field, including case), or the `island()` was renamed / removed but the registry entry wasn't. Switch to `hydrateIslandsAuto()` (with `@pyreon/vite-plugin` `islands: true`) to eliminate manual sync drift entirely. The `pyreon doctor --check-islands` audit catches this (finding code: `registry-mismatch`).

---
