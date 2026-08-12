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

// Re-exported so the published `bin/pyreon-native.js` can call it EXPLICITLY.
// The bin must never rely on `cli.ts`'s `import.meta.main` guard: that is a
// Bun-only signal (undefined on Node before 24.2), and a bundler drops the
// guarded block entirely when building `lib/` — which is exactly how
// `pyreon-lint` shipped a bin that did nothing in every published version.
export { main } from './cli'
