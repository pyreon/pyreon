// ─── @pyreon/zero-content/internal-server ──────────────────────────────────
//
// INTERNAL ENTRY — NOT PUBLIC API. Nothing exported here carries a semver
// promise: any name can change or disappear in any release. Application code
// must not import it. See "What counts as public API" on the stability page
// (docs/src/content/docs/stability-and-direction.md).
//
// Node-only: these are state of the Vite plugin (`@pyreon/zero-content/plugin`),
// whose module graph reaches `node:*`. They are split from the client-safe
// `@pyreon/zero-content/internal` so that entry never pulls Node code into a
// browser bundle.
//
// What lives here (test-reset helpers):
//   - `_resetCompileCacheForTesting` — clear the cross-build markdown cache
//   - `_setResolvedRootForPaths` — set the root `reportPath` relativises against

export {
  _resetCompileCacheForTesting,
  setResolvedRootForPaths as _setResolvedRootForPaths,
} from './plugin-state'
