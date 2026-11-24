// ─── @pyreon/zero-content/internal ─────────────────────────────────────────
//
// INTERNAL ENTRY — NOT PUBLIC API. Nothing exported here carries a semver
// promise: any name can change or disappear in any release. Application code
// must not import it. See "What counts as public API" on the stability page
// (docs/src/content/docs/stability-and-direction.md).
//
// Client-safe (no `node:*` reachable): the plugin-generated
// `virtual:zero-content/collections` module imports `_setRegistry` from here
// in the browser bundle. The Node-only plugin internals live in
// `@pyreon/zero-content/internal-server`.
//
// What lives here:
//   - plugin-generated-code helpers: `_setRegistry`
//   - cross-module / introspection internals: `_getRegistry`,
//     `_listCollections`, `_exampleCount`, `_exampleKeys`,
//     `_hasSharedSignal`, `_sharedSignalCount`
//   - test-reset helpers: `_resetRegistryForTesting`, `_resetExampleRegistry`,
//     `_resetSearchForTesting`

export { _exampleCount, _exampleKeys, _resetExampleRegistry } from './components/example-registry'
export { _hasSharedSignal, _sharedSignalCount } from './components/shared-signal-registry'
export { _getRegistry, _listCollections, _resetRegistryForTesting, _setRegistry } from './runtime'
export { _resetSearchForTesting } from './search/search-runtime'
