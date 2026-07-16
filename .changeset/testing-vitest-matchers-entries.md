---
'@pyreon/testing': patch
---

Fix the `/matchers` and `/vitest` entries shipping broken:

- `lib/matchers.js` was an EMPTY module — the library build's `treeshake.moduleSideEffects: false` silently dropped the bare side-effect `import '@testing-library/jest-dom/vitest'`, so `import '@pyreon/testing/matchers'` registered nothing. Registration is now an explicit `expect.extend` on bindings imported from `vitest` + `@testing-library/jest-dom/matchers` (bound imports cannot be tree-shaken), and a missing optional peer now fails loudly at module resolution instead of silently no-opping.
- `@pyreon/testing/vitest` registered cleanup via `globalThis.afterEach`, which silently no-ops for projects running without `globals: true` (the vitest default) — containers leaked across tests and surfaced as confusing "Found multiple elements" failures. `afterEach` is now imported from `vitest`, which works regardless of the `globals` setting.
- Both entries' shipped `.d.ts` were a bare `export {}` — the jest-dom `Assertion` type augmentation never reached published consumers. Each entry now declares the vitest module augmentation explicitly, and it survives into the built types.
- `package.json` `sideEffects` now lists the two registration entries so consumer bundlers don't drop the bare imports either; `vitest` is declared as an optional peer.
