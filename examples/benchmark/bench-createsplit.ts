/**
 * Split the create op's REAL timed region into JS vs forced-layout, on a
 * PRODUCTION (minified) build, for Pyreon and hand-written Vanilla DOM.
 *
 * Companion to `bench-createprofile.ts`, and the reason both exist: they answer
 * different halves of one question and need OPPOSITE builds.
 *
 *   - `bench-createprofile` attributes cost to named framework functions, which
 *     requires an UNMINIFIED build (`BENCH_PROFILE=1`) — so its absolute numbers
 *     are not production numbers.
 *   - this script measures the production shape but cannot name functions, so it
 *     splits the region by PHASE instead.
 *
 * Why the split matters: `runner.ts`'s `bench()` times
 *
 *     t0 = now(); await fn(); container.getBoundingClientRect(); t1 = now()
 *
 * — i.e. the mutation work AND a forced style+layout flush of the resulting
 * table. Attributing the whole op to framework JS would be wrong, because both
 * arms produce ~the same box tree and therefore pay ~the same layout. Only the
 * JS half is addressable by changing Pyreon, so the JS half is the real budget.
 *
 *   bun run build && bun bench-createsplit.ts [samples] [rows]
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const SAMPLES = Number(process.argv[2] ?? 60)
const ROWS = Number(process.argv[3] ?? 1000)
const PORT = 4183

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

  await page.goto(`http://localhost:${PORT}/?profileCreate=1`)
  await page.waitForFunction(() => '__createBench' in globalThis, undefined, { timeout: 30_000 })

  // ── Arm verification, in the order that makes a wrong arm impossible ──────
  // 1. This script's numbers are only production numbers if the build is
  //    MINIFIED. The inverse of `bench-createprofile`'s check: if a driver's
  //    function name survived, this is a BENCH_PROFILE build and every figure
  //    below would be a slow-build artifact reported as production.
  const isUnminified = await page.evaluate(async () => {
    const mods = performance.getEntriesByType('resource').map((e) => e.name)
    const url = mods.find((u) => u.includes('profile-create'))
    if (!url) return null
    const src = await (await fetch(url)).text()
    return src.includes('__pyreonCreate')
  })
  if (isUnminified === null) {
    throw new Error('[createsplit] could not locate the profile-create chunk to verify the build')
  }
  if (isUnminified) {
    throw new Error(
      '[createsplit] the loaded build is UNMINIFIED (driver names survived), so these would be ' +
        'BENCH_PROFILE numbers reported as production. Rebuild without it: bun run build',
    )
  }
  // 2. The clock must actually resolve the sub-millisecond JS half.
  const clock = await page.evaluate(() => {
    let smallest = Number.POSITIVE_INFINITY
    let prev = performance.now()
    const end = prev + 150
    while (performance.now() < end) {
      const t = performance.now()
      if (t > prev) {
        if (t - prev < smallest) smallest = t - prev
        prev = t
      }
    }
    return {
      isolated: (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
      quantumMs: Number.isFinite(smallest) ? smallest : Number.POSITIVE_INFINITY,
    }
  })
  if (!clock.isolated || clock.quantumMs > 0.02) {
    throw new Error(
      `[createsplit] clock too coarse: crossOriginIsolated=${clock.isolated}, ` +
        `quantum=${(clock.quantumMs * 1000).toFixed(1)}µs (need isolation + ≤20µs)`,
    )
  }
  console.log(
    `[createsplit] build=minified · crossOriginIsolated=${clock.isolated} · ` +
      `quantum ${(clock.quantumMs * 1000).toFixed(1)}µs · ${ROWS} rows · ${SAMPLES} samples`,
  )

  const out = await page.evaluate(
    async ({ samples, rows }) => {
      const b = (globalThis as never as { __createBench: CreateBench }).__createBench
      const gc = (globalThis as { gc?: () => void }).gc
      const tick = () => new Promise((r) => setTimeout(r, 0))

      // `mode` separates the two things the suite's "create 1,000 rows" op
      // actually measures. `bench()` runs it 20x with NO reset, so only the
      // FIRST run mounts into an empty list; the other 19 replace 1,000 live
      // keyed rows with 1,000 new ones. For a framework that keys its list that
      // is a different code path (teardown + re-mount, not mount) — and it is
      // why the suite's `create` and `replace` medians are nearly identical.
      // Vanilla pays the same `innerHTML = ''` + rebuild either way, so the
      // fresh-vs-replace difference isolates keyed teardown specifically.
      const runArm = async (arm: Driver, host: 'pyreon' | 'vanilla', mode: 'fresh' | 'replace') => {
        const js: number[] = []
        const layout: number[] = []
        // BOTH arms live in the same document, and the forced flush lays out the
        // whole document — so the idle arm's table must be empty or every
        // measurement includes laying out the other framework's rows. Leaving it
        // populated measured ~2x the rows and did so ASYMMETRICALLY across
        // passes (the first pass ran before the other arm had ever rendered),
        // which is a property of the harness, not of either framework.
        const clearBoth = () => {
          b.pyreon.clear!()
          b.vanilla.clear!()
        }
        // Warm both the mutation path and the layout path.
        for (let i = 0; i < 12; i++) {
          clearBoth()
          arm.create!(rows)
          document.body.getBoundingClientRect()
          clearBoth()
          document.body.getBoundingClientRect()
          await tick()
        }
        for (let i = 0; i < samples; i++) {
          clearBoth()
          if (mode === 'replace') {
            // Put the arm under test into the state the suite's op actually
            // finds: a live list of `rows` keyed rows about to be replaced.
            arm.create!(rows)
          }
          document.body.getBoundingClientRect()
          const idle = host === 'pyreon' ? b.vanilla : b.pyreon
          if ((idle.rowCount!() as number) !== 0) {
            throw new Error('idle arm not empty — layout would include the other framework')
          }
          if ((arm.rowCount!() as number) !== (mode === 'replace' ? rows : 0)) {
            throw new Error(`${host}: wrong pre-state for mode=${mode}`)
          }
          await tick()
          gc?.()
          const t0 = performance.now()
          arm.create!(rows)
          const t1 = performance.now()
          // Same flush `runner.ts:bench()` performs inside the timed region.
          document.body.getBoundingClientRect()
          const t2 = performance.now()
          if ((arm.rowCount!() as number) !== rows) throw new Error(`${host}: bad row count`)
          js.push(t1 - t0)
          layout.push(t2 - t1)
          await tick()
        }
        const med = (a: number[]) => {
          const s = [...a].sort((x, y) => x - y)
          const m = Math.floor(s.length / 2)
          return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
        }
        return { js: med(js), layout: med(layout), total: med(js) + med(layout) }
      }

      // Interleave the arms so thermal/JIT drift cannot systematically favour
      // one: alternate whole passes and take the median of each arm's pooled
      // samples rather than running one arm to completion then the other.
      const med = (a: number[]) => {
        const s = [...a].sort((x, y) => x - y)
        const m = Math.floor(s.length / 2)
        return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
      }
      const runs: Record<string, Array<{ js: number; layout: number }>> = {
        'pyreon/fresh': [],
        'vanilla/fresh': [],
        'pyreon/replace': [],
        'vanilla/replace': [],
      }
      for (let pass = 0; pass < 3; pass++) {
        for (const mode of ['fresh', 'replace'] as const) {
          runs[`pyreon/${mode}`]!.push(await runArm(b.pyreon, 'pyreon', mode))
          runs[`vanilla/${mode}`]!.push(await runArm(b.vanilla, 'vanilla', mode))
        }
      }
      const roll = (k: string) => ({
        js: med(runs[k]!.map((r) => r.js)),
        layout: med(runs[k]!.map((r) => r.layout)),
      })
      return {
        pyreon: roll('pyreon/fresh'),
        vanilla: roll('vanilla/fresh'),
        pyreonReplace: roll('pyreon/replace'),
        vanillaReplace: roll('vanilla/replace'),
      }
    },
    { samples: SAMPLES, rows: ROWS },
  )

  const f = (ms: number) => (ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`)
  const table = (
    label: string,
    p: { js: number; layout: number },
    v: { js: number; layout: number },
  ) => {
    console.log(`\n${'='.repeat(70)}`)
    console.log(`${label} — ${ROWS} rows, timed region split (production build)`)
    console.log('='.repeat(70))
    console.log(`             ${'JS'.padStart(10)}${'layout'.padStart(12)}${'total'.padStart(12)}`)
    for (const [n, x] of [
      ['Pyreon', p],
      ['Vanilla', v],
    ] as const) {
      console.log(
        `  ${n.padEnd(11)}${f(x.js).padStart(10)}${f(x.layout).padStart(12)}${f(x.js + x.layout).padStart(12)}`,
      )
    }
    const dJs = p.js - v.js
    const dLayout = p.layout - v.layout
    console.log(
      `  Δ          ${f(dJs).padStart(10)}${f(dLayout).padStart(12)}${f(dJs + dLayout).padStart(12)}`,
    )
    return { dJs, dLayout }
  }

  // FRESH is a true first mount into an empty list. REPLACE is what the suite's
  // "create" op measures on 19 of its 20 runs (no reset between runs).
  const fresh = table('FRESH create (mount into empty)', out.pyreon, out.vanilla)
  const repl = table(
    'REPLACE (1,000 live keyed rows -> 1,000 new)',
    out.pyreonReplace,
    out.vanillaReplace,
  )

  console.log(`\n${'='.repeat(70)}`)
  console.log('WHAT THIS SAYS')
  console.log('='.repeat(70))
  // Splitting the TOTAL gap into JS% / layout% is only meaningful when the
  // total is large compared with the layout term. Layout here is ~7ms whose
  // run-to-run noise is bigger than the whole JS gap, so when the two arms come
  // out level the ratio explodes into nonsense (a 8µs total gap once printed as
  // "3799% JS / -3699% layout"). Report the two deltas, and only offer the split
  // when it is defensible.
  const dFreshTotal = fresh.dJs + fresh.dLayout
  console.log(
    `  fresh   : JS ${f(fresh.dJs)} · layout ${f(fresh.dLayout)} · total ${f(dFreshTotal)}`,
  )
  if (Math.abs(dFreshTotal) > 2 * Math.abs(fresh.dLayout)) {
    console.log(
      `            -> ${((fresh.dJs / dFreshTotal) * 100) | 0}% of the gap is JS (addressable)`,
    )
  } else {
    console.log(
      `            -> total is within layout noise (|layout Δ| ${f(Math.abs(fresh.dLayout))} ` +
        `>= half the total): the arms are LEVEL on wall-clock; only the JS term is a real signal.`,
    )
  }
  // Vanilla rebuilds identically either way (`innerHTML=''` + rebuild), so its
  // fresh->replace delta is the harness's own noise floor; Pyreon's is keyed
  // teardown. Reporting both keeps the reader from crediting noise as teardown.
  //
  // DO NOT read this row as "teardown scales badly". Comparing THIS number at
  // one row count against a differently-derived one at another row count is
  // what produced a bogus "teardown is ~43x from 1k to 10k" reading; a proper
  // sweep (bench-teardown-curve.ts) measures a log-log exponent of 0.94-1.07,
  // i.e. LINEAR, with the clear residual flat at ~25-150 ns/row. It also
  // showed the split is inverted from the intuition: at 1,000 rows the replace
  // gap is ~79% MOUNT and ~21% teardown, so teardown is not the lever.
  const pTear = out.pyreonReplace.js - out.pyreon.js
  const vTear = out.vanillaReplace.js - out.vanilla.js
  console.log(
    `  keyed teardown (JS, replace - fresh): Pyreon ${f(pTear)} · Vanilla ${f(vTear)} (noise floor)`,
  )
  console.log(
    '  note: teardown is LINEAR (exponent 0.94-1.07, bench-teardown-curve.ts); ' +
      'the replace gap at 1k rows is ~79% mount / ~21% teardown.',
  )
  console.log(`  JS gap to Vanilla: fresh ${f(fresh.dJs)} -> replace ${f(repl.dJs)}`)
} finally {
  await browser.close()
  preview.kill()
}
