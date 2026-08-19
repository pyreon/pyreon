/**
 * Decompose the `dispose 500 rows` subscription-teardown loss (#2948: Pyreon
 * 172µs vs Solid 40µs) in REAL Chromium via CDP, with per-arm SUBTREE
 * attribution.
 *
 * The page (`?profileDispose=1`, see src/impl/profile-dispose.tsx) exposes an
 * ABLATION LADDER of seven arms behind named driver frames (`__disposeA` …
 * `__disposeG`). This script sums self-time ONLY under each driver frame, so
 * the MOUNT work interleaved between disposals cannot pollute the teardown
 * attribution, and derives an unquantized per-op mean from the sample count
 * (samples × interval / iterations) — immune to `performance.now()`'s clamp.
 *
 * Arms are interleaved round-robin, so machine drift lands on every arm
 * equally instead of aliasing into the arm-to-arm differences that ARE the
 * decomposition.
 *
 * The build MUST preserve function names — a minified build attributes nothing
 * and this script would report a confident `0.0µs` for every arm. It refuses
 * to report in that state (the same guard bench-clearprofile.ts carries,
 * which fired for real).
 *
 *   BENCH_PROFILE=1 bun run build && bun bench-disposeprofile.ts [iterations]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ITER = Number(process.argv[2] ?? 200)
const INTERVAL_US = 10
// Overridable so two worktrees can profile CONCURRENTLY. `--strictPort` makes a
// taken port exit THIS preview rather than drift; the served-bundle check below
// then refuses to report — both are needed (see bench-clearprofile.ts).
const PORT = process.env.DP_PORT ?? '4187'

const ARMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const
const ARM_LABEL: Record<string, string> = {
  A: 'A_full      component + effect() + reactive text bind  ← benched shape',
  B: 'B_noEffect  component +            reactive text bind',
  C: 'C_noBind    component + effect() + STATIC text',
  D: 'D_bare      component,  no effect, no bind',
  E: 'E_noComp    NO components — 500 plain <span> vnodes',
  F: 'F_scope     NO DOM — 500 effects in one EffectScope',
  G: 'G_solid     SolidJS equivalent (component + effect + insert)',
  H: 'H_directBind = arm B, but the `value` prop IS THE SIGNAL (not a wrapper)',
  I: 'I_directFull = arm A, but the `value` prop IS THE SIGNAL (not a wrapper)',
}

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

  // MEASUREMENT INTEGRITY — a parallel worktree holding this port would make our
  // `--strictPort` preview exit, and we would then profile THAT worktree's
  // bundle while reporting confidently. Compare served bytes against disk.
  {
    const dir = `${import.meta.dir}/dist/assets`
    const js = readdirSync(dir).filter((f) => f.endsWith('.js'))
    if (js.length === 0) throw new Error(`[disposeprofile] no built assets in ${dir} — build first`)
    const probe = js.sort(
      (a, b) => readFileSync(`${dir}/${b}`).length - readFileSync(`${dir}/${a}`).length,
    )[0] as string
    const onDisk = readFileSync(`${dir}/${probe}`, 'utf8')
    const served = await fetch(`http://localhost:${PORT}/assets/${probe}`)
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null)
    if (served === null) {
      throw new Error(
        `[disposeprofile] cannot fetch /assets/${probe} on :${PORT} — the preview did not bind ` +
          `(port already held?). Set DP_PORT to a free port.`,
      )
    }
    if (served !== onDisk) {
      throw new Error(
        `[disposeprofile] the server on :${PORT} serves a DIFFERENT bundle than ${probe} on disk ` +
          `— another worktree owns this port. Refusing to measure. Set DP_PORT.`,
      )
    }
    console.log(`[disposeprofile] served bundle == on-disk ${probe} on :${PORT}`)
  }

  await page.goto(`http://localhost:${PORT}/?profileDispose=1`)
  await page.waitForFunction(() => '__disposeBench' in globalThis, undefined, { timeout: 30_000 })

  type Bench = {
    mount: (arm: string) => void
    dispose: (arm: string) => void
    rowCount: (arm: string) => number
    tick: (v: number) => void
    arms: string[]
  }

  // ── Correctness gate: every arm must actually mount 500 rows and tear them
  // all down. An arm that silently mounts nothing would post a beautiful
  // teardown number for no work — the failure mode this whole suite guards.
  const gate = await page.evaluate((arms) => {
    const b = (globalThis as never as { __disposeBench: Bench }).__disposeBench
    const out: Record<string, [number, number]> = {}
    for (const a of arms) {
      b.mount(a)
      b.tick(1)
      const mounted = b.rowCount(a)
      b.dispose(a)
      const after = b.rowCount(a)
      out[a] = [mounted, after]
    }
    return out
  }, ARMS as unknown as string[])

  for (const a of ARMS) {
    const [mounted, after] = gate[a] as [number, number]
    // F has no DOM — its counter is cumulative effect runs, so "mounted" is
    // ≥500 and it never returns to 0. Every DOM arm must go 500 → 0.
    if (a === 'F') {
      if (mounted < 500) throw new Error(`[gate] arm F ran ${mounted} effects, expected >=500`)
    } else if (mounted !== 500 || after !== 0) {
      throw new Error(`[gate] arm ${a}: mounted=${mounted} afterDispose=${after} (expected 500/0)`)
    }
  }
  console.log(`[disposeprofile] gate OK — all ${ARMS.length} arms mount 500 and tear down`)

  // Warmup: JIT-stabilize every arm's mount AND dispose path.
  await page.evaluate((arms) => {
    const b = (globalThis as never as { __disposeBench: Bench }).__disposeBench
    for (let i = 0; i < 30; i++) {
      for (const a of arms) {
        b.mount(a)
        b.tick(i)
        b.dispose(a)
      }
    }
  }, ARMS as unknown as string[])

  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: INTERVAL_US })
  await cdp.send('Profiler.start')

  // Round-robin: drift lands on every arm equally instead of aliasing into the
  // arm-to-arm differences that ARE the decomposition.
  const wall = await page.evaluate(
    ({ iter, arms }) => {
      const b = (globalThis as never as { __disposeBench: Bench }).__disposeBench
      const totals: Record<string, number> = {}
      for (const a of arms) totals[a] = 0
      for (let i = 0; i < iter; i++) {
        for (const a of arms) {
          b.mount(a)
          b.tick(i)
          const t0 = performance.now()
          b.dispose(a)
          totals[a] = (totals[a] as number) + (performance.now() - t0)
        }
      }
      return totals
    },
    { iter: ITER, arms: ARMS as unknown as string[] },
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

  const driverNames = ARMS.map((a) => `__dispose${a}`)
  if (!nodes.some((n) => driverNames.includes(n.callFrame.functionName))) {
    throw new Error(
      `[disposeprofile] not one driver frame appears in a ` +
        `${nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0)}-sample profile — the build is ` +
        `minified, so subtree attribution keys on names that no longer exist. ` +
        `Rebuild with name preservation: BENCH_PROFILE=1 bun run build`,
    )
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
      const hits = n.hitCount ?? 0
      if (!hits) continue
      total += hits
      const url = n.callFrame.url.split('/').pop() ?? ''
      const key = `${n.callFrame.functionName || '(anonymous)'} @${url}:${n.callFrame.lineNumber}`
      byFn.set(key, (byFn.get(key) ?? 0) + hits)
    }
    return { total, byFn }
  }

  console.log(`\n${'='.repeat(78)}`)
  console.log(`ABLATION LADDER — dispose 500 rows, ${ITER} iterations/arm, ${INTERVAL_US}µs sampling`)
  console.log(`${'='.repeat(78)}`)
  console.log(
    `${'arm'.padEnd(12)} ${'on-CPU µs/op'.padStart(13)} ${'wall µs/op'.padStart(11)}   description`,
  )
  const cpu: Record<string, number> = {}
  for (const a of ARMS) {
    const { total } = subtree(`__dispose${a}`)
    const meanUs = (total * INTERVAL_US) / ITER
    cpu[a] = meanUs
    const wallUs = ((wall[a] as number) * 1000) / ITER
    console.log(
      `${a.padEnd(12)} ${meanUs.toFixed(1).padStart(13)} ${wallUs.toFixed(1).padStart(11)}   ${ARM_LABEL[a]}`,
    )
  }

  // ── The decomposition: adjacent-arm differences, and whether they SUM.
  const d = (x: number) => (x >= 0 ? `+${x.toFixed(1)}` : x.toFixed(1))
  console.log(`\n--- decomposition (on-CPU µs/op) ---`)
  console.log(`  per-row effect()          A - B = ${d((cpu.A as number) - (cpu.B as number))}`)
  console.log(`  per-row text bind         A - C = ${d((cpu.A as number) - (cpu.C as number))}`)
  console.log(`  both subscriptions        A - D = ${d((cpu.A as number) - (cpu.D as number))}`)
  console.log(`  component wrapper         D - E = ${d((cpu.D as number) - (cpu.E as number))}`)
  console.log(`  Pyreon DOM cleanup floor  E     = ${(cpu.E as number).toFixed(1)}`)
  console.log(`  pure reactivity (no DOM)  F     = ${(cpu.F as number).toFixed(1)}`)
  console.log(`  Solid, same shape         G     = ${(cpu.G as number).toFixed(1)}`)
  const modelled =
    (cpu.A as number) - (cpu.B as number) + ((cpu.A as number) - (cpu.C as number)) + (cpu.E as number) +
    ((cpu.D as number) - (cpu.E as number))
  console.log(
    `\n  MODEL CHECK: effect + bind + wrapper + DOM = ${modelled.toFixed(1)} vs measured A = ${(cpu.A as number).toFixed(1)}` +
      `  (residual ${d((cpu.A as number) - modelled)})`,
  )
  console.log(
    `  A residual over Solid: ${((cpu.A as number) - (cpu.G as number)).toFixed(1)}µs on-CPU`,
  )

  // ── Per-arm self-time, for the arms that carry the loss.
  for (const a of ['A', 'G'] as const) {
    const { total, byFn } = subtree(`__dispose${a}`)
    console.log(`\n=== arm ${a} — ${total} samples, top 18 self-time ===`)
    for (const [key, hits] of [...byFn.entries()].sort((x, y) => y[1] - x[1]).slice(0, 18)) {
      const pct = ((hits / Math.max(total, 1)) * 100).toFixed(1)
      const us = ((hits * INTERVAL_US) / ITER).toFixed(2)
      console.log(`${pct.padStart(5)}%  ${us.padStart(7)}µs/op  ${key}`)
    }
  }

  const gcHits = nodes
    .filter((n) => n.callFrame.functionName === '(garbage collector)')
    .reduce((s, n) => s + (n.hitCount ?? 0), 0)
  const totalHits = nodes.reduce((s, n) => s + (n.hitCount ?? 0), 0)
  console.log(
    `\n(garbage collector): ${gcHits} samples = ${((gcHits / Math.max(totalHits, 1)) * 100).toFixed(1)}% of whole profile (${totalHits}) — NOT attributed per-arm`,
  )
} finally {
  await browser.close()
  preview.kill()
}
