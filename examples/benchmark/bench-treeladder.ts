/**
 * Decompose the deep-tree MOUNT loss (Pyreon 4.00ms vs Solid 3.20ms, 1.25×,
 * 2026-09-07) in REAL Chromium via CDP, with per-arm SUBTREE attribution.
 *
 * The page (`?profileTree=1`, see src/impl/profile-tree.tsx) exposes an
 * ABLATION LADDER of nine arms behind named driver frames (`__mountTreeA` …
 * `__mountTreeV`). This script sums self-time ONLY under each mount frame, so
 * the UNMOUNT work interleaved between mounts cannot pollute the attribution
 * (the scenario board's reset is untimed for the same reason), and derives an
 * unquantized per-op mean from the sample count (samples × interval /
 * iterations) — immune to `performance.now()`'s clamp.
 *
 * Arms are interleaved round-robin, so machine drift lands on every arm
 * equally instead of aliasing into the arm-to-arm differences that ARE the
 * decomposition. Same discipline as bench-disposeprofile.ts.
 *
 * The build MUST preserve function names — a minified build attributes nothing
 * and this script refuses to report in that state.
 *
 *   BENCH_PROFILE=1 bun run build && bun bench-treeladder.ts [iterations]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ITER = Number(process.argv[2] ?? 60)
const INTERVAL_US = 20
const PORT = process.env.TP_PORT ?? '4187'

const ARMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'V'] as const
const ARM_LABEL: Record<string, string> = {
  A: 'A_idiomatic  compiled components, getter props, context leaf  ← the board',
  B: 'B_eagerProps = A with plain-value child props (no _rp / getter)',
  C: 'C_staticLeaf = A with a baked leaf (no useContext, no bind)',
  D: 'D_hElements  NO components — h() elements only',
  E: 'E_hComps     = D with a component per node (eager props, static leaf)',
  F: 'F_sigLeaf    = A but the leaf reads a plain signal (direct tier)',
  G: 'G_solid      SolidJS, compiler-faithful (template clone + insert)',
  H: 'H_getters    = E with hand-written getter child props (no _rp, no conversion)',
  V: 'V_vanilla    hand-written DOM (floor)',
}
const LEAVES = 1024

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
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('[page]', m.text())
  })
  const cdp = await page.context().newCDPSession(page)

  // Served-bundle guard: the preview must serve THIS worktree's dist.
  const served = new Set<string>()
  page.on('response', (r) => {
    const u = r.url()
    if (u.includes('/assets/') && u.endsWith('.js')) served.add(u.slice(u.lastIndexOf('/') + 1))
  })

  await page.goto(`http://localhost:${PORT}/?profileTree=1`)
  await page.waitForFunction(() => '__treeBench' in globalThis, undefined, { timeout: 30_000 })

  const onDisk = new Set(readdirSync(new URL('./dist/assets/', import.meta.url)).filter((f) => f.endsWith('.js')))
  for (const f of served) {
    if (!onDisk.has(f)) throw new Error(`[treeladder] served ${f} is not in this worktree's dist/assets — another preview owns port ${PORT}`)
  }
  const bundleHasNames = [...onDisk].some((f) => readFileSync(new URL(`./dist/assets/${f}`, import.meta.url), 'utf8').includes('__mountTreeA'))
  if (!bundleHasNames) throw new Error('[treeladder] dist has no `__mountTreeA` frame — rebuild with BENCH_PROFILE=1 bun run build')

  type Bench = {
    mount: (arm: string) => void
    unmount: (arm: string) => void
    leafCount: (arm: string) => number
    arms: string[]
  }

  // Correctness gate: every arm mounts exactly 1,024 leaves and tears them down.
  const gate = await page.evaluate((arms) => {
    const b = (globalThis as never as { __treeBench: Bench }).__treeBench
    const out: Record<string, [number, number]> = {}
    for (const a of arms) {
      b.mount(a)
      const mounted = b.leafCount(a)
      b.unmount(a)
      out[a] = [mounted, b.leafCount(a)]
    }
    return out
  }, ARMS as unknown as string[])
  for (const a of ARMS) {
    const [mounted, after] = gate[a] as [number, number]
    if (mounted !== LEAVES || after !== 0) throw new Error(`[gate] arm ${a}: mounted=${mounted} after=${after} (expected ${LEAVES}/0)`)
  }
  console.log(`[treeladder] gate OK — all ${ARMS.length} arms mount ${LEAVES} leaves and tear down`)

  await page.evaluate((arms) => {
    const b = (globalThis as never as { __treeBench: Bench }).__treeBench
    for (let i = 0; i < 15; i++) for (const a of arms) { b.mount(a); b.unmount(a) }
  }, ARMS as unknown as string[])

  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: INTERVAL_US })
  await cdp.send('Profiler.start')

  const wall = await page.evaluate(
    ({ iter, arms }) => {
      const b = (globalThis as never as { __treeBench: Bench }).__treeBench
      const totals: Record<string, number> = {}
      for (const a of arms) totals[a] = 0
      for (let i = 0; i < iter; i++) {
        for (const a of arms) {
          const t0 = performance.now()
          b.mount(a)
          totals[a] = (totals[a] as number) + (performance.now() - t0)
          b.unmount(a)
        }
      }
      return totals
    },
    { iter: ITER, arms: ARMS as unknown as string[] },
  )

  const { profile } = await cdp.send('Profiler.stop')

  type PNode = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number; children?: number[] }
  const nodes = profile.nodes as PNode[]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const driverNames = ARMS.map((a) => `__mountTree${a}`)
  if (!nodes.some((n) => driverNames.includes(n.callFrame.functionName))) {
    throw new Error('[treeladder] no driver frame in the profile — the build is minified; BENCH_PROFILE=1 bun run build')
  }

  const subtree = (rootName: string): { total: number; byFn: Map<string, number> } => {
    const inSubtree = new Set<number>()
    const stack: number[] = []
    for (const n of nodes) if (n.callFrame.functionName === rootName) stack.push(n.id)
    while (stack.length) {
      const id = stack.pop() as number
      if (inSubtree.has(id)) continue
      inSubtree.add(id)
      for (const c of byId.get(id)?.children ?? []) stack.push(c)
    }
    let total = 0
    const byFn = new Map<string, number>()
    for (const id of inSubtree) {
      const n = byId.get(id) as PNode
      const h = n.hitCount ?? 0
      if (!h) continue
      total += h
      const key = `${n.callFrame.functionName || '(anonymous)'} @${n.callFrame.url.slice(n.callFrame.url.lastIndexOf('/') + 1)}:${n.callFrame.lineNumber}`
      byFn.set(key, (byFn.get(key) ?? 0) + h)
    }
    return { total, byFn }
  }

  const totalHits = nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0)
  const gcHits = nodes.filter((n) => n.callFrame.functionName === '(garbage collector)').reduce((s, n) => s + (n.hitCount ?? 0), 0)
  const us = (hits: number) => (hits * INTERVAL_US) / ITER

  console.log(`\nABLATION LADDER — deep-tree MOUNT (2,047 nodes), ${ITER} iterations/arm, ${INTERVAL_US}µs sampling`)
  console.log(`(on-CPU = attributed samples under the arm's mount frame; wall = performance.now() around the same call)\n`)
  const onCpu: Record<string, number> = {}
  for (const a of ARMS) {
    const { total } = subtree(`__mountTree${a}`)
    onCpu[a] = us(total)
    console.log(`  ${ARM_LABEL[a]!.padEnd(78)} on-CPU ${onCpu[a].toFixed(0).padStart(6)}µs   wall ${((wall[a] as number) / ITER).toFixed(0).padStart(6)}µs`)
  }
  const d = (x: string, y: string) => `${((onCpu[x] as number) - (onCpu[y] as number)).toFixed(0)}µs`
  console.log(`\n  DIFFERENCES (on-CPU):`)
  console.log(`    A − G  Pyreon over Solid, the whole gap                = ${d('A', 'G')}`)
  console.log(`    A − B  getter-prop pipeline (_rp + makeReactiveProps)  = ${d('A', 'B')}`)
  console.log(`    A − C  useContext + accessor text bind                 = ${d('A', 'C')}`)
  console.log(`    A − F  context accessor bind vs direct-tier signal     = ${d('A', 'F')}`)
  console.log(`    E − D  component instantiation, h() path               = ${d('E', 'D')}`)
  console.log(`    H − E  getter CHAIN alone (hand getters, no _rp)         = ${d('H', 'E')}`)
  console.log(`    B − E  compiled template vs h(), eager props            = ${d('B', 'E')}`)
  console.log(`    D − V  h() element path over vanilla                   = ${d('D', 'V')}`)
  console.log(`    C − V  compiled static tree over vanilla               = ${d('C', 'V')}`)

  for (const a of ['A', 'H', 'G'] as const) {
    const { total, byFn } = subtree(`__mountTree${a}`)
    console.log(`\n  ${ARM_LABEL[a]} — top frames (${total} samples):`)
    for (const [fn, h] of [...byFn.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14)) {
      console.log(`    ${((h / Math.max(total, 1)) * 100).toFixed(1).padStart(5)}%  ${us(h).toFixed(0).padStart(5)}µs  ${fn}`)
    }
  }
  console.log(`\n(garbage collector): ${gcHits} samples = ${((gcHits / Math.max(totalHits, 1)) * 100).toFixed(1)}% of whole profile (${totalHits}) — NOT attributed to any arm`)
} finally {
  await browser.close()
  preview.kill()
}
