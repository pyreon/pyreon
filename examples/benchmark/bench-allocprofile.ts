/**
 * CPU-profile ONE framework's create-10k path in real Chromium via CDP.
 *
 * Drives the BUILT bench page (vite preview server must NOT be needed —
 * we serve dist/ ourselves), runs `create 10,000 rows`-shaped work in a
 * loop under Profiler.start/stop, and prints self-time attribution so
 * perf candidates are grounded in real data instead of speculation.
 *
 *   bun bench-cpuprofile.ts [Pyreon|'Vanilla JS'|…]
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const fw = process.argv[2] ?? 'pyreon'

const preview = spawn('bunx', ['vite', 'preview', '--port', '4179', '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch({
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})
const page = await browser.newPage()
page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()) })
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
const cdp = await page.context().newCDPSession(page)

// Load the page WITHOUT auto-running (no ?framework= → button UI idle).
await page.goto('http://localhost:4179/')
await page.waitForLoadState('networkidle')

// Pull the per-framework suite module out of the page: we re-implement the
// create-10k loop inline against the page's own globals. The page exposes
// __benchResults after runs, but for profiling we want a TIGHT loop of just
// the create path. Simplest robust approach: run the real single-framework
// flow once (warms everything), then profile N repeats of the create-10k
// bench by re-navigating with ?framework=&only10k — not supported. So:
// profile the WHOLE single-framework suite run; create-10k dominates
// wall-clock (~100ms vs <40ms for the rest combined × 21 runs each…)
// — actually every op runs 20×, so attribute by function name instead of
// trying to isolate. Function-level self-time tells us where create cost
// lives regardless.
await cdp.send('HeapProfiler.enable')
// 16KB sampling interval — fine-grained allocation attribution
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384 })

await page.goto(`http://localhost:4179/?framework=${fw}`)
await page.waitForFunction(
  () => (globalThis as { __benchResults?: unknown[] }).__benchResults !== undefined,
  undefined,
  { timeout: 180_000 },
)

const { profile } = await cdp.send('HeapProfiler.stopSampling')
await browser.close()
preview.kill()

// Allocation attribution: walk the sampling-profile tree, credit SELF bytes.
type ANode = {
  callFrame: { functionName: string; url: string; lineNumber: number }
  selfSize: number
  children?: ANode[]
}
const byFn = new Map<string, number>()
let totalBytes = 0
const walk = (n: ANode) => {
  totalBytes += n.selfSize
  if (n.selfSize > 0) {
    const name = n.callFrame.functionName || '(anonymous)'
    const url = n.callFrame.url.split('/').pop() ?? ''
    const key = `${name} @${url}:${n.callFrame.lineNumber}`
    byFn.set(key, (byFn.get(key) ?? 0) + n.selfSize)
  }
  for (const c of n.children ?? []) walk(c)
}
walk((profile as { head: ANode }).head)
const sorted = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
console.log(`\n=== ${fw} — ALLOCATION self-bytes top 30 (total ${(totalBytes / 1048576).toFixed(1)} MB sampled) ===`)
for (const [key, bytes] of sorted) {
  const pct = ((bytes / totalBytes) * 100).toFixed(1)
  console.log(`${pct.padStart(5)}%  ${(bytes / 1048576).toFixed(2).padStart(8)} MB  ${key}`)
}
