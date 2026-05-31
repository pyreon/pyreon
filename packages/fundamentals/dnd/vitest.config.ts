import { defineNodeConfig } from '@pyreon/vitest-config'

// Pre-migration shape silently skipped sharedConfig (no testTimeout/retry),
// which caused dnd's cold `await import('@atlaskit/pragmatic-drag-and-drop')`
// to flake under CI's 60-process parallel load at vitest's 5s default.
// defineNodeConfig fixes this by construction.
export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // onCleanup callbacks from @pyreon/reactivity only execute inside
  // reactive component scopes — unreachable in unit tests.
  coverageThresholds: {
    statements: 94,
    branches: 85,
    functions: 94,
    lines: 94,
  },
})
