#!/usr/bin/env bun
/**
 * Hydration PROFILER — CDP CPU-profile attribution of the hydration bench's
 * own fixture, per framework, so the wall-clock gap in `bench-hydration.ts`
 * can be explained rather than only observed.
 *
 * `bench-hydration.ts` answers "who is faster"; this answers "where does the
 * time go". It drives the SAME page (`?mode=hydration&framework=X`) under
 * `Profiler.start/stop` and attributes SELF time (`hitCount`) per function.
 *
 * Reading the output:
 *  - Samples land on the framework's own functions, on browser-internal work
 *    (`(program)` — HTML parse from the untimed `innerHTML` reset, layout,
 *    GC), and on `(garbage collector)`. The reset + verify are common-mode
 *    across frameworks, so the COMPARABLE quantity is the framework-attributed
 *    subset, which is what the summary block totals.
 *  - Self time, not total: a parent's cost shows on the leaf that spent it.
 *
 * Usage:
 *   bun bench-hydration-profile.ts               # Pyreon + Vue 3
 *   bun bench-hydration-profile.ts --frameworks Pyreon,Vue\ 3,Preact
 *   INTERVAL=20 bun bench-hydration-profile.ts   # finer sampling (µs)
 *
 * Assumes fixtures + build are current (`bun scripts/gen-hydration-fixtures.ts`
 * then `bun run build`); pass --build to do both first.
 */
import { execSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4187
const INTERVAL = Number(process.env.INTERVAL ?? 50)
const argv = process.argv.slice(2)
const pick = (flag: string): string | null => {
  const i = argv.indexOf(flag)
  return i >= 0 ? (argv[i + 1] ?? null) : null
}
const FRAMEWORKS = (pick('--frameworks') ?? 'Pyreon,Vue 3').split(',').map((s) => s.trim())
const TOP = Number(pick('--top') ?? 28)

if (argv.includes('--build')) {
  console.warn('[profile] regenerating fixtures + building…')
  execSync('bun scripts/gen-hydration-fixtures.ts', { stdio: 'inherit' })
  execSync('bun run build', { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })
}

const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 1500))

interface PNode {
  id: number
  callFrame: { functionName: string; url: string; lineNumber: number }
  hitCount?: number
  children?: number[]
}

/**
 * SUBTREE attribution rooted at the bench's `hydrate(container)` frame.
 *
 * This is the load-bearing part of the method. A FLAT self-time table pools
 * three unrelated phases the bench runs per iteration:
 *   - `inject` (untimed reset: teardown + `innerHTML = fixture`),
 *   - `hydrate` (the TIMED region),
 *   - `verify` (untimed click + rAF gate),
 * and Pyreon's untimed reset is structurally more expensive than Vue's purely
 * because its SSR fixture is 46% larger — which would read as a hydration loss
 * it is not. Rooting at `hydrate` and summing only that subtree measures the
 * region `bench-hydration.ts` actually times.
 */
function subtreeOf(
  nodes: PNode[],
  rootPred: (n: PNode) => boolean,
): { self: Map<string, number>; total: number } {
  const byId = new Map<number, PNode>()
  for (const n of nodes) byId.set(n.id, n)
  const self = new Map<string, number>()
  let total = 0
  const seen = new Set<number>()
  const visit = (id: number): void => {
    if (seen.has(id)) return // a profile tree is a DAG only via recursion guards
    seen.add(id)
    const n = byId.get(id)
    if (!n) return
    const hits = n.hitCount ?? 0
    if (hits > 0) {
      const fn = n.callFrame.functionName || '(anonymous)'
      const url = n.callFrame.url
      const file = url.startsWith('http') ? (url.split('/').pop()?.split('?')[0] ?? '—') : ''
      const key = file ? `${fn} @${file}` : fn
      self.set(key, (self.get(key) ?? 0) + hits)
      total += hits
    }
    for (const c of n.children ?? []) visit(c)
  }
  for (const n of nodes) if (rootPred(n)) visit(n.id)
  return { self, total }
}

const browser = await chromium.launch()
const perFw = new Map<
  string,
  { rows: [string, number][]; total: number; hydTotal: number; allSelf: [string, number][] }
>()

try {
  for (const fw of FRAMEWORKS) {
    const page = await browser.newPage()
    page.on('pageerror', (e) => console.error('[pageerror]', e.message))
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: INTERVAL })
    await cdp.send('Profiler.start')
    await page.goto(`http://localhost:${PORT}/?mode=hydration&framework=${encodeURIComponent(fw)}`)
    await page.waitForFunction(
      () => {
        const s = document.getElementById('status')?.textContent ?? ''
        return s.includes('Done') || s.includes('FAILED')
      },
      { timeout: 180_000 },
    )
    const status = await page.evaluate(() => document.getElementById('status')?.textContent)
    const { profile } = await cdp.send('Profiler.stop')
    await page.close()
    if (status?.includes('FAILED')) throw new Error(`[profile] ${fw} FAILED: ${status}`)

    const nodes = profile.nodes as PNode[]
    const total = nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0)
    // The bench's per-target `hydrate(container)` method — the TIMED region.
    // `inject` (reset) and `verify` (click gate) are deliberately excluded.
    const hyd = subtreeOf(
      nodes,
      (n) => n.callFrame.functionName === 'hydrate' && n.callFrame.url.includes('hydration'),
    )
    const allSelf = new Map<string, number>()
    for (const n of nodes) {
      const hits = n.hitCount ?? 0
      if (hits === 0) continue
      const fn = n.callFrame.functionName || '(anonymous)'
      const url = n.callFrame.url
      const file = url.startsWith('http') ? (url.split('/').pop()?.split('?')[0] ?? '—') : ''
      allSelf.set(file ? `${fn} @${file}` : fn, (allSelf.get(file ? `${fn} @${file}` : fn) ?? 0) + hits)
    }
    perFw.set(fw, {
      rows: [...hyd.self.entries()].sort((a, b) => b[1] - a[1]),
      total,
      hydTotal: hyd.total,
      allSelf: [...allSelf.entries()].sort((a, b) => b[1] - a[1]),
    })
  }
} finally {
  await browser.close()
  preview.kill()
}

for (const [fw, d] of perFw) {
  console.warn(
    `\n=== ${fw} — hydrate() SUBTREE: ${d.hydTotal} samples @${INTERVAL}µs` +
      ` (≈${((d.hydTotal * INTERVAL) / 1000).toFixed(0)}ms) of ${d.total} page-wide ===`,
  )
  console.warn('    %hyd  samples  function (self time)')
  for (const [key, hits] of d.rows.slice(0, TOP)) {
    const pct = ((hits / d.hydTotal) * 100).toFixed(1).padStart(5)
    console.warn(`   ${pct}%  ${String(hits).padStart(7)}  ${key}`)
  }
  if (argv.includes('--all')) {
    console.warn(`\n    --- page-wide self time (incl. untimed reset/verify) ---`)
    for (const [key, hits] of d.allSelf.slice(0, 12)) {
      console.warn(`   ${((hits / d.total) * 100).toFixed(1).padStart(5)}%  ${String(hits).padStart(7)}  ${key}`)
    }
  }
}

if (perFw.size === 2) {
  const [[aName, a], [bName, b]] = [...perFw.entries()] as [
    [string, { hydTotal: number }],
    [string, { hydTotal: number }],
  ]
  const ams = (a.hydTotal * INTERVAL) / 1000
  const bms = (b.hydTotal * INTERVAL) / 1000
  console.warn(`\n=== hydrate() subtree CPU: ${aName} vs ${bName} ===`)
  console.warn(`  ${aName.padEnd(10)} ${ams.toFixed(0)}ms`)
  console.warn(`  ${bName.padEnd(10)} ${bms.toFixed(0)}ms`)
  console.warn(
    `  delta      ${(ams - bms >= 0 ? '+' : '')}${(ams - bms).toFixed(0)}ms` +
      ` (${(((ams - bms) / bms) * 100).toFixed(1)}% vs ${bName})`,
  )
  console.warn(
    '\n  Sample counts pool warmup + timed iterations, so this is an\n' +
      '  ATTRIBUTION map (where the time goes), not a wall-clock verdict.\n' +
      '  Use bench-hydration.ts for the standing.',
  )
}
