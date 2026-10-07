/**
 * `@pyreon/machine/native-plugin` — how `createMachine` crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: the recognizer for `createMachine({ initial, states })`, the
 * `PyreonMachine` declaration on both targets and the compile-gate stubs for that runtime type.
 * `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source file
 * imports `@pyreon/machine`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { machinePlugin, machinePlugin as default } from './native-plugin/plugin'
export { machineStubs } from './native-plugin/stubs'
