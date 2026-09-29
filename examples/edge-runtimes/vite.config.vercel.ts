import pyreon from '@pyreon/vite-plugin'
import zero, { vercelAdapter } from '@pyreon/zero/server'
import { defineConfig } from 'vite'

// Edge-runtime smoke build — the emitted artifact is RUN in the real
// runtime by `scripts/edge-runtime-smoke.ts` (see e2e/edge-runtimes.spec.ts).
export default defineConfig({
  plugins: [pyreon(), zero({ mode: 'ssr', ssr: { mode: 'stream' }, adapter: vercelAdapter({ runtime: 'edge' }) })],
  build: { outDir: 'dist-vercel' },
  resolve: { conditions: ['bun'] },
})
