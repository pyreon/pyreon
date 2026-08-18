/**
 * CPU-profile the deep-tree MOUNT path in real Chromium via CDP, with SUBTREE
 * attribution, for Pyreon / Solid / Vanilla side by side.
 *
 * `bench-scenarios.ts` reports the deep-tree mount as a single wall-clock
 * number per framework (Pyreon ~1.4x Solid at the time of writing). That says
 * there is a gap; it does not say WHERE. This is the instrument that says
 * where — the per-COMPONENT twin of `bench-createprofile.ts`'s per-ROW
 * attribution, and it exists because the krausest-style suite structurally
 * cannot see component-instantiation cost (every one of its ops runs on one
 * flat two-level list).
 *
 * Method notes that matter for trusting the output — the same ones
 * `bench-createprofile.ts` documents, for the same reasons:
 *
 *   - SUBTREE attribution: the profiling page (`?profileTree=1`) drives NAMED
 *     functions and this script sums hits only under frames with those names,
 *     so interleaved arms cannot pollute each other's numbers.
 *   - The arms are INTERLEAVED inside each iteration, so thermal ramp, JIT
 *     state and OS scheduling drift hit all three equally.
 *   - Each iteration MOUNTS then UNMOUNTS, and only the mount is attributed —
 *     otherwise the profile would measure a document that grows without bound.
 *   - GC is attributed SEPARATELY. V8's GC frames are not parented under the
 *     driver frame, so a subtree walk structurally cannot see them, and
 *     per-component allocation is exactly the kind of work that pays in GC
 *     rather than in the mutator.
 *   - The derived per-op mean is (samples x interval) / iterations, which is
 *     immune to `performance.now()`'s clamp. It is a SAMPLING estimate, so
 *     treat it as attribution, not as a timing result — `bench-scenarios.ts`
 *     is the timing authority.
 *
 * The build MUST preserve function names (the attribution keys on them), which
 * is the opposite of what `bench-createsplit.ts` requires.
 *
 *   BENCH_PROFILE=1 bun run build && bun bench-treeattrib.ts [iterations]
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ITER = Number(process.argv[2] ?? 120)
const INTERVAL_US = 10
const PORT = 4185
/** `profile-tree.tsx` uses depth 11 — 2^11-1 components, 2^10 leaves. */
const EXPECTED_LEAVES = 1024
const EXPECTED_COMPONENTS = 2047

const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

type Driver = { mount(): void; unmount(): void; leafCount(): number }
type TreeBench = { pyreon: Driver; solid: Driver; vanilla: Driver }

const browser = await chromium.launch({
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  const cdp = await page.context().newCDPSession(page)

  await page.goto(`http://localhost:${PORT}/?profileTree=1`)
  await page.waitForFunction(() => '__treeBench' in globalThis, undefined, { timeout: 30_000 })

  // Warmup AND state verification: an arm that silently renders nothing would
  // otherwise profile as blazingly fast, and an arm that fails to UNMOUNT would
  // make every later iteration measure a bigger document than the last.
  const warm = await page.evaluate(() => {
    const b = (globalThis as never as { __treeBench: TreeBench }).__treeBench
    const seen: Record<string, [number, number]> = {}
    for (const name of ['pyreon', 'solid', 'vanilla'] as const) {
      b[name].mount()
      const mounted = b[name].leafCount()
      b[name].unmount()
      seen[name] = [mounted, b[name].leafCount()]
    }
    for (let i = 0; i < 20; i++) {
      for (const name of ['pyreon', 'solid', 'vanilla'] as const) {
        b[name].mount()
        b[name].unmount()
      }
    }
    return seen
  })

  for (const [name, [mounted, cleared]] of Object.entries(warm)) {
    if (mounted !== EXPECTED_LEAVES) {
      throw new Error(`[treeprofile] ${name} mounted ${mounted} leaves, expected ${EXPECTED_LEAVES}`)
    }
    if (cleared !== 0) {
      throw new Error(`[treeprofile] ${name} left ${cleared} leaves after unmount`)
    }
  }
  console.log(
    `[treeprofile] all three arms verified at ${EXPECTED_LEAVES} leaves ` +
      `(${EXPECTED_COMPONENTS} components) · ${ITER} iterations`,
  )

  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: INTERVAL_US })
  await cdp.send('Profiler.start')

  await page.evaluate((iter) => {
    const b = (globalThis as never as { __treeBench: TreeBench }).__treeBench
    for (let i = 0; i < iter; i++) {
      b.pyreon.mount()
      b.pyreon.unmount()
      b.solid.mount()
      b.solid.unmount()
      b.vanilla.mount()
      b.vanilla.unmount()
    }
  }, ITER)

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

  const subtreeReport = (rootName: string, iterations: number, top = 20) => {
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
      `\n=== ${rootName} — ${total} samples · derived mean ${(meanUs / 1000).toFixed(2)}ms/mount ` +
        `(${((meanUs * 1000) / EXPECTED_COMPONENTS).toFixed(0)}ns/component) over ${iterations} iterations ===`,
    )
    for (const [key, hits] of [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)) {
      const pct = ((hits / Math.max(total, 1)) * 100).toFixed(1)
      const us = ((hits * INTERVAL_US) / iterations).toFixed(1)
      console.log(`${pct.padStart(5)}%  ${us.padStart(8)}µs  ${key}`)
    }
    return meanUs
  }

  // A subtree walk keys on `functionName`, so a MINIFIED build silently
  // attributes nothing and every cell reports a confident `0.0µs` — the
  // instrument reading as an impossibly fast result rather than as broken.
  // Refuse to report instead: an empty attribution is a failure, never a pass.
  const driverNames = ['__pyreonTreeMount', '__solidTreeMount', '__vanillaTreeMount']
  if (!nodes.some((n) => driverNames.includes(n.callFrame.functionName))) {
    throw new Error(
      `[treeprofile] not one driver frame appears in a ${grandTotal}-sample profile — ` +
        `the build is minified, so subtree attribution is keying on names that no longer exist. ` +
        `Rebuild with name preservation: BENCH_PROFILE=1 bun run build`,
    )
  }

  const r: Record<string, number> = {}
  for (const name of driverNames) r[name] = subtreeReport(name, ITER)

  let gcHits = 0
  for (const n of nodes) {
    const f = n.callFrame.functionName
    if (f === '(garbage collector)' || f === '(GC)') gcHits += n.hitCount ?? 0
  }

  const ms = (us: number) => `${(us / 1000).toFixed(2)}ms`
  console.log(`\n${'='.repeat(72)}`)
  console.log(`DEEP-TREE MOUNT ATTRIBUTION (sampling estimate, ${INTERVAL_US}µs)`)
  console.log('='.repeat(72))
  console.log(
    `  pyreon ${ms(r.__pyreonTreeMount!)} · solid ${ms(r.__solidTreeMount!)} · ` +
      `vanilla ${ms(r.__vanillaTreeMount!)}`,
  )
  console.log(
    `  gap to solid   : ${ms(r.__pyreonTreeMount! - r.__solidTreeMount!)} ` +
      `(${(((r.__pyreonTreeMount! - r.__solidTreeMount!) * 1000) / EXPECTED_COMPONENTS).toFixed(0)}ns/component)`,
  )
  console.log(
    `  gap to vanilla : ${ms(r.__pyreonTreeMount! - r.__vanillaTreeMount!)} ` +
      `(${(((r.__pyreonTreeMount! - r.__vanillaTreeMount!) * 1000) / EXPECTED_COMPONENTS).toFixed(0)}ns/component)`,
  )
  console.log(
    `  GC (global, unattributable to a subtree): ${gcHits} samples = ` +
      `${((gcHits / Math.max(grandTotal, 1)) * 100).toFixed(1)}% of profile`,
  )
} finally {
  await browser.close()
  preview.kill()
}
