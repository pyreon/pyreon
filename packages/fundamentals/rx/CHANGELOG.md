# @pyreon/rx

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0

## 0.19.0

### Patch Changes

- [#606](https://github.com/pyreon/pyreon/pull/606) [`fde0f41`](https://github.com/pyreon/pyreon/commit/fde0f41ad6312ad0ee45d8e70ece965d7c4fec41) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix the biggest MCP `get_api` quality gap: enrich + correct the two thinnest fundamentals manifests, and add a ratchet so density can't silently erode.

  **The gap (measured, via the authoritative `findManifests` loader — the same one `get_api` uses):**

  - `@pyreon/rx`: **3** `api[]` entries for 37 functions. `get_api(rx, sortBy)` / `(rx, debounce)` / `(rx, search)` / `(rx, groupBy)` all **404'd** — agents got nothing for the most-used transforms.
  - `@pyreon/store`: `StoreApi` referenced **3× in `seeAlso`** with no `api[]` entry — `get_api(store, StoreApi)` 404'd despite being the central return type.

  **Plus four real inaccuracies in the existing rx manifest** that were actively _misleading_ AI agents (found by grounding every claim in source, not assuming):

  1. "signals detected by checking for a `.subscribe` method" — false; detection is purely `typeof source === "function"` (`rx/src/types.ts`).
  2. "pass `items` not `() => items()`" — backwards; an accessor wrapper _is_ a function and works. The real mistake is passing a resolved `items()` (static path, never updates).
  3. `groupBy` documented as returning `Computed<Map<…>>` — it returns `Record<string, T[]>` (keys `String()`-coerced).
  4. `search` documented as `{ keys: [...] }` options + "fuzzy" — it's a positional `keys` array and plain case-insensitive `String.includes` (not fuzzy).

  **Fixed (delta, authoritative counts):**

  - `@pyreon/store`: 5 → **6** entries, 2 → **6** with `mistakes[]` (added `StoreApi` entry; added grounded foot-gun catalogs to `addStorePlugin` / `resetStore` / `resetAllStores`; expanded `defineStore`). Every foot-gun traced to real source behaviour (plugin-runs-once-at-creation, silent `patch({typoKey})` no-op, `__proto__` guard, registry-detach semantics, `store.pluginRun` O(stores×plugins)).
  - `@pyreon/rx`: 3 → **9** entries, 2 → **9** with `mistakes[]` (added `map`/`sortBy`/`groupBy`/`search`/`debounce`/`throttle`; beefed `filter`/`pipe`/`rx`) **and the 4 inaccuracies corrected** across summary, longExample, gotchas, and per-entry notes.

  **Proven end-to-end:** a real MCP client↔server round-trip confirms `get_api(rx, sortBy|debounce|search|groupBy)` and `get_api(store, StoreApi)` now resolve with `Common mistakes` sections (were 404), and `get_api(rx, groupBy)` returns `Record`, not `Map`, through the live tool.

  **Structural fix so this can't recur:** new `scripts/check-manifest-depth.ts` ratchet + required `Check Manifest Depth` CI job. `LOCKED` records each migrated package's _achieved_ `{ minEntries, minWithMistakes }` (store 6/6, rx 9/9, query 16/11, form 7/7 — counted via `findManifests`). The gate fails if a locked package erodes; not-yet-migrated packages are intentionally absent (the visible backlog) so it never flag-days CI. Bisect-verified: removing the `StoreApi` entry fails the gate on `@pyreon/store`; restored → passes.

  Per-package `manifest-snapshot` tests updated (regenerated inline snapshots now capture the _corrected_ content; regression-guard assertions added so the 4 inaccuracies can't reappear). `gen-docs` regenerated `llms.txt` / `llms-full.txt` / `api-reference.ts` — in sync.

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261)]:
  - @pyreon/reactivity@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.11
