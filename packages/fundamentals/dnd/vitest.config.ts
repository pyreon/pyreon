import { defineNodeConfig } from '@pyreon/vitest-config'

// Pre-migration shape silently skipped sharedConfig (no testTimeout/retry),
// which caused dnd's cold `await import('@atlaskit/pragmatic-drag-and-drop')`
// to flake under CI's 60-process parallel load at vitest's 5s default.
// defineNodeConfig fixes this by construction.
export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // The native-compiler plugin (`src/native-plugin/`) is tooling that runs in Node, not library code. Its emit is verified
  // by behaviour in the @pyreon/native-compiler suite (the golden corpus plus the sortable specs), which owns the swiftc and kotlinc lanes — the same
  // arrangement @pyreon/http and @pyreon/charts document.
  coverageExclude: ['src/native-plugin.ts', 'src/native-plugin/**'],
  coverageThresholds: {
    statements: 99,
    branches: 99,
    functions: 99,
    lines: 99,
  },
})
