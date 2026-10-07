/**
 * `@pyreon/sync/native-plugin` — how the CRDT doc and `syncedSignal` cross to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: the recognizers for `new PyreonCrdtDoc(…)` and `syncedSignal({ doc, key,
 * initial })`, their declarations on both targets, the generated SwiftUI `init()` that seeds them, the warning for
 * a web `CrdtDoc` / `CrdtMap` member that has no native counterpart, and the compile-gate stubs for the runtime
 * types. `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source file imports
 * `@pyreon/sync`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { syncPlugin, syncPlugin as default } from './native-plugin/plugin'
export { syncStubs } from './native-plugin/stubs'
