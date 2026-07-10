// Minimal zero-config SSR app for the `zero build` command tests.
//
// Deliberately NO `pyreon()` JSX plugin: the fixture is plain `.ts`
// (no JSX to compile), and `@pyreon/vite-plugin` is not a dependency of
// `@pyreon/zero-cli` so it would not resolve from this directory. The
// inner SSR sub-build adds its own `pyreon()` instance (resolved from
// `@pyreon/zero`'s node_modules), so the full pipeline still runs.
//
// NOTE (lib-needing): this config file is loaded by a REAL
// `loadConfigFromFile` during the build tests — `@pyreon/zero/server`
// resolves via the Node condition to `packages/zero/zero/lib/`. Stale
// lib = stale plugin under test; `bun scripts/bootstrap.ts` refreshes it.
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

export default defineConfig({
  logLevel: 'error',
  plugins: [zero({ mode: 'ssr' })],
})
