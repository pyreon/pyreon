import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'

// ISR-mode build config — exercises the full ISR deploy pipeline: client
// build → inner SSR bundle → nodeAdapter staging into dist/{client,server,
// index.js}, with the runtime handler wrapped by createISRHandler (per-request
// SSR + in-process LRU caching). Used by the `isr-node` e2e gate (build →
// `node dist/index.js` → curl twice → cache-consistent + hydrating) and the
// `verify-modes ssr-showcase × isr` cell. The caching SEMANTICS (LRU / TTL /
// cacheKey / revalidate) are unit-covered by isr.test.ts (47 specs); this
// config proves the ISR deploy artifact builds + runs + serves + hydrates.
export default defineConfig({
  plugins: [
    pyreon(),
    zero({ mode: 'isr', adapter: 'node', port: 5207 }),
  ],
  resolve: { conditions: ['bun'] },
})
