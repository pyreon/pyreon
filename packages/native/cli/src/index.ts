// Public API for @pyreon/native-cli — re-exports the programmatic
// build surface for consumers who want to invoke the CLI logic
// without going through the bin entry point (e.g. test harnesses,
// build-tool integrations).

export { build, findTsxFiles } from './build'
export type { BuildOptions, BuildResult } from './build'

// Re-exported so the published `bin/pyreon-native.js` can call it EXPLICITLY.
// The bin must never rely on `cli.ts`'s `import.meta.main` guard: that is a
// Bun-only signal (undefined on Node before 24.2), and a bundler drops the
// guarded block entirely when building `lib/` — which is exactly how
// `pyreon-lint` shipped a bin that did nothing in every published version.
export { main } from './cli'
