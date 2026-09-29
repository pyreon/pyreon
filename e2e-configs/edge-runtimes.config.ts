import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * Edge-runtime deploy artifacts, RUN in their real runtimes.
 *
 * `examples/edge-runtimes` is built once per edge adapter (by
 * `test:e2e:edge-runtimes`, before Playwright starts), and each emitted
 * artifact is served by the runtime it deploys to:
 *
 *  - deno       — denoAdapter's `dist/main.js`, under Deno
 *  - netlify    — the Netlify Edge Function, under Deno (Netlify's edge runtime)
 *  - vercel     — the `.vercel/output` edge function, in Vercel's Edge Runtime
 *  - cloudflare — `_worker.js` via `wrangler pages dev` (workerd)
 *
 * The adapters' unit tests invoke the same code under Node, which HAS a
 * filesystem, `process` and `import.meta.url` — exactly the things these
 * runtimes lack. This suite is the only place those classes can surface.
 */
const RUNTIMES = [
  { name: 'deno', port: 5310 },
  { name: 'netlify', port: 5311 },
  { name: 'vercel', port: 5312 },
  { name: 'cloudflare', port: 5313 },
] as const

export default definePlaywrightConfig({
  testDir: '../e2e',
  timeout: 60_000,
  projects: RUNTIMES.map(({ name, port }) => ({ name, testMatch: /edge-runtimes\.spec\.ts$/, port })),
  webServer: RUNTIMES.map(({ name, port }) => ({
    command: `bun ../scripts/edge-runtimes/serve.ts ${name} ${port}`,
    port,
    timeout: 120_000,
  })),
})
