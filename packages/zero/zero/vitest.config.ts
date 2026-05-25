import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'zero',
  // Logic in src/index.ts (zero's main re-export + setup). Keep measured.
  includeIndexInCoverage: true,
  // Integration-tier: Vite build-time plugins, server-runtime
  // infrastructure, and JSX-component browser surfaces. These
  // run in real Vite builds / real Node servers / real browser
  // sessions and are exercised by example apps and end-to-end
  // tests, not by Node-side vitest. PR #323 finding.
  coverageExclude: [
    // Build-time / Vite plugins:
    'src/vite-plugin.ts',
    'src/ssg-plugin.ts',
    'src/app.ts',
    'src/favicon.ts',
    'src/font.ts',
    'src/icons-plugin.ts',
    'src/image-plugin.ts',
    'src/og-image.ts',
    // Server-runtime middleware / SSR entry:
    'src/entry-server.ts',
    'src/cache.ts',
    'src/compression.ts',
    'src/isr.ts',
    'src/i18n-routing.ts',
    'src/ai.ts',
    'src/actions.ts',
    'src/logger.ts',
    'src/seo.ts',
    // JSX components (browser-tested):
    'src/link.tsx',
    'src/image.tsx',
    'src/script.tsx',
    // Browser-only utility:
    'src/utils/intersection-observer.ts',
  ],
  coverageThresholds: {
    statements: 85,
    branches: 75,
    functions: 85,
  },
})
