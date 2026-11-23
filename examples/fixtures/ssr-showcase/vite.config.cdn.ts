import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

/**
 * A full-URL (CDN-style) Vite base with NO `zero({ base })` (#4269). The
 * asset base is the URL — here the preview server itself, so the browser can
 * load it — and the route base stays `/`. Before the two bases were split,
 * zero used the URL as the router base and every link became
 * `/http://localhost:5236/about`. Driven by `e2e/ssg-cdn-base.spec.ts`.
 */
export default defineConfig({
  base: 'http://localhost:5236/',
  plugins: [pyreon(), zero({ mode: 'ssg', ssg: { paths: ['/', '/about'] } })],
  build: { outDir: 'dist-cdn' },
  resolve: { conditions: ['bun'] },
})
