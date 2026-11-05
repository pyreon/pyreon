/**
 * Swap-rows diagnosis in REAL Chromium: Pyreon vs Vue 3.6 Vapor (RC) vs
 * hand-written Vanilla, on the row board's exact markup and update shape
 * (`src/impl/profile-swap.tsx`, served behind `?profileSwap=1`).
 *
 * Two phases:
 *
 *  1. WALL CLOCK, interleaved. Every round runs each arm once in a rotating
 *     order, mirroring `bench()` in runner.ts: `gc()` before the sample, then
 *     `t0 → swap (+ Vapor's nextTick) → t1 → getBoundingClientRect() → t2`,
 *     then a macrotask yield. Reports the total (t2−t0, what the board times)
 *     split into "update" (t1−t0: framework JS plus the DOM calls themselves)
 *     and "flush" (t2−t1: style + layout the forced flush pays). Median with a
 *     bootstrap CI95. The page is crossOriginIsolated, so the clock is 5µs.
 *
 *  2. CPU PROFILE, one arm per profile, so whole-profile attribution needs no
 *     frame naming (Vapor's RC runtime is a minified prod build and its flush
 *     runs in a microtask outside any caller frame). Reports derived µs/op per
 *     category and the top self-time frames. Native DOM/layout time is charged
 *     to the JS frame that called it (`insertBefore`, `getBoundingClientRect`).
 *
 * The build MUST preserve function names or the Pyreon frame breakdown is
 * useless:
 *
 *   BENCH_PROFILE=1 bun run build && bun bench-swapprofile.ts [rounds] [profileIters]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROUNDS = Number(process.argv[2] ?? 400)
const PROFILE_ITER = Number(process.argv[3] ?? 600)
const INTERVAL_US = 10
const PORT = process.env.CP_PORT ?? '4183'
const ARMS = (process.env.SWAP_ARMS ?? 'pyreon,vapor,vanilla').split(',')
// Replace-all history before measuring (the board swaps on a list that has
// already been created + replaced ~50 times). 0 = a freshly mounted list.
const CHURN = Number(process.env.SWAP_CHURN ?? 0)

const preview = spawn('bunx', ['vite', 'preview', '--port', PORT, '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch({
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})

function bootCI(xs: number[]): [number, number] {
  const n = xs.length
  const meds: number[] = []
  for (let b = 0; b < 2000; b++) {
    const r: number[] = []
    for (let i = 0; i < n; i++) r.push(xs[Math.floor(Math.random() * n)] as number)
    r.sort((a, c) => a - c)
    meds.push(r[Math.floor(n / 2)] as number)
  }
  meds.sort((a, c) => a - c)
  return [meds[Math.floor(0.025 * meds.length)] as number, meds[Math.floor(0.975 * meds.length)] as number]
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number
const fmt = (xs: number[]) => {
  const [lo, hi] = bootCI(xs)
  return `${(med(xs) * 1000).toFixed(0).padStart(5)} [${(lo * 1000).toFixed(0)}–${(hi * 1000).toFixed(0)}]`
}

try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  const cdp = await page.context().newCDPSession(page)

  // Same served-bundle guard as bench-clearprofile.ts: refuse to measure a
  // bundle another worktree's preview is serving on this port.
  {
    const dir = `${import.meta.dir}/dist/assets`
    const js = readdirSync(dir).filter((f) => f.endsWith('.js'))
    const probe = js.sort(
      (a, b) => readFileSync(`${dir}/${b}`).length - readFileSync(`${dir}/${a}`).length,
    )[0] as string
    const onDisk = readFileSync(`${dir}/${probe}`, 'utf8')
    const served = await fetch(`http://localhost:${PORT}/assets/${probe}`)
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null)
    if (served !== onDisk) {
      throw new Error(`[swapprofile] :${PORT} is not serving this worktree's build — set CP_PORT`)
    }
  }

  await page.goto(`http://localhost:${PORT}/?profileSwap=1`)
  await page.waitForFunction(() => '__swapBench' in globalThis, undefined, { timeout: 30_000 })
  const isolated = await page.evaluate(() => crossOriginIsolated)
  console.log(`[swapprofile] crossOriginIsolated=${isolated} arms=${ARMS.join(',')}`)

  type Drivers = Record<
    string,
    { swap: () => unknown; flush: () => void; ids: () => number[]; churn: (n: number) => unknown }
  >

  // Correctness: one swap must exchange positions 1 and 998, a second restores.
  const check = await page.evaluate(async (arms) => {
    const d = (globalThis as never as { __swapBench: Drivers }).__swapBench
    const out: Record<string, string> = {}
    for (const a of arms) {
      const before = d[a]!.ids()
      await d[a]!.swap()
      const mid = d[a]!.ids()
      await d[a]!.swap()
      const after = d[a]!.ids()
      const ok =
        before.length === 1000 &&
        mid[1] === before[998] &&
        mid[998] === before[1] &&
        mid[500] === before[500] &&
        after.join() === before.join()
      // DOM-op census for one swap: every mutating Node/Element call, in order.
      const log: string[] = []
      const P = Node.prototype as unknown as Record<string, (...x: unknown[]) => unknown>
      const E = Element.prototype as unknown as Record<string, (...x: unknown[]) => unknown>
      const patched: [Record<string, (...x: unknown[]) => unknown>, string, (...x: unknown[]) => unknown][] = []
      for (const [proto, m] of [
        [P, 'insertBefore'], [P, 'appendChild'], [P, 'removeChild'], [P, 'replaceChild'],
        [E, 'remove'], [E, 'before'], [E, 'after'], [E, 'setAttribute'], [E, 'replaceChildren'],
      ] as const) {
        const orig = proto[m] as (...x: unknown[]) => unknown
        patched.push([proto, m, orig])
        proto[m] = function (this: unknown, ...x: unknown[]) {
          log.push(m)
          return orig.apply(this, x)
        }
      }
      try {
        await d[a]!.swap()
      } finally {
        for (const [proto, m, orig] of patched) proto[m] = orig
      }
      await d[a]!.swap()
      out[a] = ok ? `ok ops=[${log.join(',')}]` : `FAIL ${before.length} ${mid[1]}/${before[998]}`
    }
    return out
  }, ARMS)
  console.log('[swapprofile] correctness', JSON.stringify(check))
  if (CHURN > 0) {
    await page.evaluate(
      async ({ arms, n }) => {
        const d = (globalThis as never as { __swapBench: Drivers }).__swapBench
        for (const a of arms) await d[a]!.churn(n)
      },
      { arms: ARMS, n: CHURN },
    )
    console.log(`[swapprofile] churned each arm with ${CHURN} replace-all cycles`)
  }
  if (Object.values(check).some((v) => !v.startsWith('ok'))) throw new Error('swap correctness failed')

  // ── Phase 1: interleaved wall clock ──────────────────────────────────────
  const wall = await page.evaluate(
    async ({ rounds, arms }) => {
      const d = (globalThis as never as { __swapBench: Drivers }).__swapBench
      const gc = (globalThis as { gc?: () => void }).gc
      const res: Record<string, { tot: number[]; upd: number[]; fl: number[] }> = {}
      for (const a of arms) res[a] = { tot: [], upd: [], fl: [] }
      const yieldTask = () => new Promise((r) => setTimeout(r, 0))
      for (let w = 0; w < 60; w++) for (const a of arms) {
        await d[a]!.swap()
        d[a]!.flush()
      }
      for (let r = 0; r < rounds; r++) {
        for (let j = 0; j < arms.length; j++) {
          const a = arms[(r + j) % arms.length] as string
          gc?.()
          const t0 = performance.now()
          await d[a]!.swap()
          const t1 = performance.now()
          d[a]!.flush()
          const t2 = performance.now()
          if (r >= 0) {
            res[a]!.tot.push(t2 - t0)
            res[a]!.upd.push(t1 - t0)
            res[a]!.fl.push(t2 - t1)
          }
          await yieldTask()
        }
      }
      return res
    },
    { rounds: ROUNDS, arms: ARMS },
  )
  console.log(`\n=== wall clock, ${ROUNDS} interleaved rounds — median µs [CI95] ===`)
  console.log('arm        total               update (JS+DOM calls)   flush (style+layout)')
  for (const a of ARMS) {
    const r = wall[a]!
    console.log(`${a.padEnd(9)} ${fmt(r.tot)}   ${fmt(r.upd)}   ${fmt(r.fl)}`)
  }

  // ── Phase 2: one CPU profile per arm ─────────────────────────────────────
  type PNode = {
    id: number
    callFrame: { functionName: string; url: string; lineNumber: number }
    hitCount?: number
    children?: number[]
  }
  for (const a of ARMS) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: INTERVAL_US })
    await cdp.send('Profiler.start')
    await page.evaluate(
      async ({ arm, iter }) => {
        const d = (globalThis as never as { __swapBench: Drivers }).__swapBench
        for (let i = 0; i < iter; i++) {
          await d[arm]!.swap()
          d[arm]!.flush()
        }
      },
      { arm: a, iter: PROFILE_ITER },
    )
    const { profile } = await cdp.send('Profiler.stop')
    const nodes = profile.nodes as PNode[]
    const byFn = new Map<string, number>()
    let total = 0
    for (const n of nodes) {
      const h = n.hitCount ?? 0
      if (!h) continue
      const name = n.callFrame.functionName || '(anonymous)'
      if (name === '(idle)') continue
      total += h
      const url = n.callFrame.url.split('/').pop() ?? ''
      const key = `${name} @${url}:${n.callFrame.lineNumber}`
      byFn.set(key, (byFn.get(key) ?? 0) + h)
    }
    const perOp = (h: number) => ((h * INTERVAL_US) / PROFILE_ITER).toFixed(1)
    console.log(
      `\n=== ${a} — ${total} non-idle samples · ${perOp(total)}µs/op over ${PROFILE_ITER} swaps (incl. harness loop) ===`,
    )
    for (const [k, h] of [...byFn.entries()].sort((x, y) => y[1] - x[1]).slice(0, 22)) {
      console.log(`${((h / total) * 100).toFixed(1).padStart(5)}%  ${perOp(h).padStart(7)}µs/op  ${k}`)
    }
  }
} finally {
  await browser.close()
  preview.kill()
}
