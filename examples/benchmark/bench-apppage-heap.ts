#!/usr/bin/env bun
/**
 * Retained heap of ONE hydrated app page (the bench-apppage fixture), per
 * framework, in real Chromium. Untimed, so it needs no quiet machine.
 *
 * Uses the dist that `bench-apppage.ts` last built (run that first). For each
 * framework: load `?mode=apppage&framework=X&heap=1`, let the page finish its
 * own run, then N times: inject the SSR HTML, force a GC through CDP, read
 * `Runtime.getHeapUsage`, hydrate, GC again, read again, tear down. Reports the
 * median of the N deltas (bytes the hydrated page keeps alive).
 *
 * Usage: bun bench-apppage-heap.ts [--only Pyreon,Vue 3] [--n 7]
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const arg = (f: string): string | undefined => {
  const i = process.argv.indexOf(f)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const N = Number(arg('--n') ?? 7)
const FRAMEWORKS = (arg('--only')?.split(',') ?? ['Pyreon', 'React 19', 'Preact', 'Vue 3']).map((s) => s.trim())
const PORT = 4183
const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))
const browser = await chromium.launch()
try {
  for (const fw of FRAMEWORKS) {
    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}/?mode=apppage&framework=${encodeURIComponent(fw)}&heap=1`)
    await page.waitForFunction(() => /Done|FAILED/.test(document.getElementById('status')?.textContent ?? ''), undefined, {
      timeout: 300_000,
    })
    const cdp = await page.context().newCDPSession(page)
    const used = async (): Promise<number> => {
      await cdp.send('HeapProfiler.collectGarbage')
      await cdp.send('HeapProfiler.collectGarbage')
      return ((await cdp.send('Runtime.getHeapUsage')) as { usedSize: number }).usedSize
    }
    type Hooks = { inject(): void; hydrate(): Promise<void>; teardown(): void }
    const hook = (name: keyof Hooks) =>
      page.evaluate((n) => (globalThis as unknown as { __appPageHeapHooks: Hooks }).__appPageHeapHooks[n](), name)
    const deltas: number[] = []
    for (let i = 0; i < N; i++) {
      await hook('inject')
      const before = await used()
      await hook('hydrate')
      deltas.push((await used()) - before)
      await hook('teardown')
    }
    deltas.sort((a, b) => a - b)
    const med = deltas[deltas.length >> 1]!
    console.log(`${fw.padEnd(10)} retained ${(med / 1024).toFixed(1)} KB  (deltas KB: ${deltas.map((d) => (d / 1024).toFixed(1)).join(', ')})`)
    await page.close()
  }
} finally {
  await browser.close()
  preview.kill()
}
