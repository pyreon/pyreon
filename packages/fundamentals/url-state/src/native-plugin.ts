/**
 * `@pyreon/url-state/native-plugin` — how `useUrlState(key, default)` crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: the recognizer (a literal key and a scalar default), the value-type inference
 * and both declaration emitters. The value types it emits (`PyreonUrlState*`) are declared in the router runtimes, which
 * own the search-parameter API. `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a
 * source file imports `@pyreon/url-state`.
 *
 * Tooling-only — nothing here is reachable from the web entry point.
 */
export { urlStatePlugin, urlStatePlugin as default } from './native-plugin/plugin'
