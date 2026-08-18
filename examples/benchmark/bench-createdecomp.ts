/**
 * DECOMPOSE the create op's Pyreon-vs-Vanilla gap into named components, on a
 * PRODUCTION (minified) build.
 *
 * `bench-createsplit.ts` splits the timed region into JS vs forced-layout — it
 * says how much of the gap is addressable framework JS. This says WHICH
 * framework work that JS is, by running a ladder whose rungs differ by exactly
 * one cost (see `src/impl/profile-decomp.tsx` for the rung definitions):
 *
 *   V  → L1 (+ For/reconciler + `_tpl` clone)
 *      → L2 (+ per-row `_bindText` label binding)
 *      → L3 (+ selector subscribe + cleanup wrapper) === impl/pyreon.tsx
 *
 * and which also splits each rung into build (row construction) vs commit (DOM
 * production) vs create (both — what the fair bench actually times).
 *
 * The decomposition is CHECKED, not asserted: `build + commit` is compared
 * against the independently-measured `create`, and the rung deltas are summed
 * and compared against the end-to-end V→L3 gap. A model that does not add up is
 * reported as not adding up.
 *
 *   bun run build && bun bench-createdecomp.ts [samples] [rows]
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const SAMPLES = Number(process.argv[2] ?? 40)
const ROWS = Number(process.argv[3] ?? 10_000)
const PORT = 4187

console.log(`[decomp] load BEFORE: ${(await Bun.$`uptime`.text()).trim()}`)

const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

type Driver = Record<string, (n?: number) => unknown>
type DecompBench = { vanilla: Driver; l1: Driver; l2: Driver; l3: Driver }

const browser = await chromium.launch({
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))

  await page.goto(`http://localhost:${PORT}/?profileDecomp=1`)
  await page.waitForFunction(() => '__decompBench' in globalThis, undefined, { timeout: 30_000 })

  // ── Arm verification, before any number is believed ──────────────────────
  // 1. Production shape: if a driver name survived, this is a BENCH_PROFILE
  //    (unminified) build and every figure below would be a slow-build artifact
  //    reported as production. Same check bench-createsplit.ts makes.
  const isUnminified = await page.evaluate(async () => {
    const mods = performance.getEntriesByType('resource').map((e) => e.name)
    const url = mods.find((u) => u.includes('profile-decomp'))
    if (!url) return null
    const src = await (await fetch(url)).text()
    return src.includes('__l3Create')
  })
  if (isUnminified === null) throw new Error('[decomp] could not locate the profile-decomp chunk')
  if (isUnminified)
    throw new Error('[decomp] build is UNMINIFIED — rebuild without BENCH_PROFILE: bun run build')

  // 2. The clock must resolve the sub-millisecond phases (build at 1k rows).
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
  if (!clock.isolated || clock.quantumMs > 0.02)
    throw new Error(
      `[decomp] clock too coarse: isolated=${clock.isolated}, ` +
        `quantum=${(clock.quantumMs * 1000).toFixed(1)}µs (need isolation + <=20us)`,
    )

  // 3. The rungs must actually BE the rungs. A ladder whose arms do not differ
  //    the way the comments claim would produce a beautifully self-consistent
  //    and entirely wrong decomposition, so assert the observable shape:
  //    only L3 carries a class attribute (the selector binding), and only
  //    L2/L3 re-render their label from a signal write.
  const shape = await page.evaluate(() => {
    const b = (globalThis as never as { __decompBench: DecompBench }).__decompBench
    for (const k of ['vanilla', 'l1', 'l2', 'l3'] as const) b[k].create!(3)
    const firstRow = (host: number) =>
      document.querySelectorAll('.bench-fixture')[host]?.querySelector('tr')
    const res = {
      vanillaHasClassAttr: firstRow(0)?.hasAttribute('class') ?? null,
      l1HasClassAttr: firstRow(1)?.hasAttribute('class') ?? null,
      l2HasClassAttr: firstRow(2)?.hasAttribute('class') ?? null,
      l3HasClassAttr: firstRow(3)?.hasAttribute('class') ?? null,
      counts: (['vanilla', 'l1', 'l2', 'l3'] as const).map((k) => b[k].rowCount!() as number),
    }
    for (const k of ['vanilla', 'l1', 'l2', 'l3'] as const) b[k].clear!()
    return res
  })
  if (shape.counts.some((c) => c !== 3))
    throw new Error(`[decomp] arm row counts wrong: ${JSON.stringify(shape.counts)}`)
  if (shape.l3HasClassAttr !== true)
    throw new Error('[decomp] L3 has no class attribute — the selector rung is not wired')
  if (shape.l1HasClassAttr !== false || shape.l2HasClassAttr !== false)
    throw new Error('[decomp] L1/L2 carry a class attribute — rungs are not isolated')

  console.log(
    `[decomp] build=minified · isolated=${clock.isolated} · ` +
      `quantum ${(clock.quantumMs * 1000).toFixed(1)}µs · rungs verified · ` +
      `${ROWS} rows · ${SAMPLES} samples`,
  )

  const out = await page.evaluate(
    async ({ samples, rows }) => {
      const b = (globalThis as never as { __decompBench: DecompBench }).__decompBench
      const gc = (globalThis as { gc?: () => void }).gc
      const tick = () => new Promise((r) => setTimeout(r, 0))
      const ARMS = ['vanilla', 'l1', 'l2', 'l3'] as const
      type Arm = (typeof ARMS)[number]

      const clearAll = () => {
        for (const k of ARMS) b[k].clear!()
      }

      const med = (a: number[]) => {
        const s = [...a].sort((x, y) => x - y)
        const m = Math.floor(s.length / 2)
        return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
      }

      /**
       * One phase of one arm, in one mode.
       *
       * `mode` matters because the fair bench's `create N rows` op runs 20x with
       * NO reset and mints fresh ids each run — so only run 1 is a true FRESH
       * mount and the other 19 REPLACE a live keyed list (teardown + mount).
       * The published median is therefore a replace. Measuring only `fresh`
       * would decompose a number the board does not report.
       *
       * Every OTHER arm is cleared first because the forced layout flush lays
       * out the WHOLE document — leaving an idle arm populated would charge
       * this arm for the other's rows.
       */
      const runPhase = async (
        arm: Arm,
        phase: 'build' | 'commit' | 'create',
        mode: 'fresh' | 'replace',
      ) => {
        const d = b[arm]
        const js: number[] = []
        const layout: number[] = []
        // Establish the pre-state the timed call will find, and (for commit)
        // build the buffer it will commit — both OUTSIDE the timed region.
        const setup = () => {
          clearAll()
          // `replace` puts the arm under test into the state the suite's op
          // actually finds: a live list about to be replaced wholesale.
          if (mode === 'replace' && phase !== 'build') d.create!(rows)
          if (phase === 'commit') d.build!(rows)
        }
        // Warm exactly the path that will be timed, plus the layout flush.
        for (let i = 0; i < 8; i++) {
          setup()
          if (phase === 'build') d.build!(rows)
          else if (phase === 'commit') d.commit!()
          else d.create!(rows)
          document.body.getBoundingClientRect()
          clearAll()
          await tick()
        }
        for (let i = 0; i < samples; i++) {
          setup()
          document.body.getBoundingClientRect()
          for (const k of ARMS) {
            const want = k === arm && mode === 'replace' && phase !== 'build' ? rows : 0
            if ((b[k].rowCount!() as number) !== want)
              throw new Error(`bad pre-state for ${arm}/${phase}/${mode}: ${k} != ${want}`)
          }
          await tick()
          gc?.()
          const t0 = performance.now()
          if (phase === 'build') d.build!(rows)
          else if (phase === 'commit') d.commit!()
          else d.create!(rows)
          const t1 = performance.now()
          document.body.getBoundingClientRect()
          const t2 = performance.now()
          const got = b[arm].rowCount!() as number
          // `build` only fills a JS buffer — it must leave the DOM untouched.
          const want = phase === 'build' ? 0 : rows
          if (got !== want) throw new Error(`${arm}/${phase}/${mode}: rows ${got} != ${want}`)
          js.push(t1 - t0)
          layout.push(t2 - t1)
          await tick()
        }
        return { js, layout }
      }

      // Interleave whole passes across arms, phases AND modes so thermal/JIT
      // drift cannot systematically favour one rung. Samples are POOLED across
      // passes rather than reduced to a per-pass median, so the reported CI is
      // computed over every sample actually taken.
      const runs: Record<string, { js: number[]; layout: number[] }> = {}
      for (let pass = 0; pass < 3; pass++) {
        for (const mode of ['fresh', 'replace'] as const) {
          for (const phase of ['build', 'commit', 'create'] as const) {
            // `build` fills a JS buffer and never touches the DOM, so it has no
            // fresh-vs-replace distinction — measuring it twice would only add
            // runtime and invite two slightly different numbers for one thing.
            if (phase === 'build' && mode === 'replace') continue
            for (const arm of ARMS) {
              const key = `${arm}/${phase}/${mode}`
              const r = await runPhase(arm, phase, mode)
              const slot = (runs[key] ??= { js: [], layout: [] })
              slot.js.push(...r.js)
              slot.layout.push(...r.layout)
            }
          }
        }
      }
      const roll = (k: string) => ({
        js: med(runs[k]!.js),
        layout: med(runs[k]!.layout),
      })
      // ── build-variant isolation ──────────────────────────────────────────
      // Prices `signal()` cleanly by holding the row-building HELPER constant:
      // vanillaLoop builds plain `{id,label}` rows through the same
      // preallocated-loop helper the reactive arms use, so
      //   signal()          = l3Build      - vanillaLoop
      //   helper difference = vanillaBuild - vanillaLoop
      const buildVariant = async (fn: () => void) => {
        const xs: number[] = []
        for (let i = 0; i < 8; i++) fn()
        for (let i = 0; i < samples; i++) {
          clearAll()
          await tick()
          gc?.()
          const t0 = performance.now()
          fn()
          xs.push(performance.now() - t0)
          await tick()
        }
        return xs
      }
      const bvRuns: Record<string, number[]> = {
        vanillaArrayFrom: [],
        vanillaLoop: [],
        l3Signal: [],
      }
      for (let pass = 0; pass < 3; pass++) {
        bvRuns.vanillaArrayFrom!.push(...(await buildVariant(() => b.vanilla.build!(rows))))
        bvRuns.vanillaLoop!.push(...(await buildVariant(() => b.vanilla.buildLoop!(rows))))
        bvRuns.l3Signal!.push(...(await buildVariant(() => b.l3.build!(rows))))
      }

      // 95% bootstrap CI on a DIFFERENCE OF MEDIANS. A rung whose interval
      // spans zero has not been shown to cost anything and must not be
      // reported as a cost — this is the guard against reading noise as a
      // component of the decomposition.
      const bootDiffCI = (a: number[], bb: number[], iters = 2000): [number, number] => {
        const diffs = new Array<number>(iters)
        for (let i = 0; i < iters; i++) {
          const ra = new Array<number>(a.length)
          for (let j = 0; j < a.length; j++) ra[j] = a[(Math.random() * a.length) | 0]!
          const rb = new Array<number>(bb.length)
          for (let j = 0; j < bb.length; j++) rb[j] = bb[(Math.random() * bb.length) | 0]!
          diffs[i] = med(rb) - med(ra)
        }
        diffs.sort((x, y) => x - y)
        return [diffs[Math.floor(iters * 0.025)]!, diffs[Math.floor(iters * 0.975)]!]
      }

      const result: Record<string, { js: number; layout: number }> = {}
      for (const k of Object.keys(runs)) result[k] = roll(k)
      for (const k of Object.keys(bvRuns)) result[`bv/${k}`] = { js: med(bvRuns[k]!), layout: 0 }

      // CIs for every comparison the report makes.
      const cis: Record<string, [number, number]> = {}
      for (const mode of ['fresh', 'replace'] as const) {
        const rungPairs: Array<[Arm, Arm]> = [
          ['vanilla', 'l1'],
          ['l1', 'l2'],
          ['l2', 'l3'],
          ['vanilla', 'l3'],
        ]
        for (const [lo, hi] of rungPairs) {
          cis[`${lo}->${hi}/commit/${mode}`] = bootDiffCI(
            runs[`${lo}/commit/${mode}`]!.js,
            runs[`${hi}/commit/${mode}`]!.js,
          )
          cis[`${lo}->${hi}/create/${mode}`] = bootDiffCI(
            runs[`${lo}/create/${mode}`]!.js,
            runs[`${hi}/create/${mode}`]!.js,
          )
        }
        cis[`layout/${mode}`] = bootDiffCI(
          runs[`vanilla/create/${mode}`]!.layout,
          runs[`l3/create/${mode}`]!.layout,
        )
      }
      cis['signal'] = bootDiffCI(bvRuns.vanillaLoop!, bvRuns.l3Signal!)
      cis['helper'] = bootDiffCI(bvRuns.vanillaLoop!, bvRuns.vanillaArrayFrom!)

      return { medians: result, cis, n: runs['l3/create/fresh']!.js.length }
    },
    { samples: SAMPLES, rows: ROWS },
  )

  const f = (ms: number) => `${ms.toFixed(2)}ms`
  const perRow = (ms: number) => `${((ms * 1e6) / ROWS).toFixed(0)}ns`
  const g = (k: string) => out.medians[k] as { js: number; layout: number }
  const ci = (k: string) => out.cis[k] as [number, number]
  /** A delta whose 95% CI spans zero is NOT a demonstrated cost. */
  const withCI = (d: number, k: string) => {
    const [lo, hi] = ci(k)
    const spansZero = lo <= 0 && hi >= 0
    return (
      `${d >= 0 ? '+' : ''}${f(d)} (${perRow(d)}/row) ` +
      `[95% CI ${f(lo)}..${f(hi)}]${spansZero ? '  <- SPANS ZERO, not demonstrated' : ''}`
    )
  }
  const ARMS = ['vanilla', 'l1', 'l2', 'l3'] as const
  console.log(`\npooled samples per cell: n=${out.n}`)

  for (const mode of ['fresh', 'replace'] as const) {
    console.log(
      `\n${'='.repeat(72)}\nMODE = ${mode.toUpperCase()}  (${ROWS} rows, median of 3 passes x ${SAMPLES} samples)`,
    )
    if (mode === 'replace')
      console.log("this is the mode the board's `create N rows` median actually reports")
    console.log(`${'='.repeat(72)}`)

    console.log('\narm      phase    JS         layout     JS/row')
    for (const arm of ARMS) {
      for (const phase of ['build', 'commit', 'create']) {
        const key = phase === 'build' ? `${arm}/build/fresh` : `${arm}/${phase}/${mode}`
        const r = g(key)
        console.log(
          `${arm.padEnd(8)} ${phase.padEnd(8)} ${f(r.js).padEnd(10)} ${f(r.layout).padEnd(10)} ${perRow(r.js)}`,
        )
      }
    }

    console.log(`\n-- model check: does build + commit == create? --`)
    for (const arm of ARMS) {
      const bJs = g(`${arm}/build/fresh`).js
      const cJs = g(`${arm}/commit/${mode}`).js
      const crJs = g(`${arm}/create/${mode}`).js
      const sum = bJs + cJs
      const err = ((sum - crJs) / crJs) * 100
      console.log(
        `${arm.padEnd(8)} build ${f(bJs)} + commit ${f(cJs)} = ${f(sum)} vs create ${f(crJs)}  (${err >= 0 ? '+' : ''}${err.toFixed(1)}%)`,
      )
    }

    console.log(`\n-- LADDER: what each rung adds (commit JS) --`)
    const rungs: Array<[string, string, string]> = [
      ['vanilla', 'l1', 'For reconciler + _tpl clone vs createElement'],
      ['l1', 'l2', 'per-row _bindText label binding + disposer'],
      ['l2', 'l3', 'selector subscribe + _setClass + cleanup wrapper'],
    ]
    for (const [lo, hi, what] of rungs) {
      const d = g(`${hi}/commit/${mode}`).js - g(`${lo}/commit/${mode}`).js
      console.log(`${lo} -> ${hi}  ${withCI(d, `${lo}->${hi}/commit/${mode}`)}`)
      console.log(`             ${what}`)
    }
    const buildDelta = g('bv/l3Signal').js - g('bv/vanillaLoop').js
    console.log(`build       ${withCI(buildDelta, 'signal')}`)
    console.log(`             per-row signal() allocation (helper held constant)`)

    const totalCreateGap = g(`l3/create/${mode}`).js - g(`vanilla/create/${mode}`).js
    const commitGap = g(`l3/commit/${mode}`).js - g(`vanilla/commit/${mode}`).js
    const explained = commitGap + buildDelta
    console.log(`\n-- totals --`)
    console.log(`create JS gap (L3 - vanilla): ${withCI(totalCreateGap, `vanilla->l3/create/${mode}`)}`)
    console.log(`  of which commit: ${f(commitGap)} (${perRow(commitGap)}/row)`)
    console.log(`  of which build:  ${f(buildDelta)} (${perRow(buildDelta)}/row)`)
    console.log(
      `  sum ${f(explained)} vs measured ${f(totalCreateGap)} ` +
        `(${(((explained - totalCreateGap) / totalCreateGap) * 100).toFixed(1)}% off)`,
    )
    const layoutDelta = g(`l3/create/${mode}`).layout - g(`vanilla/create/${mode}`).layout
    console.log(
      `layout (NOT addressable): vanilla ${f(g(`vanilla/create/${mode}`).layout)} · L3 ${f(g(`l3/create/${mode}`).layout)}`,
    )
    console.log(`  layout delta: ${withCI(layoutDelta, `layout/${mode}`)}`)
    console.log(
      `TOTAL op (JS+layout): vanilla ${f(g(`vanilla/create/${mode}`).js + g(`vanilla/create/${mode}`).layout)} · ` +
        `L3 ${f(g(`l3/create/${mode}`).js + g(`l3/create/${mode}`).layout)}`,
    )
  }
  console.log(`\n${'='.repeat(72)}\nBUILD-PHASE ISOLATION (row construction only, ${ROWS} rows)\n${'='.repeat(72)}`)
  const bvAf = g('bv/vanillaArrayFrom').js
  const bvLoop = g('bv/vanillaLoop').js
  const bvSig = g('bv/l3Signal').js
  console.log(`vanilla rows via Array.from (what impl/vanilla.ts uses): ${f(bvAf)}  ${perRow(bvAf)}/row`)
  console.log(`vanilla rows via preallocated loop:                     ${f(bvLoop)}  ${perRow(bvLoop)}/row`)
  console.log(`reactive rows ({id, label: signal(s)}) via same loop:   ${f(bvSig)}  ${perRow(bvSig)}/row`)
  console.log(`\n  per-row signal() cost  = ${withCI(bvSig - bvLoop, 'signal')}`)
  console.log(`    ^ the ONLY clean signal-alloc number (row-building helper held constant)`)
  console.log(`  helper difference      = ${withCI(bvAf - bvLoop, 'helper')}`)
  console.log(`    ^ Array.from vs preallocated loop; on the board this FAVOURS Pyreon`)

  console.log(`\n[decomp] load AFTER: ${(await Bun.$`uptime`.text()).trim()}`)
} finally {
  await browser.close()
  preview.kill()
}
