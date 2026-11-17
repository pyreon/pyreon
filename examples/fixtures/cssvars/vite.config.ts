import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

/**
 * Cross-origin isolation raises Chromium's `performance.now()` resolution from
 * 100µs to 5µs. `scripts/bench-cssvars.ts` times batches of theme flips against
 * the DEV server; a small `--n`/`--flips` batch is otherwise a handful of 100µs
 * ticks. Everything the dev server serves is same-origin, so `require-corp`
 * blocks nothing.
 */
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: ISOLATION_HEADERS },
  plugins: [pyreon()],
  resolve: { conditions: ['bun'] },
})
