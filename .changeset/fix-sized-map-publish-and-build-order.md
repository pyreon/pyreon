---
"@pyreon/sized-map": patch
"@pyreon/core": patch
"@pyreon/router": patch
"@pyreon/runtime-dom": patch
"@pyreon/lint": patch
"@pyreon/elements": patch
"@pyreon/rocketstyle": patch
"@pyreon/kinetic": patch
"@pyreon/zero": patch
---

fix: publish `@pyreon/sized-map` and force topological build order

The 0.27.0 release silently failed: `bun run --filter='./packages/*/*' build`
runs in parallel, and seven framework packages (`@pyreon/core/router`,
`@pyreon/core/runtime-dom`, `@pyreon/tools/lint`, `@pyreon/ui-system/elements`,
`@pyreon/ui-system/rocketstyle`, `@pyreon/ui-system/kinetic`, `@pyreon/zero/zero`)
listed `@pyreon/sized-map` in `devDependencies` despite IMPORTING it from `src/`.
Bun's filter respects `dependencies` for topological ordering but not
`devDependencies`, so a consumer could start building before sized-map's `lib/`
existed, crashing with `[UNLOADABLE_DEPENDENCY] Could not load .../sized-map/lib/index.js`.

This also closes a type-leak: `@pyreon/router/lib/types/index.d.ts:3` carries
`import { SizedMap } from '@pyreon/sized-map'`, which would degrade to `any`
for npm consumers if sized-map stayed private.

Changes:

- `@pyreon/sized-map` is now publishable to npm (was `private: true`). The
  package is a small, focused, bounded-Map primitive (FIFO or LRU-on-read) —
  safe to use directly even though Pyreon's main consumers are framework-internal.
- All 7 consumers move `@pyreon/sized-map` from `devDependencies` →
  `dependencies`. This forces `bun run --filter` to respect topological order
  and makes the transitive dep explicit for npm consumers.
- Added to `.changeset/config.json` `fixed[0]` group so it ships with every
  other framework package at the synced version.

First-publish is bootstrapped manually following the OIDC trusted-publisher
procedure documented in CLAUDE.md.
