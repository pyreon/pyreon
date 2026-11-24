// ─── @pyreon/zero/internal ──────────────────────────────────────────────────
//
// INTERNAL ENTRY — NOT PUBLIC API. Nothing exported here carries a semver
// promise: any name can change or disappear in any release. Application code
// must not import it. See "What counts as public API" on the stability page
// (docs/src/content/docs/stability-and-direction.md).
//
// Client-safe (no `node:*` reachable — locked by
// scripts/check-client-bundle-node-imports.ts): code zero's Vite plugin
// GENERATES imports from here in both the server and the browser graph. The
// plugin and this runtime ship in the same package version, so the generated
// imports always match. Node-only internals live in
// `@pyreon/zero/internal-server`.
//
// What lives here:
//   - plugin-generated-code helpers: `_defineActionWithId`, `_actionStub`
//     (the `defineAction` rewrite), `_registerActionModules`,
//     `_registerActionRoutes` (the route-middleware module),
//     `_registerI18nConfig` (the routes module)
//   - cross-module internals: `_getAction`, `_resolveAction`, `_isKnownAction`,
//     `_actionDeclaringRoute`, `_setActionSnapshotReader`,
//     `_setLocaleStoreReader`
//   - test-reset helpers: `_resetActions`, `_resetSubmissions`,
//     `_resetInitThemeForTests`, `_resetRateLimitWarning`

export {
  _actionDeclaringRoute,
  _actionStub,
  _defineActionWithId,
  _getAction,
  _isKnownAction,
  _registerActionModules,
  _registerActionRoutes,
  _resetActions,
  _resolveAction,
} from './actions-core'
export { _resetSubmissions, _setActionSnapshotReader } from './form'
export { _registerI18nConfig, _setLocaleStoreReader } from './i18n-routing-state'
export { _resetRateLimitWarning } from './rate-limit-state'
export { _resetInitThemeForTests } from './theme-state'
