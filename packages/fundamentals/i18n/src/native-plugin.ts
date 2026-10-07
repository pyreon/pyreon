/**
 * `@pyreon/i18n/native-plugin` — how `createI18n` crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: the recognizer for `createI18n({ locale, messages, fallbackLocale? })`
 * (from `@pyreon/i18n/core`), the `PyreonI18n` declaration on both targets, the interpolating
 * `i18n.t(key, { … })` call and the compile-gate stubs for that runtime type. `@pyreon/native-cli` discovers it
 * from `package.json` → `pyreon.native.plugin` when a source file imports `@pyreon/i18n`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { i18nPlugin, i18nPlugin as default } from './native-plugin/plugin'
export { i18nStubs } from './native-plugin/stubs'
