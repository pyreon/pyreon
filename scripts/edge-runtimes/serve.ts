/**
 * Run one of `examples/edge-runtimes`' built deploy artifacts in its REAL
 * runtime (the Playwright webServer command for `e2e/edge-runtimes.spec.ts`).
 *
 *   bun scripts/edge-runtimes/serve.ts <deno|netlify|vercel|cloudflare> <port>
 *
 * Expects `bun scripts/edge-runtimes/tools.ts` (pinned runtimes) and the four
 * `build:*` scripts to have run — `test:e2e:edge-runtimes` does both first,
 * sequentially, because the four builds share one example directory.
 */
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { edgeToolBin, edgeToolsDir } from './tools'

const RUNTIMES = ['deno', 'netlify', 'vercel', 'cloudflare'] as const
type Runtime = (typeof RUNTIMES)[number]

const [runtime, port] = process.argv.slice(2) as [Runtime, string]
if (!RUNTIMES.includes(runtime) || !port) {
  console.error(`usage: serve.ts <${RUNTIMES.join('|')}> <port>`)
  process.exit(2)
}

const example = resolve(import.meta.dirname, '../../examples/edge-runtimes')
const here = import.meta.dirname
const denoFlags = ['run', '--allow-net', '--allow-read', '--allow-env']

const commands: Record<Runtime, [string, string[]]> = {
  // denoAdapter's own runner — `deno run … dist/main.js`, exactly as documented.
  deno: [edgeToolBin('deno'), [...denoFlags, join(example, 'dist-deno/main.js')]],
  // Netlify Edge Functions run on Deno; the host imports the emitted function.
  netlify: [edgeToolBin('deno'), [...denoFlags, join(here, 'netlify-edge-host.js'), join(example, 'dist-netlify'), port]],
  // Vercel's Edge Runtime sandbox over the emitted `.vercel/output`.
  vercel: ['node', [join(here, 'vercel-edge-host.mjs'), example, port, edgeToolsDir()]],
  // Cloudflare's own local Pages emulator — the worker runs in workerd.
  cloudflare: [
    edgeToolBin('wrangler'),
    [
      'pages', 'dev', join(example, 'dist-cloudflare'),
      '--port', port, '--ip', '0.0.0.0',
      '--compatibility-date', '2025-09-01', '--compatibility-flags', 'nodejs_compat',
    ],
  ],
}

const [cmd, args] = commands[runtime]
const child = spawn(cmd, args, {
  stdio: 'inherit',
  // wrangler keeps its local state in `<cwd>/.wrangler` — keep it in the
  // (git-ignored) example rather than wherever Playwright was started.
  cwd: example,
  env: { ...process.env, PORT: port, WRANGLER_SEND_METRICS: 'false', CI: '1' },
})
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig))
child.on('exit', (code) => process.exit(code ?? 1))
