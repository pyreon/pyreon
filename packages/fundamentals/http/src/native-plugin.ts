/**
 * `@pyreon/http/native-plugin` — the endpoint DSL's native lowering.
 *
 * `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source
 * file imports `@pyreon/http`. Tooling-only — nothing here is reachable from the web entry points.
 */
export { httpPlugin, httpPlugin as default } from './native-plugin/plugin'
