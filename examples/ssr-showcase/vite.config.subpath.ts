import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

// PR E — subpath build config for the e2e gate (`e2e/ssg-subpath.spec.ts`).
// Builds the same ssr-showcase app under `zero({ base: '/blog/' })` so the
// playwright test can serve the prerendered output and verify subpath
// navigation works end-to-end at runtime — not just at the build-output
// string-assertion level (`verify-modes ssr-showcase × ssg-subpath`).
//
// Kept as a separate file (not flag-gated on the main config) so the
// regular dev/build/preview commands stay simple, AND so `bun run
// build:subpath` is a one-liner for local repro of the subpath shape.
export default defineConfig({
  plugins: [pyreon(), zero({ mode: 'ssg', base: '/blog/', ssg: { paths: ['/', '/about'] } })],
  resolve: { conditions: ['bun'] },
})
