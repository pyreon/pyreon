import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

// SSR-mode build config — exercises the full SSR deploy pipeline:
// client build → inner SSR bundle (dist/server/entry-server.js) →
// nodeAdapter.build() staging dist into { client/, server/, index.js }.
// Used by the SSR smoke (build → `node dist/index.js` → curl) and the
// `verify-modes ssr-showcase × ssr-node` cell.
export default defineConfig({
  plugins: [
    pyreon(),
    zero({ mode: 'ssr', adapter: 'node', port: 5203 }),
  ],
  resolve: { conditions: ['bun'] },
})
