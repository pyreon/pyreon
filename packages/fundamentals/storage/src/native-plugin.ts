/**
 * `@pyreon/storage/native-plugin` — how `useStorage` / `useSessionStorage` / `useMemoryStorage` cross to SwiftUI and
 * Compose.
 *
 * The package OWNS its native lowering: the recognizers, the persistence primitive a persisted signal is declared with
 * (`@AppStorage` / `@PyreonAppStorage`, `rememberSaveable` / `rememberPyreonStorage`) and the compile-gate stubs for that
 * runtime. `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source file imports
 * `@pyreon/storage`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { storagePlugin, storagePlugin as default } from './native-plugin/plugin'
export { storageStubs } from './native-plugin/stubs'
