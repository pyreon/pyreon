/**
 * `@pyreon/sized-map/native-plugin` — how `new SizedMap<K, V>({ maxEntries, lru })` crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: the import-gated recognizer, the expression emitters for both targets and the
 * compile-gate stubs for the `PyreonSizedMap` class it ships. `@pyreon/native-cli` discovers it from `package.json` →
 * `pyreon.native.plugin` when a source file imports `@pyreon/sized-map`.
 *
 * Tooling-only — nothing here is reachable from the web entry point.
 */
export { sizedMapPlugin, sizedMapPlugin as default } from './native-plugin/plugin'
export { sizedMapStubs } from './native-plugin/stubs'
