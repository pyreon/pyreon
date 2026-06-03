import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // SSR-only branches (typeof window/navigator) now covered via direct
  // globalThis stubs in ssr-branches.test.ts.
  coverageThresholds: { statements: 95, branches: 85, lines: 95 },
})
