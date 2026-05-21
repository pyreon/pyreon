// Public API for @pyreon/native-cli — re-exports the programmatic
// build surface for consumers who want to invoke the CLI logic
// without going through the bin entry point (e.g. test harnesses,
// build-tool integrations).

export { build, findTsxFiles } from './build'
export type { BuildOptions, BuildResult } from './build'
