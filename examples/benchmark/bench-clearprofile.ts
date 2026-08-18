/**
 * CPU-profile the `clear rows` (and optionally replace/create) op in REAL
 * Chromium via CDP, with SUBTREE attribution: the profiling page
 * (`?profileClear=1`, see src/impl/profile-clear.tsx) drives named functions
 * (`__clearOnly` / `__createOnly` / `__replaceOnly`), and this script sums
 * self-time ONLY under those frames — so the create work interleaved between
 * clears cannot pollute the clear attribution.
 *
 * Also derives an unquantized per-op mean: (samples under frame × sampling
 * interval) / iterations — immune to performance.now()'s 100µs clamp.
 *
 * The build MUST preserve function names, because the attribution keys on them —
 * a plain `bun run build` minifies and the script then reports `0.0µs` for every
 * driver instead of failing. It now refuses to report in that state.
 *
 *   BENCH_PROFILE=1 bun run build && bun bench-clearprofile.ts [iterations] [rows]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ITER = Number(process.argv[2] ?? 300)
const ROWS = Number(process.argv[3] ?? 1000)
const INTERVAL_US = 10
// Overridable so two worktrees can profile CONCURRENTLY. `--strictPort` means a
// taken port makes THIS preview exit rather than drift, and the served-bundle
// check below then refuses to report — see the guard for why both are needed.
const PORT = process.env.CP_PORT ?? '4181'

const preview = spawn('bunx', ['vite', 'preview', '--port', PORT, '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch({
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  const cdp = await page.context().newCDPSession(page)

  // MEASUREMENT INTEGRITY — the same class of guard as `bench-fair`'s
  // `--strictPort` note, and it fired for real: a parallel worktree holding
  // this port made our `--strictPort` preview exit, and the script then
  // profiled THAT worktree's bundle while reporting confidently. `--strictPort`
  // alone cannot catch it, because the failure is "someone else answers", not
  // "nobody answers". So compare what the server returns against what we just
  // built on disk, and refuse to report on a mismatch.
  {
    const dir = `${import.meta.dir}/dist/assets`
    const js = readdirSync(dir).filter((f) => f.endsWith('.js'))
    if (js.length === 0) throw new Error(`[clearprofile] no built assets in ${dir} — run the build first`)
    // The largest chunk is the framework bundle: the most sensitive probe, and
    // the one whose contents a stale server would actually differ on.
    const probe = js.sort(
      (a, b) => readFileSync(`${dir}/${b}`).length - readFileSync(`${dir}/${a}`).length,
    )[0] as string
    const onDisk = readFileSync(`${dir}/${probe}`, 'utf8')
    const served = await fetch(`http://localhost:${PORT}/assets/${probe}`)
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null)
    if (served === null) {
      throw new Error(
        `[clearprofile] cannot fetch /assets/${probe} on :${PORT} — the preview did not bind ` +
          `(port already held?). Set CP_PORT to a free port.`,
      )
    }
    if (served !== onDisk) {
      throw new Error(
        `[clearprofile] the server on :${PORT} is serving a DIFFERENT bundle than ${probe} on ` +
          `disk — another worktree owns this port. Refusing to measure. Set CP_PORT.`,
      )
    }
    console.log(`[clearprofile] served bundle == on-disk ${probe} on :${PORT}`)
  }

  await page.goto(`http://localhost:${PORT}/?profileClear=1`)
  await page.waitForFunction(() => '__clearBench' in globalThis, undefined, { timeout: 30_000 })

  // Warmup: JIT-stabilize both paths, verify DOM correctness both arms.
  const warm = await page.evaluate((rows) => {
    const b = (globalThis as never as { __clearBench: Record<string, (n?: number) => unknown> })
      .__clearBench
    b.create!(rows)
    const afterCreate = b.rowCount!()
    b.clear!()
    const afterClear = b.rowCount!()
    for (let i = 0; i < 30; i++) {
      b.create!(rows)
      b.clear!()
    }
    return { afterCreate, afterClear }
  }, ROWS)
  if (warm.afterCreate !== ROWS || warm.afterClear !== 0) {
    throw new Error(`state check failed: ${JSON.stringify(warm)} (expected ${ROWS}/0)`)
  }

  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: INTERVAL_US })
  await cdp.send('Profiler.start')

  await page.evaluate(
    ({ iter, rows }) => {
      const b = (globalThis as never as { __clearBench: Record<string, (n?: number) => void> })
        .__clearBench
      for (let i = 0; i < iter; i++) {
        b.create!(rows)
        b.clear!()
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

  const subtreeReport = (rootName: string, iterations: number) => {
    // Collect all nodes in the subtree(s) rooted at frames named rootName.
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
    for (const [key, hits] of [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
      const pct = ((hits / Math.max(total, 1)) * 100).toFixed(1)
      const us = ((hits * INTERVAL_US) / iterations).toFixed(1)
      console.log(`${pct.padStart(5)}%  ${us.padStart(7)}µs/op  ${key}`)
    }
    return meanUs
  }

  // A subtree walk keys on `functionName`, so a MINIFIED build attributes
  // nothing and every driver reports a confident `0.0µs` — the instrument
  // reading as an impossibly fast result rather than as broken. That is what
  // the documented `bun run build` (which minifies) produced. Refuse to report
  // instead: an empty attribution is a failure, never a pass.
  const driverNames = ['__clearOnly', '__createOnly', '__replaceOnly']
  if (!nodes.some((n) => driverNames.includes(n.callFrame.functionName))) {
    throw new Error(
      `[clearprofile] not one driver frame appears in a ` +
        `${nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0)}-sample profile — the build is ` +
        `minified, so subtree attribution is keying on names that no longer exist. ` +
        `Rebuild with name preservation: BENCH_PROFILE=1 bun run build`,
    )
  }

  subtreeReport('__clearOnly', ITER)
  subtreeReport('__createOnly', ITER)

  // GC attribution across the whole profile (GC frames are not parented under
  // the driver frames — report separately so the subtree means are read
  // honestly as "JS-only").
  const gcHits = nodes
    .filter((n) => n.callFrame.functionName === '(garbage collector)')
    .reduce((s, n) => s + (n.hitCount ?? 0), 0)
  const totalHits = nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0)
  console.log(
    `\n(garbage collector): ${gcHits} samples = ${((gcHits / Math.max(totalHits, 1)) * 100).toFixed(1)}% of whole profile (${totalHits} samples) — NOT attributed per-op`,
  )
} finally {
  await browser.close()
  preview.kill()
}
