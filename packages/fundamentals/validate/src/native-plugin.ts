/**
 * `@pyreon/validate/native-plugin` — the `s` DSL's native lowering.
 *
 * `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source file imports
 * `@pyreon/validate`. Tooling-only — nothing here is reachable from the web entry points.
 */
export { validatePlugin, validatePlugin as default } from './native-plugin/plugin'
