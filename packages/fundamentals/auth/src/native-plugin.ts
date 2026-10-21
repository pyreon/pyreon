/**
 * `@pyreon/auth/native-plugin` — how `useOidc` crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: `useOidc({ … })` lowers to the native OIDC session container
 * (`PyreonOidcAuth`), and the compile-gate stubs for that runtime ship here. `@pyreon/native-cli`
 * discovers it from `package.json` → `pyreon.native.plugin` when a source file imports `@pyreon/auth`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { AUTH_PLUGIN_NAME, authPlugin, authPlugin as default } from './native-plugin/plugin'
export { authStubs } from './native-plugin/stubs'
