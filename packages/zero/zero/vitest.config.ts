import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ['src/tests/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: [
          'src/tests/**',
          'src/**/*.test.ts',
          // Integration-tier: Vite build-time plugins, server-runtime
          // infrastructure, and JSX-component browser surfaces. These
          // run in real Vite builds / real Node servers / real browser
          // sessions and are exercised by example apps and end-to-end
          // tests, not by Node-side vitest. PR #323 finding.
          //
          // Build-time / Vite plugins:
          'src/vite-plugin.ts',
          'src/ssg-plugin.ts',
          'src/app.ts',
          'src/index.ts',
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
          // Image + Script have happy-dom real-mount tests in
          // packages/zero/zero/src/tests/{image,script}.test.ts (covering
          // ~97% / ~87% of their respective files), but a few paths
          // (IntersectionObserver-driven lazy load, requestIdleCallback
          // setTimeout fallback, onUnmount cleanup of interaction handlers)
          // are env-dependent and only fully exercise in a real browser.
          // Same exemption category as link.tsx.
          'src/image.tsx',
          'src/script.tsx',
          // Browser-only utility:
          'src/utils/intersection-observer.ts',
        ],
        thresholds: {
          statements: 85,
          branches: 75,
          functions: 85,
        },
      },
    },
    resolve: {
      conditions: ['bun'],
    },
  }),
)
