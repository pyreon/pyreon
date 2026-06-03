import { defineNodeConfig } from '@pyreon/vitest-config'

// Pre-migration shape silently skipped sharedConfig (no testTimeout/retry),
// which caused dnd's cold `await import('@atlaskit/pragmatic-drag-and-drop')`
// to flake under CI's 60-process parallel load at vitest's 5s default.
// defineNodeConfig fixes this by construction.
export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  coverageThresholds: {
    statements: 95,
    branches: 95,
    functions: 94,
    lines: 94,
  },
})
