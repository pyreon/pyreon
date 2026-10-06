/**
 * `@pyreon/table/native-plugin` — how `createTableState` crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: the recognizer for `createTableState({ data, columns, pageSize })`, the
 * `PyreonTableState` declaration on both targets, the property reads (`t.page()`) and the compile-gate stubs for
 * that runtime type. `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source
 * file imports `@pyreon/table`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { tablePlugin, tablePlugin as default } from './native-plugin/plugin'
export { tableStubs } from './native-plugin/stubs'
