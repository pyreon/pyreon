/**
 * CPU-profile ONE framework's deep-tree scenario in real Chromium via CDP.
 *
 * Drives the BUILT bench page at `?mode=scenarios&scenario=tree&framework=X`
 * and prints self-time attribution, so mount-path perf work is grounded in
 * measurement rather than reading.
 *
 * Uses the SAME page the published `bench-scenarios.ts` numbers come from —
 * deliberately not a new fixture, so the profile describes the thing that was
 * measured.
 *
 *   bun bench-treeprofile.ts [Pyreon|SolidJS|…] [--port N]
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const fw = process.argv[2] ?? 'Pyreon'
const PORT = (() => {
  const i = process.argv.indexOf('--port')
  return i >= 0 ? Number(process.argv[i + 1]) : 4187
})()

const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch({
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})
const page = await browser.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[page]', m.text())
})
page.on('pageerror', (e) => console.error('[pageerror]', e.message))
const cdp = await page.context().newCDPSession(page)

await page.goto(`http://localhost:${PORT}/`)
await page.waitForLoadState('networkidle')

// Machine-verify the arm before trusting a single sample: the module the page
// actually loaded must be the module on disk. A stale preview file map has
// produced a stable, plausible, entirely wrong delta in this campaign before.
const armCheck = await page.evaluate(async () => {
  const scripts = [...document.querySelectorAll('script[type=module][src]')].map(
    (s) => (s as HTMLScriptElement).src,
  )
  return {
    crossOriginIsolated: (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated,
    scripts,
  }
})
console.log(`[arm] crossOriginIsolated=${armCheck.crossOriginIsolated}`)
console.log(`[arm] entry scripts: ${armCheck.scripts.join(', ')}`)

await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 50 }) // 50µs samples
await cdp.send('Profiler.start')

await page.goto(`http://localhost:${PORT}/?mode=scenarios&scenario=tree&framework=${encodeURIComponent(fw)}`)
await page.waitForFunction(
  () => (globalThis as { __benchResults?: unknown[] }).__benchResults !== undefined,
  undefined,
  { timeout: 300_000 },
)

const { profile } = await cdp.send('Profiler.stop')
const results = await page.evaluate(
  () => (globalThis as { __benchResults?: unknown[] }).__benchResults,
)
await browser.close()
preview.kill()

console.log(`\n=== ${fw} — scenario results ===`)
console.log(JSON.stringify(results, null, 2).slice(0, 800))

type PNode = {
  id: number
  callFrame: { functionName: string; url: string; lineNumber: number }
  hitCount?: number
  children?: number[]
}
const nodes = profile.nodes as PNode[]
const totalSamples = nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0)
const byFn = new Map<string, number>()
for (const n of nodes) {
  const name = n.callFrame.functionName || '(anonymous)'
  const url = n.callFrame.url.split('/').pop() ?? ''
  const key = `${name} @${url}:${n.callFrame.lineNumber}`
  byFn.set(key, (byFn.get(key) ?? 0) + (n.hitCount ?? 0))
}
const sorted = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
console.log(`\n=== ${fw} — self-time top 40 (of ${totalSamples} samples) ===`)
for (const [key, hits] of sorted) {
  const pct = ((hits / totalSamples) * 100).toFixed(1)
  console.log(`${pct.padStart(5)}%  ${String(hits).padStart(6)}  ${key}`)
}
