import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

/**
 * The SSR build of the showcase served under `/sub/` (`zero({ base })`), on
 * port 5204. Driven by `e2e/ssr-base.spec.ts`: a
 * server island under a base — its marker carries the base, its fragment is
 * signed for the based page path, fetched, served and verified under `/sub/`,
 * including the 403-retry path a client-rendered marker takes.
 */
export default defineConfig({
  plugins: [pyreon(), zero({ mode: 'ssr', adapter: 'node', port: 5204, base: '/sub/' })],
  build: { outDir: 'dist-ssr-base' },
  resolve: { conditions: ['bun'] },
})
