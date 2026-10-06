/**
 * `@pyreon/a11y/native-plugin` — how the imperative `announce(...)` API crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: `announce("msg", { politeness })` lowers to `PyreonA11y.announce` (a
 * VoiceOver / `announceForAccessibility` call), and the compile-gate stubs for that runtime type ship here.
 * `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source file imports
 * `@pyreon/a11y`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { a11yPlugin, a11yPlugin as default } from './native-plugin/plugin'
export { a11yStubs } from './native-plugin/stubs'
