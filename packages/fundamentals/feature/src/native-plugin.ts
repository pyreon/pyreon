/**
 * `@pyreon/feature/native-plugin` — how `defineFeature({ name, schema })` crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: the top-level recognizer for the literal-schema shape, the item emitter for
 * both targets and the Tier-2 diagnostic for every other call. `@pyreon/native-cli` discovers it from `package.json` →
 * `pyreon.native.plugin` when a source file imports `@pyreon/feature`.
 *
 * Tooling-only — nothing here is reachable from the web entry point.
 */
export { featurePlugin, featurePlugin as default } from './native-plugin/plugin'
