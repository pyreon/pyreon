/**
 * `@pyreon/permissions/native-plugin` — how the grant container and `<PermissionsProvider>` cross to SwiftUI and
 * Compose.
 *
 * The package OWNS its native lowering: `usePermissions([...])` lowers to a seeded `PyreonPermissions` (a bare call
 * reads the one the nearest provider injects), `<PermissionsProvider permissions={{ … }}>` to the SwiftUI environment
 * value / Compose CompositionLocal that call reads, and the compile-gate stubs for that runtime ship here.
 * `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source file imports
 * `@pyreon/permissions`.
 *
 * Tooling-only — nothing here is reachable from the web entry point.
 */
export { permissionsPlugin, permissionsPlugin as default } from './native-plugin/plugin'
export { permissionsStubs } from './native-plugin/stubs'
