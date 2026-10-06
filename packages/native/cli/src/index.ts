// Public API for @pyreon/native-cli — re-exports the programmatic
// build surface for consumers who want to invoke the CLI logic
// without going through the bin entry point (e.g. test harnesses,
// build-tool integrations).

export { build, findTsxFiles } from './build'
export type { BuildOptions, BuildResult } from './build'

// Native-source resolution — resolve + scan `@pyreon/*` deps for co-located
// native sources (hoisting/pnpm-safe), replacing the scaffold's fixed
// `../node_modules/...` runtime paths.
export {
  resolveNativeSources,
  findPackageDir,
  swiftModules,
  swiftDirsForModule,
  DEFAULT_SWIFT_MODULE,
} from './native-sources'
export type {
  NativeSourceResolution,
  SwiftNativeSource,
  KotlinNativeSource,
  NativeTarget,
  ResolveOptions,
} from './native-sources'

// Explicit entries for the published Node binary and programmatic callers.
export { main, mainWithPlugins } from './cli'

export { check, checkSource, watchCheck } from './check'
export type { CheckOptions, CheckSourceOptions, CheckResult, CheckFinding } from './check'

// Package-owned compiler plugin discovery + the `plugins` / `explain` renderers.
export {
  collectImportSpecifiers,
  collectSourceImports,
  discoverPlugins,
  isActivated,
  listPluginPackages,
  loadPluginPackage,
} from './discover-plugins'
export type { DiscoveredPlugin, PluginPackage } from './discover-plugins'
export { explainReport, pluginsReport, verifyDiscovered } from './plugin-commands'
export type { CommandReport } from './plugin-commands'
