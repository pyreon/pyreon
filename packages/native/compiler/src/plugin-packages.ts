/**
 * `@pyreon/*` packages whose native lowering lives in their OWN compiler plugin
 * (`pyreon.native.plugin` in the package manifest), keyed by import specifier.
 *
 * Since the package-owned lowering migration the compiler knows no library, so a
 * compile that does not load a package's plugin emits that package's imports
 * VERBATIM (`<PieChart>` becomes `PieChart(...)`), and the native build then
 * fails with "cannot find 'PieChart' in scope", far from the cause. The usual
 * cause is an app that imports the package without declaring it (the CLI loads
 * plugins only from declared dependencies), or a direct `transform()` /
 * `createCompiler()` with no plugins. `warnUnloadedPluginImports` in `parse.ts`
 * uses this list to name the package and the fix.
 *
 * Kept in sync with the manifests by `tests/plugin-packages.test.ts`, which reads
 * every workspace `package.json` and fails on a missing or extra entry.
 */
export const PLUGIN_OWNED_MODULES: ReadonlySet<string> = new Set([
  '@pyreon/a11y',
  '@pyreon/attrs',
  '@pyreon/charts',
  '@pyreon/code',
  '@pyreon/coolgrid',
  '@pyreon/core',
  '@pyreon/core/plain',
  '@pyreon/dnd',
  '@pyreon/elements',
  '@pyreon/feature',
  '@pyreon/flow',
  '@pyreon/form',
  '@pyreon/head',
  '@pyreon/hooks',
  '@pyreon/hotkeys',
  '@pyreon/http',
  '@pyreon/i18n',
  '@pyreon/kinetic',
  '@pyreon/kinetic-presets',
  '@pyreon/machine',
  '@pyreon/permissions',
  '@pyreon/primitives',
  '@pyreon/query',
  '@pyreon/reactivity',
  '@pyreon/rich-text',
  '@pyreon/rocketstyle',
  '@pyreon/router',
  '@pyreon/rx',
  '@pyreon/sized-map',
  '@pyreon/state-tree',
  '@pyreon/storage',
  '@pyreon/store',
  '@pyreon/styler',
  '@pyreon/sync',
  '@pyreon/table',
  '@pyreon/toast',
  '@pyreon/ui-core',
  '@pyreon/url-state',
  '@pyreon/validate',
  '@pyreon/validation',
])

/**
 * Plugin-owned modules whose NON-hook surface still lowers in the core
 * (`signal`, `<Show>`, the canonical primitives, `RouterView`, `Link`). Their
 * plugins add only hooks, which the unlowered-hook warning already reports, so a
 * missing plugin there is not a verbatim-emit hazard for the other exports.
 */
export const CORE_LOWERED_SURFACE: ReadonlySet<string> = new Set([
  '@pyreon/core',
  '@pyreon/core/plain',
  '@pyreon/primitives',
  '@pyreon/reactivity',
  '@pyreon/router',
])
