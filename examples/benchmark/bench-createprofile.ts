/**
 * CPU-profile the CREATE path in REAL Chromium via CDP, with SUBTREE
 * attribution, for Pyreon and hand-written Vanilla DOM side by side.
 *
 * This is the instrument behind "where does Pyreon's residual gap to Vanilla
 * actually go on create?". Vanilla is the floor — the best any framework can
 * do on this markup — so the Pyreon-minus-Vanilla delta IS the removable
 * budget, and this script attributes that delta to named functions instead of
 * leaving it as a single aggregate percentage.
 *
 * Method notes that matter for trusting the output:
 *
 *   - SUBTREE attribution (same as `bench-clearprofile.ts`): the profiling page
 *     (`?profileCreate=1`) drives NAMED functions and this script sums hits only
 *     under frames with those names, so interleaved arms cannot pollute each
 *     other's numbers.
 *   - The arms are INTERLEAVED inside each iteration, so thermal ramp, JIT
 *     state and OS scheduling drift hit both arms equally. Attribution keeps
 *     them separate regardless.
 *   - The timed region is DECOMPOSED (`build` / `commit`) as well as measured
 *     whole (`create`), because the benched Pyreon create allocates a `signal()`
 *     per row that Vanilla never pays. Reporting that as "mount overhead" would
 *     misattribute an inherent cost of a reactive list to the renderer.
 *     `create` is measured independently, so the decomposition can be checked
 *     against the thing it claims to explain.
 *   - GC is attributed SEPARATELY. V8's GC frames are not parented under the
 *     driver frame, so a subtree walk structurally cannot see them — and
 *     per-row allocation is exactly the kind of work that pays in GC rather
 *     than in the mutator. Leaving it out would understate the arm that
 *     allocates more.
 *   - The derived per-op mean is (samples × interval) / iterations, which is
 *     immune to `performance.now()`'s clamp. It is a SAMPLING estimate, so
 *     treat it as attribution, not as a timing result — the fair bench is the
 *     timing authority.
 *
 * The build MUST preserve function names (the attribution keys on them), which
 * is the opposite of what `bench-createsplit.ts` requires — read both headers
 * before running either.
 *
 *   BENCH_PROFILE=1 bun run build && bun bench-createprofile.ts [iterations] [rows]
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ITER = Number(process.argv[2] ?? 200)
const ROWS = Number(process.argv[3] ?? 1000)
const INTERVAL_US = 10
const PORT = 4182

const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

type Driver = Record<string, (n?: number) => unknown>
type CreateBench = { pyreon: Driver; vanilla: Driver }

const browser = await chromium.launch({
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  const cdp = await page.context().newCDPSession(page)

  await page.goto(`http://localhost:${PORT}/?profileCreate=1`)
  await page.waitForFunction(() => '__createBench' in globalThis, undefined, { timeout: 30_000 })

  // Warmup: JIT-stabilize both paths AND verify each arm actually renders the
  // rows it claims to. An arm that silently renders nothing would otherwise
  // profile as blazingly fast.
  const warm = await page.evaluate((rows) => {
    const b = (globalThis as never as { __createBench: CreateBench }).__createBench
    b.pyreon.create!(rows)
    const pCreate = b.pyreon.rowCount!() as number
    b.vanilla.create!(rows)
    const vCreate = b.vanilla.rowCount!() as number
    b.pyreon.build!(rows)
    b.pyreon.commit!()
    const pCommit = b.pyreon.rowCount!() as number
    b.vanilla.build!(rows)
    b.vanilla.commit!()
    const vCommit = b.vanilla.rowCount!() as number
    b.pyreon.clear!()
    b.vanilla.clear!()
    const pClear = b.pyreon.rowCount!() as number
    const vClear = b.vanilla.rowCount!() as number
    for (let i = 0; i < 30; i++) {
      b.pyreon.create!(rows)
      b.pyreon.clear!()
      b.vanilla.create!(rows)
      b.vanilla.clear!()
      b.pyreon.build!(rows)
      b.pyreon.commit!()
      b.pyreon.clear!()
      b.vanilla.build!(rows)
      b.vanilla.commit!()
      b.vanilla.clear!()
    }
    return { pCreate, vCreate, pCommit, vCommit, pClear, vClear }
  }, ROWS)

  for (const [k, v] of Object.entries(warm)) {
    const want = k.endsWith('Clear') ? 0 : ROWS
    if (v !== want) {
      throw new Error(`[createprofile] state check failed: ${k}=${v}, expected ${want}`)
    }
  }
  console.log(`[createprofile] both arms verified at ${ROWS} rows · ${ITER} iterations/phase`)

  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: INTERVAL_US })
  await cdp.send('Profiler.start')

  // Phase A — decomposed. Phase B — whole. Arms interleaved within each
  // iteration of both phases.
  await page.evaluate(
    ({ iter, rows }) => {
      const b = (globalThis as never as { __createBench: CreateBench }).__createBench
      for (let i = 0; i < iter; i++) {
        b.pyreon.build!(rows)
        b.pyreon.commit!()
        b.pyreon.clear!()
        b.vanilla.build!(rows)
        b.vanilla.commit!()
        b.vanilla.clear!()
      }
      for (let i = 0; i < iter; i++) {
        b.pyreon.create!(rows)
        b.pyreon.clear!()
        b.vanilla.create!(rows)
        b.vanilla.clear!()
      }
    },
    { iter: ITER, rows: ROWS },
  )

  const { profile } = await cdp.send('Profiler.stop')

  type PNode = {
    id: number
    callFrame: { functionName: string; url: string; lineNumber: number }
    hitCount?: number
    children?: number[]
  }
  const nodes = profile.nodes as PNode[]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const grandTotal = nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0)

  const subtreeReport = (rootName: string, iterations: number, top = 18) => {
    const inSubtree = new Set<number>()
    const stack: number[] = []
    for (const n of nodes) if (n.callFrame.functionName === rootName) stack.push(n.id)
    while (stack.length) {
      const id = stack.pop()!
      if (inSubtree.has(id)) continue
      inSubtree.add(id)
      for (const c of byId.get(id)?.children ?? []) stack.push(c)
    }
    let total = 0
    const byFn = new Map<string, number>()
    for (const id of inSubtree) {
      const n = byId.get(id)!
      const hits = n.hitCount ?? 0
      if (!hits) continue
      total += hits
      const url = n.callFrame.url.split('/').pop() ?? ''
      const key = `${n.callFrame.functionName || '(anonymous)'} @${url}:${n.callFrame.lineNumber}`
      byFn.set(key, (byFn.get(key) ?? 0) + hits)
    }
    const meanUs = (total * INTERVAL_US) / iterations
    console.log(
      `\n=== ${rootName} — ${total} samples · derived mean ${meanUs.toFixed(1)}µs/op over ${iterations} iterations ===`,
    )
    for (const [key, hits] of [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)) {
      const pct = ((hits / Math.max(total, 1)) * 100).toFixed(1)
      const us = ((hits * INTERVAL_US) / iterations).toFixed(1)
      console.log(`${pct.padStart(5)}%  ${us.padStart(7)}µs/op  ${key}`)
    }
    return meanUs
  }

  // A subtree walk keys on `functionName`, so a MINIFIED build silently
  // attributes nothing and every cell reports a confident `0.0µs` — the
  // instrument reading as an impossibly fast result rather than as broken.
  // Refuse to report instead: an empty attribution is a failure, never a pass.
  const driverNames = [
    '__pyreonBuild',
    '__pyreonCommit',
    '__pyreonCreate',
    '__vanillaBuild',
    '__vanillaCommit',
    '__vanillaCreate',
  ]
  const anyFrame = nodes.some((n) => driverNames.includes(n.callFrame.functionName))
  if (!anyFrame) {
    throw new Error(
      `[createprofile] not one driver frame appears in a ${grandTotal}-sample profile — ` +
        `the build is minified, so subtree attribution is keying on names that no longer exist. ` +
        `Rebuild with name preservation: BENCH_PROFILE=1 bun run build`,
    )
  }

  const r: Record<string, number> = {}
  for (const name of driverNames) {
    r[name] = subtreeReport(name, ITER)
  }

  // GC attribution — not parented under the drivers, so reported globally.
  let gcHits = 0
  for (const n of nodes) {
    const f = n.callFrame.functionName
    if (f === '(garbage collector)' || f === '(GC)') gcHits += n.hitCount ?? 0
  }

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  console.log(`\n${'='.repeat(72)}`)
  console.log(`CREATE-PATH ATTRIBUTION @ ${ROWS} rows (sampling estimate, ${INTERVAL_US}µs)`)
  console.log('='.repeat(72))
  console.log(
    `  build   : pyreon ${r.__pyreonBuild!.toFixed(1)}µs  vanilla ${r.__vanillaBuild!.toFixed(1)}µs  Δ ${(r.__pyreonBuild! - r.__vanillaBuild!).toFixed(1)}µs`,
  )
  console.log(
    `  commit  : pyreon ${r.__pyreonCommit!.toFixed(1)}µs  vanilla ${r.__vanillaCommit!.toFixed(1)}µs  Δ ${(r.__pyreonCommit! - r.__vanillaCommit!).toFixed(1)}µs`,
  )
  console.log(
    `  create  : pyreon ${r.__pyreonCreate!.toFixed(1)}µs  vanilla ${r.__vanillaCreate!.toFixed(1)}µs  Δ ${(r.__pyreonCreate! - r.__vanillaCreate!).toFixed(1)}µs`,
  )
  const sumP = r.__pyreonBuild! + r.__pyreonCommit!
  const sumV = r.__vanillaBuild! + r.__vanillaCommit!
  console.log(
    `  decomposition check — build+commit vs create: pyreon ${sumP.toFixed(1)} vs ${r.__pyreonCreate!.toFixed(1)}` +
      `, vanilla ${sumV.toFixed(1)} vs ${r.__vanillaCreate!.toFixed(1)}`,
  )
  console.log(
    `  GC (global, unattributable to a subtree): ${gcHits} samples = ${pct(gcHits / Math.max(grandTotal, 1))} of profile`,
  )
  console.log(
    `  attributed/total samples: ${((Object.values(r).reduce((s, x) => s + x, 0) * ITER) / INTERVAL_US).toFixed(0)}/${grandTotal}`,
  )
} finally {
  await browser.close()
  preview.kill()
}
