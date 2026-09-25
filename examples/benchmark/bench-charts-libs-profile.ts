/**
 * CPU-profile ONE chart library's line mount (or update) in real Chromium via
 * CDP, with SUBTREE attribution under the named driver frames exposed by
 * `?profileChartsLibs=1` (see `setupChartsLibsProfile` in
 * src/impl/scenario-charts-libs.ts). Only work under `__mountOnly` /
 * `__updateOnly` is counted, so teardown and data building cannot pollute it.
 *
 * JS-ONLY: style, layout, paint and raster run outside these frames and are
 * NOT in this attribution — use `bench-scenarios.ts --scenario charts-libs`
 * for the frame-bounded wall-clock numbers. The derived per-op mean here is a
 * sampling-attribution figure, not a timing result.
 *
 * The build MUST preserve function names (the walk keys on them):
 *
 *   BENCH_PROFILE=1 bun run build
 *   bun bench-charts-libs-profile.ts "Pyreon (PlotChart)" mount 1000000 [iterations]
 */
import { readdirSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const FW = process.argv[2] ?? 'Pyreon (PlotChart)'
const OP = (process.argv[3] ?? 'mount') as 'mount' | 'update'
const N = Number(process.argv[4] ?? 1_000_000)
const ITER = Number(process.argv[5] ?? (N >= 1_000_000 ? 30 : N >= 100_000 ? 100 : 300))
const INTERVAL_US = 10
const PORT = process.env.CP_PORT ?? '4183'

const preview = spawn('bunx', ['vite', 'preview', '--port', PORT, '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] })
try {
  // Served bundle must be the one on disk (a parallel worktree can own the port).
  const dir = `${import.meta.dir}/dist/assets`
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const served = await fetch(`http://localhost:${PORT}/assets/${f}`).then((r) => (r.ok ? r.text() : null)).catch(() => null)
    if (served !== readFileSync(`${dir}/${f}`, 'utf8')) {
      throw new Error(`[charts-profile] :${PORT} does not serve on-disk ${f} — another server owns the port. Set CP_PORT.`)
    }
  }

  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  const cdp = await page.context().newCDPSession(page)
  await page.goto(`http://localhost:${PORT}/?profileChartsLibs=1`)
  await page.waitForFunction(() => '__chartsLibsProf' in globalThis, undefined, { timeout: 30_000 })

  type Prof = { prepare(fw: string, n: number): void; mount(): void; update(): void; teardown(): void; mass(): number }
  // --history: mount 1k / 10k / 100k charts 30× each first, the state the
  // timed scenario's 1M cell starts from (it runs after the smaller cells).
  // Measured: Pyreon's 1M mount is ~31 ms on a fresh page and ~50 ms after
  // this history; uPlot is ~13 ms either way.
  if (process.argv.includes('--history')) {
    await page.evaluate(async (fw) => {
      const P = (globalThis as never as { __chartsLibsProf: { prepare(f: string, n: number): void; sampleMount(): Promise<unknown> } }).__chartsLibsProf
      for (const n of [1000, 10000, 100000]) {
        P.prepare(fw, n)
        for (let i = 0; i < 30; i++) await P.sampleMount()
      }
    }, FW)
    console.log('[charts] --history: ran 1k/10k/100k × 30 mounts first')
  }
  // Warm + gate: the op must actually draw.
  const mass = await page.evaluate(
    ({ fw, n, op }) => {
      const p = (globalThis as never as { __chartsLibsProf: Prof }).__chartsLibsProf
      p.prepare(fw, n)
      for (let i = 0; i < 8; i++) {
        p.mount()
        if (op === 'update') p.update()
        if (i < 7) p.teardown()
      }
      const m = p.mass()
      if (op === 'mount') p.teardown()
      return m
    },
    { fw: FW, n: N, op: OP },
  )
  if (mass < 400) throw new Error(`[charts-profile] ${FW}: only ${mass} series pixels after warmup — nothing drawn`)
  console.log(`[charts-profile] ${FW} ${OP} ${N.toLocaleString('en')} × ${ITER} (gate: ${mass} series px)`)

  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: INTERVAL_US })
  await cdp.send('Profiler.start')
  await page.evaluate(
    ({ iter, op }) => {
      const p = (globalThis as never as { __chartsLibsProf: Prof }).__chartsLibsProf
      if (op === 'mount') {
        for (let i = 0; i < iter; i++) {
          p.mount()
          p.teardown()
        }
      } else {
        for (let i = 0; i < iter; i++) p.update()
        p.teardown()
      }
    },
    { iter: ITER, op: OP },
  )
  const { profile } = await cdp.send('Profiler.stop')

  type PNode = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number; children?: number[] }
  const nodes = profile.nodes as PNode[]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rootName = OP === 'mount' ? '__mountOnly' : '__updateOnly'
  if (!nodes.some((n) => n.callFrame.functionName === rootName)) {
    throw new Error(`[charts-profile] no ${rootName} frame in the profile — the build is minified. Rebuild: BENCH_PROFILE=1 bun run build`)
  }

  // Self time under the root, and INCLUSIVE time per function name (a
  // function counted once per sample even when it recurses).
  const self = new Map<string, number>()
  const incl = new Map<string, number>()
  let total = 0
  const key = (n: PNode): string => `${n.callFrame.functionName || '(anonymous)'} @${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`
  const walk = (id: number, path: Set<string>): void => {
    const n = byId.get(id)!
    const k = key(n)
    const added = !path.has(k)
    if (added) path.add(k)
    const hits = n.hitCount ?? 0
    if (hits) {
      total += hits
      self.set(k, (self.get(k) ?? 0) + hits)
      for (const p of path) incl.set(p, (incl.get(p) ?? 0) + hits)
    }
    for (const c of n.children ?? []) walk(c, path)
    if (added) path.delete(k)
  }
  for (const n of nodes) if (n.callFrame.functionName === rootName) walk(n.id, new Set())

  // The REQUESTED interval is not the delivered one: on macOS V8's sampler
  // fires far less often than 10µs, so `samples × requested` understates every
  // figure (measured: ~6× low on this machine). Derive the EFFECTIVE interval
  // from the profile's own wall span over its total sample count.
  const allSamples = nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0)
  const effUs = (profile.endTime - profile.startTime) / Math.max(1, allSamples)
  console.log(`[charts-profile] requested ${INTERVAL_US}µs sampling, delivered ${effUs.toFixed(1)}µs (wall span / samples)`)
  const us = (h: number): string => ((h * effUs) / ITER).toFixed(1).padStart(8)
  console.log(`\n=== ${rootName} — ${total} samples · ${us(total).trim()}µs/op JS (attribution, not timing) ===`)
  console.log('\n-- inclusive (top 20) --')
  for (const [k, h] of [...incl].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`${((h / total) * 100).toFixed(1).padStart(5)}%  ${us(h)}µs/op  ${k}`)
  }
  console.log('\n-- self (top 20) --')
  for (const [k, h] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`${((h / total) * 100).toFixed(1).padStart(5)}%  ${us(h)}µs/op  ${k}`)
  }
  const gc = nodes.filter((n) => n.callFrame.functionName === '(garbage collector)').reduce((s, n) => s + (n.hitCount ?? 0), 0)
  const all = nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0)
  console.log(`\n(garbage collector): ${gc} samples = ${((gc / all) * 100).toFixed(1)}% of the whole profile — NOT under ${rootName}`)
} finally {
  await browser.close()
  preview.kill()
}
