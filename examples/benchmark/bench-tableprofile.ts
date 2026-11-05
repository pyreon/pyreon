/**
 * The `table` scenario's mount (1,000 rows × 6 cols), attributed in real
 * Chromium. Two modes, both on `?profileTable=1` (see `setupTableProfile` in
 * src/impl/scenario-table.ts):
 *
 *   bun bench-tableprofile.ts split [rounds]
 *     Interleaved Pyreon / react-table mounts, each split into the mount's JS
 *     (until `mount()` returns) and the forced layout after it — the board's
 *     `bench()` times the two together. Median + bootstrap CI95 per arm.
 *
 *   bun bench-tableprofile.ts profile [Pyreon|React] [iterations]
 *     CDP CPU profile with SUBTREE attribution under the `__mountOnly` frame
 *     (teardown and data building are excluded). Attribution, not timing.
 *
 * Profiling needs function names: `BENCH_PROFILE=1 bun run build` first. The
 * split mode is meant for the production build (`bun run build`).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const MODE = (process.argv[2] ?? 'split') as 'split' | 'profile'
const PORT = process.env.TP_PORT ?? '4184'
const ARMS = ['Pyreon', 'React 19 (react-table, memo rows)'] as const

const preview = spawn('bunx', ['vite', 'preview', '--port', PORT, '--strictPort'], { cwd: import.meta.dir, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] })
try {
  // The served bundle must be the one on disk (a parallel worktree can own the port).
  const dir = `${import.meta.dir}/dist/assets`
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const served = await fetch(`http://localhost:${PORT}/assets/${f}`).then((r) => (r.ok ? r.text() : null)).catch(() => null)
    if (served !== readFileSync(`${dir}/${f}`, 'utf8')) throw new Error(`[table-profile] :${PORT} does not serve on-disk ${f}. Set TP_PORT.`)
  }
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.goto(`http://localhost:${PORT}/?profileTable=1`)
  await page.waitForFunction(() => '__tableProf' in globalThis, undefined, { timeout: 30_000 })
  type Prof = { prepare(fw: string): void; mount(): void; teardown(): void; cells(): number; split(): { js: number; layout: number } }

  if (MODE === 'split') {
    const ROUNDS = Number(process.argv[3] ?? 40)
    console.log(`crossOriginIsolated=${await page.evaluate(() => crossOriginIsolated)}`)
    const raw = await page.evaluate(
      async ({ arms, rounds }) => {
        const p = (globalThis as never as { __tableProf: Prof }).__tableProf
        const out: Record<string, { js: number[]; layout: number[] }> = {}
        for (const a of arms) out[a] = { js: [], layout: [] }
        const gc = (globalThis as { gc?: () => void }).gc
        for (let r = 0; r < rounds + 5; r++) {
          const order = r % 2 === 0 ? arms : [...arms].reverse()
          for (const a of order) {
            p.prepare(a)
            gc?.()
            await new Promise((res) => setTimeout(res, 16))
            const s = p.split()
            if (r >= 5) {
              out[a]!.js.push(s.js)
              out[a]!.layout.push(s.layout)
            }
          }
        }
        return out
      },
      { arms: [...ARMS], rounds: ROUNDS },
    )
    const med = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!
    const ci = (a: number[]): [number, number] => {
      let s = 12345
      const rnd = (): number => (s = (s * 16807) % 2147483647) / 2147483647
      const m: number[] = []
      for (let b = 0; b < 2000; b++) m.push(med(a.map(() => a[Math.floor(rnd() * a.length)]!)))
      m.sort((x, y) => x - y)
      return [m[50]!, m[1949]!]
    }
    for (const a of ARMS) {
      for (const k of ['js', 'layout'] as const) {
        const [lo, hi] = ci(raw[a]![k])
        console.log(`${a.padEnd(36)} ${k.padEnd(6)} ${med(raw[a]![k]).toFixed(3)} [${lo.toFixed(3)}–${hi.toFixed(3)}] ms`)
      }
    }
  } else {
    const FW = process.argv[3] === 'React' ? ARMS[1] : (process.argv[3] ?? 'Pyreon')
    const ITER = Number(process.argv[4] ?? 150)
    const cdp = await page.context().newCDPSession(page)
    const cells = await page.evaluate((fw) => {
      const p = (globalThis as never as { __tableProf: Prof }).__tableProf
      p.prepare(fw)
      for (let i = 0; i < 10; i++) {
        p.mount()
        if (i < 9) p.teardown()
      }
      const c = p.cells()
      p.teardown()
      return c
    }, FW)
    if (cells !== 6000) throw new Error(`[table-profile] ${FW}: ${cells} cells after warmup`)
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 10 })
    await cdp.send('Profiler.start')
    await page.evaluate((iter) => {
      const p = (globalThis as never as { __tableProf: Prof }).__tableProf
      for (let i = 0; i < iter; i++) {
        p.mount()
        p.teardown()
      }
    }, ITER)
    const { profile } = await cdp.send('Profiler.stop')
    type PNode = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number; children?: number[] }
    const nodes = profile.nodes as PNode[]
    const byId = new Map(nodes.map((n) => [n.id, n]))
    if (!nodes.some((n) => n.callFrame.functionName === '__mountOnly')) {
      throw new Error('[table-profile] no __mountOnly frame — the build is minified. Rebuild: BENCH_PROFILE=1 bun run build')
    }
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
    for (const n of nodes) if (n.callFrame.functionName === '__mountOnly') walk(n.id, new Set())
    const all = nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0)
    const effUs = (profile.endTime - profile.startTime) / Math.max(1, all)
    const us = (h: number): string => ((h * effUs) / ITER).toFixed(1).padStart(8)
    console.log(`[table-profile] ${FW} mount × ${ITER}; delivered ${effUs.toFixed(1)}µs sampling`)
    console.log(`\n=== __mountOnly — ${total} samples · ${us(total).trim()}µs/op JS (attribution, not timing) ===`)
    console.log('\n-- inclusive (top 30) --')
    for (const [k, h] of [...incl].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`${((h / total) * 100).toFixed(1).padStart(5)}%  ${us(h)}µs/op  ${k}`)
    console.log('\n-- self (top 30) --')
    for (const [k, h] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`${((h / total) * 100).toFixed(1).padStart(5)}%  ${us(h)}µs/op  ${k}`)
    const gc = nodes.filter((n) => n.callFrame.functionName === '(garbage collector)').reduce((s, n) => s + (n.hitCount ?? 0), 0)
    console.log(`\n(garbage collector): ${((gc / all) * 100).toFixed(1)}% of the whole profile — NOT under __mountOnly`)
  }
} finally {
  await browser.close()
  preview.kill()
}
