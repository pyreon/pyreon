/**
 * Hydration profiler — CDP CPU profile of a prerendered docs page load,
 * attributing self-time to hydration-path functions.
 *
 *   cd docs && bun bench-hydration-profile.ts [path]
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const path = process.argv[2] ?? '/docs/reactivity'

const server = spawn('bun', ['../scripts/serve-ssg.ts', 'dist', '4188'], {
  cwd: import.meta.dir + '/..',
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 1500))

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
const cdp = await page.context().newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 50 })

// Profile N load cycles to accumulate samples (hydration is a one-shot
// per-load cost — repeat loads to make it attributable).
await cdp.send('Profiler.start')
for (let i = 0; i < (process.env.QUICK ? 2 : 15); i++) {
  await page.goto(`http://localhost:4188${path}`, { waitUntil: 'networkidle' })
}
const { profile } = await cdp.send('Profiler.stop')
await browser.close()
server.kill()

type PNode = {
  callFrame: { functionName: string; url: string; lineNumber: number }
  hitCount?: number
}
const nodes = profile.nodes as PNode[]
const total = nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0)
const byFn = new Map<string, number>()
for (const n of nodes) {
  const name = n.callFrame.functionName || '(anonymous)'
  const url = n.callFrame.url.split('/').pop()?.split('?')[0] ?? ''
  const key = `${name} @${url}`
  byFn.set(key, (byFn.get(key) ?? 0) + (n.hitCount ?? 0))
}
console.warn(`\n=== hydration profile ${path} ×15 loads (${total} samples @50µs) ===`)
for (const [key, hits] of [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 35)) {
  console.warn(`${((hits / total) * 100).toFixed(1).padStart(5)}%  ${String(hits).padStart(6)}  ${key}`)
}
