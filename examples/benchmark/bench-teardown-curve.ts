/**
 * Does keyed-list TEARDOWN scale linearly in row count?
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The estimator in use for "keyed teardown" is INDIRECT: `replace.js -
 * fresh.js`, i.e. the difference of two whole-op medians. That is a legitimate
 * estimator, but it is a difference of two large numbers and it bundles four
 * things that are not teardown:
 *
 *   - `collectNewKeys` — an n-element array + n `getKey` calls
 *   - `hasAnyKeptKey`  — up to n `cache.has` probes
 *   - the browser's removal of n live `<tr>` (which Vanilla also pays)
 *   - re-mount into a NON-empty parent vs an empty one
 *
 * So it cannot answer "is teardown superlinear?" — a growing `replace - fresh`
 * delta is equally consistent with DOM-removal cost growing, which is not
 * addressable by changing Pyreon.
 *
 * This harness measures the CLEAR op directly (`rows.set([])`), which is pure
 * teardown with no re-mount, at six row counts, against a hand-written Vanilla
 * arm that removes the same n rows from the same document. Vanilla is the
 * control for everything the browser charges for node removal; the residual is
 * Pyreon's own reconciler + reactive disposal.
 *
 * The Vanilla arm is defined HERE rather than in a fixture module, so the thing
 * being controlled for is readable at the point of comparison — and so this
 * script depends on nothing but the `?profileClear=1` driver already in tree.
 *
 * ─── OBJECTIVITY CONTRACT ────────────────────────────────────────────────────
 * 1. Production (minified) build — asserted in-page, not assumed.
 * 2. Arms interleaved per pass with the order REVERSED on alternate passes.
 * 3. Only the arm under test holds rows while it is timed; the idle arm is
 *    asserted empty, so neither is charged for the other's nodes.
 * 4. The timed region is mutation ONLY. The forced layout flush is measured
 *    separately: it is ~identical across arms and would swamp the signal.
 * 5. Median + 95% bootstrap CI per (arm, n). Overlapping CIs = a tie.
 * 6. `gc()` between samples, OUTSIDE the timed region (forcing GC inside
 *    jettisons compiled code and measures re-tier, not the op).
 *
 * HONEST LIMIT — and it is not small. The residual attributes to Pyreon
 * everything Vanilla does not do, and the two arms do NOT perform the same DOM
 * work: Pyreon calls `tbody.replaceChildren(marker, marker)`, removing n+2
 * children, while Vanilla (mirroring `impl/vanilla.ts`) calls
 * `host.innerHTML = ''` on a host holding exactly ONE child — the `<table>` —
 * orphaning the n rows as a subtree. Different per-child bookkeeping, so the
 * gap is a function of n and is NOT constant-folded out of a scaling fit.
 * `--dom-control` measures exactly that pair on bare DOM, so the confound can
 * be SUBTRACTED rather than disclaimed in prose. Report the corrected series
 * whenever the confound is a material share of the residual.
 *
 *   bun run build && bun bench-teardown-curve.ts [--samples N] [--passes N]
 *                                                  [--desc] [--drift]
 *                                                  [--rows a,b,c] [--dom-control]
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const argv = process.argv.slice(2)
const num = (flag: string, dflt: number) => {
  const i = argv.indexOf(flag)
  return i !== -1 ? Number(argv[i + 1]) : dflt
}
const SAMPLES = num('--samples', 25)
const PASSES = num('--passes', 3)
const DOM_CONTROL = argv.includes('--dom-control')
const DRIFT = argv.includes('--drift')
// `--desc` reverses the row-count sweep. The two orders TOGETHER separate a
// genuine n-effect from session accumulation: the bench mints row ids from a
// monotonic counter that is never reset, so whichever n runs LAST has also seen
// the most keys. If per-row cost tracks n it is scaling; if it tracks position
// in the run it is accumulation, which is a leak, not a complexity class.
const rowsIdx = argv.indexOf('--rows')
const DEFAULT_ROWS = [100, 500, 1000, 2000, 5000, 10_000]
const ROW_COUNTS =
  rowsIdx !== -1
    ? argv[rowsIdx + 1]!.split(',').map(Number)
    : argv.includes('--desc')
      ? [...DEFAULT_ROWS].reverse()
      : DEFAULT_ROWS
const PORT = 4187

const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

type Driver = Record<string, (n?: number) => unknown>

const browser = await chromium.launch({
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
})
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.goto(`http://localhost:${PORT}/?profileClear=1`)
  await page.waitForFunction(() => '__clearBench' in globalThis, undefined, { timeout: 30_000 })

  // ── Arm verification ───────────────────────────────────────────────────────
  // (a) The build must be MINIFIED, or every figure is a slow-build artifact.
  // (b) The module the PAGE loaded must be the one on DISK, or we are measuring
  //     another worktree's build served from a drifted port / stale preview.
  const armInfo = await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name)
    const url = urls.find((u) => u.includes('profile-clear')) ?? urls.find((u) => /assets\/.*\.js$/.test(u))
    if (!url) return null
    const src = await (await fetch(url)).text()
    return {
      url,
      unminified: src.includes('__clearOnly') || src.includes('function __createOnly'),
      sha: [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src)))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16),
      bytes: src.length,
    }
  })
  if (!armInfo) throw new Error('could not locate the page module — cannot verify the arm')
  if (armInfo.unminified) {
    throw new Error('UNMINIFIED build (BENCH_PROFILE=1?) — rebuild with `bun run build`')
  }
  // On-disk hash of the same asset, so a drifted preview server is impossible.
  const assetName = decodeURIComponent(new URL(armInfo.url).pathname.split('/').pop()!)
  const distAssets = join(import.meta.dir, 'dist', 'assets')
  const onDisk = readdirSync(distAssets).find((f) => f === assetName)
  if (!onDisk) throw new Error(`page loaded ${assetName}, which is NOT in ${distAssets}`)
  const diskSha = createHash('sha256').update(readFileSync(join(distAssets, onDisk))).digest('hex').slice(0, 16)
  if (diskSha !== armInfo.sha) {
    throw new Error(`module hash mismatch: page=${armInfo.sha} disk=${diskSha} — serving a stale build`)
  }

  const clock = await page.evaluate(() => {
    let q = Infinity
    for (let i = 0; i < 40_000; i++) {
      const a = performance.now()
      const b = performance.now()
      if (b > a) q = Math.min(q, b - a)
    }
    return { isolated: crossOriginIsolated, quantumMs: q }
  })
  console.log(
    `[teardown-curve] build=minified · module=${armInfo.sha} (disk-matched) · ` +
      `crossOriginIsolated=${clock.isolated} · quantum ${(clock.quantumMs * 1000).toFixed(1)}µs · ` +
      `${SAMPLES} samples x ${PASSES} passes`,
  )
  if (!clock.isolated) console.log('[teardown-curve] WARNING: not cross-origin isolated — coarse clock')

  const out = await page.evaluate(
    async ({ samples, passes, rowCounts }) => {
      /**
       * Hand-written Vanilla control, mirroring `impl/vanilla.ts:renderAll` (whose
       * `clear` is `renderAll([])`, i.e. `innerHTML = ''` + an empty table). It is
       * the control for everything the BROWSER charges to remove n nodes; only the
       * residual over it is attributable to Pyreon. `bench-fixture` gives it the
       * same deterministic `table-layout: fixed` the profiling host now uses.
       */
      const makeVanilla = (): Driver => {
        const host = document.createElement('div')
        host.className = 'bench-fixture'
        host.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;visibility:hidden'
        document.body.appendChild(host)
        const renderAll = (n: number) => {
          host.innerHTML = ''
          const table = document.createElement('table')
          const tbody = document.createElement('tbody')
          for (let i = 0; i < n; i++) {
            const tr = document.createElement('tr')
            const td1 = document.createElement('td')
            const td2 = document.createElement('td')
            td1.textContent = String(i)
            td2.textContent = 'lorem ipsum dolor'
            tr.appendChild(td1)
            tr.appendChild(td2)
            tbody.appendChild(tr)
          }
          table.appendChild(tbody)
          host.appendChild(table)
        }
        return {
          create: (n) => renderAll(n as number),
          clear: () => renderAll(0),
          rowCount: () => host.querySelectorAll('tr').length,
        }
      }
      const b = { pyreon: (globalThis as never as { __clearBench: Driver }).__clearBench, vanilla: makeVanilla() }
      const gc = (globalThis as { gc?: () => void }).gc
      const tick = () => new Promise((r) => setTimeout(r, 0))

      /**
       * One (arm, mode, n) cell.
       *
       *   clear   — `rows.set([])` on a live list of n. Pure teardown.
       *   fresh   — create n into an EMPTY list. No teardown.
       *   replace — create n over a live list of n. Teardown + re-mount.
       *
       * `replace - fresh` per arm is the create-path split harness's teardown
       * estimator; carrying it across n is what makes its scaling checkable. The Vanilla arm
       * pays the same estimator, so the ARM DIFFERENCE of the two deltas is the
       * part attributable to Pyreon.
       */
      const runCell = async (
        arm: Driver,
        host: 'pyreon' | 'vanilla',
        mode: 'clear' | 'fresh' | 'replace',
        n: number,
      ) => {
        const js: number[] = []
        const layout: number[] = []
        const idle = host === 'pyreon' ? b.vanilla : b.pyreon
        const preState = mode === 'fresh' ? 0 : n
        const postState = mode === 'clear' ? 0 : n
        const op = () => (mode === 'clear' ? arm.clear!() : arm.create!(n))
        for (let i = 0; i < 6; i++) {
          arm.clear!()
          if (preState) arm.create!(n)
          document.body.getBoundingClientRect()
          op()
          document.body.getBoundingClientRect()
          await tick()
        }
        for (let i = 0; i < samples; i++) {
          idle.clear!()
          arm.clear!()
          if (preState) arm.create!(n)
          document.body.getBoundingClientRect() // settle BEFORE timing
          if ((idle.rowCount!() as number) !== 0) throw new Error('idle arm not empty')
          if ((arm.rowCount!() as number) !== preState) {
            throw new Error(`${host}/${mode}: bad pre-state @${n}`)
          }
          await tick()
          gc?.()
          const t0 = performance.now()
          op()
          const t1 = performance.now()
          document.body.getBoundingClientRect()
          const t2 = performance.now()
          if ((arm.rowCount!() as number) !== postState) {
            throw new Error(`${host}/${mode}: bad post-state @${n}`)
          }
          js.push(t1 - t0)
          layout.push(t2 - t1)
          await tick()
        }
        return { js, layout }
      }

      const MODES = ['clear', 'fresh', 'replace'] as const
      const pooled: Record<string, { js: number[]; layout: number[] }> = {}
      const key = (h: string, m: string, n: number) => `${h}/${m}@${n}`
      for (const n of rowCounts) {
        for (const h of ['pyreon', 'vanilla']) {
          for (const m of MODES) pooled[key(h, m, n)] = { js: [], layout: [] }
        }
      }
      for (let pass = 0; pass < passes; pass++) {
        for (const n of rowCounts) {
          for (const m of MODES) {
            // Reverse arm order on alternate passes so neither arm systematically
            // runs second (and benefits from the other's warmup / GC debt).
            const order: Array<'pyreon' | 'vanilla'> =
              pass % 2 === 0 ? ['pyreon', 'vanilla'] : ['vanilla', 'pyreon']
            for (const h of order) {
              const r = await runCell(h === 'pyreon' ? b.pyreon : b.vanilla, h, m, n)
              pooled[key(h, m, n)]!.js.push(...r.js)
              pooled[key(h, m, n)]!.layout.push(...r.layout)
            }
          }
        }
      }
      return pooled
    },
    { samples: SAMPLES, passes: PASSES, rowCounts: ROW_COUNTS },
  )

  // ── Drift probe ────────────────────────────────────────────────────────────
  // Fixed n, many create/clear cycles, ids never reused. Answers a question the
  // n-sweep structurally cannot: does teardown get SLOWER as a session ages?
  // `createSelector` keeps a per-key bucket map that is reclaimed by an
  // amortized sweep; if that sweep under-reclaims, per-row teardown would climb
  // with cycles at CONSTANT n — indistinguishable from superlinear scaling in
  // any ascending-n sweep, but a leak rather than a complexity class.
  if (DRIFT) {
    const drift = await page.evaluate(
      async ({ n, cycles }) => {
        /**
         * Hand-written Vanilla control, mirroring `impl/vanilla.ts:renderAll` (whose
         * `clear` is `renderAll([])`, i.e. `innerHTML = ''` + an empty table). It is
         * the control for everything the BROWSER charges to remove n nodes; only the
         * residual over it is attributable to Pyreon. `bench-fixture` gives it the
         * same deterministic `table-layout: fixed` the profiling host now uses.
         */
        const makeVanilla = (): Driver => {
          const host = document.createElement('div')
          host.className = 'bench-fixture'
          host.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;visibility:hidden'
          document.body.appendChild(host)
          const renderAll = (count: number) => {
            host.innerHTML = ''
            const table = document.createElement('table')
            const tbody = document.createElement('tbody')
            for (let i = 0; i < count; i++) {
              const tr = document.createElement('tr')
              const td1 = document.createElement('td')
              const td2 = document.createElement('td')
              td1.textContent = String(i)
              td2.textContent = 'lorem ipsum dolor'
              tr.appendChild(td1)
              tr.appendChild(td2)
              tbody.appendChild(tr)
            }
            table.appendChild(tbody)
            host.appendChild(table)
          }
          return {
            create: (count) => renderAll(count as number),
            clear: () => renderAll(0),
            rowCount: () => host.querySelectorAll('tr').length,
          }
        }
        const b = { pyreon: (globalThis as never as { __clearBench: Driver }).__clearBench, vanilla: makeVanilla() }
        const gc = (globalThis as { gc?: () => void }).gc
        const tick = () => new Promise((r) => setTimeout(r, 0))
        const pyreon: number[] = []
        const vanilla: number[] = []
        for (let i = 0; i < 8; i++) {
          b.pyreon.create!(n)
          b.pyreon.clear!()
          b.vanilla.create!(n)
          b.vanilla.clear!()
          await tick()
        }
        for (let c = 0; c < cycles; c++) {
          for (const [arm, sink] of [
            [b.pyreon, pyreon],
            [b.vanilla, vanilla],
          ] as const) {
            arm.create!(n)
            document.body.getBoundingClientRect()
            await tick()
            gc?.()
            const t0 = performance.now()
            arm.clear!()
            const t1 = performance.now()
            sink.push(t1 - t0)
            await tick()
          }
        }
        return { pyreon, vanilla }
      },
      { n: 1000, cycles: 120 },
    )
    const med2 = (a: number[]) => {
      const s = [...a].sort((x, y) => x - y)
      const m = Math.floor(s.length / 2)
      return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
    }
    const fm = (ms: number) => (Math.abs(ms) < 1 ? `${(ms * 1000).toFixed(1)}µs` : `${ms.toFixed(2)}ms`)
    console.log(`\n${'='.repeat(104)}`)
    console.log('DRIFT — 120 create/clear cycles at n=1000, ids never reused (session accumulation probe)')
    console.log('='.repeat(104))
    const q = (a: number[], i: number) => a.slice((a.length * i) / 4, (a.length * (i + 1)) / 4)
    for (const [name, arr] of [
      ['Pyreon', drift.pyreon],
      ['Vanilla', drift.vanilla],
    ] as const) {
      const qs = [0, 1, 2, 3].map((i) => med2(q(arr, i)))
      console.log(
        `  ${name.padEnd(8)} quartile medians: ` +
          qs.map((v) => fm(v).padStart(9)).join(' -> ') +
          `   last/first ${(qs[3]! / qs[0]!).toFixed(3)}x`,
      )
    }
    const pq = [0, 3].map((i) => med2(q(drift.pyreon, i)))
    const vq = [0, 3].map((i) => med2(q(drift.vanilla, i)))
    console.log(
      `  residual (Pyreon-Vanilla): first quartile ${fm(pq[0]! - vq[0]!)} -> ` +
        `last quartile ${fm(pq[1]! - vq[1]!)}`,
    )
  }

  let domControl: Record<string, number> | null = null
  if (DOM_CONTROL) {
    domControl = await page.evaluate(async ({ rowCounts }) => {
      const tick = () => new Promise((r) => setTimeout(r, 0))
      const host = document.createElement('div')
      document.body.appendChild(host)
      // Replicate the two arms' ACTUAL shapes, not a same-shape A/B:
      //   pyreonShape  — tbody.replaceChildren(marker, marker), n+2 children
      //   vanillaShape — host.innerHTML = '' with ONE child (the table)
      const buildPyreonShape = (n: number) => {
        host.innerHTML = ''
        const t = document.createElement('table')
        const tb = document.createElement('tbody')
        const head = document.createComment('')
        const tail = document.createComment('')
        tb.appendChild(head)
        for (let i = 0; i < n; i++) {
          const tr = document.createElement('tr')
          const a = document.createElement('td')
          const c = document.createElement('td')
          a.textContent = String(i)
          c.textContent = 'lorem ipsum dolor'
          tr.appendChild(a)
          tr.appendChild(c)
          tb.appendChild(tr)
        }
        tb.appendChild(tail)
        t.appendChild(tb)
        host.appendChild(t)
        return () => tb.replaceChildren(head, tail)
      }
      const buildVanillaShape = (n: number) => {
        host.innerHTML = ''
        const t = document.createElement('table')
        const tb = document.createElement('tbody')
        for (let i = 0; i < n; i++) {
          const tr = document.createElement('tr')
          const a = document.createElement('td')
          const c = document.createElement('td')
          a.textContent = String(i)
          c.textContent = 'lorem ipsum dolor'
          tr.appendChild(a)
          tr.appendChild(c)
          tb.appendChild(tr)
        }
        t.appendChild(tb)
        host.appendChild(t)
        return () => {
          host.innerHTML = ''
          host.appendChild(document.createElement('table'))
        }
      }
      const med = (a: number[]) => {
        const s2 = [...a].sort((x, y) => x - y)
        const m = Math.floor(s2.length / 2)
        return s2.length % 2 ? s2[m]! : (s2[m - 1]! + s2[m]!) / 2
      }
      const acc: Record<string, number> = {}
      for (const n of rowCounts) {
        const samples: Record<string, number[]> = { pyreonShape: [], vanillaShape: [] }
        for (let i = 0; i < 25; i++) {
          for (const variant of ['pyreonShape', 'vanillaShape'] as const) {
            const clear =
              variant === 'pyreonShape' ? buildPyreonShape(n) : buildVanillaShape(n)
            document.body.getBoundingClientRect()
            await tick()
            const t0 = performance.now()
            clear()
            const t1 = performance.now()
            samples[variant]!.push(t1 - t0)
            await tick()
          }
        }
        for (const k of Object.keys(samples)) acc[`${k}@${n}`] = med(samples[k]!)
      }
      host.remove()
      return acc
    }, { rowCounts: ROW_COUNTS })
  }

  // ── Statistics ─────────────────────────────────────────────────────────────
  const med = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
  }
  const bootCI = (a: number[]): [number, number] => {
    const meds: number[] = []
    for (let r = 0; r < 1000; r++) {
      const s: number[] = []
      for (let i = 0; i < a.length; i++) s.push(a[(Math.random() * a.length) | 0]!)
      meds.push(med(s))
    }
    meds.sort((x, y) => x - y)
    return [meds[25]!, meds[974]!]
  }
  const f = (ms: number) => (Math.abs(ms) < 1 ? `${(ms * 1000).toFixed(1)}µs` : `${ms.toFixed(2)}ms`)

  const J = (h: string, m: string, n: number) => out[`${h}/${m}@${n}`]!.js
  /** Least-squares slope of log(y) on log(n) — the scaling exponent. */
  const exponent = (pts: Array<{ n: number; y: number }>) => {
    const ok = pts.filter((p) => p.y > 0)
    if (ok.length < 2) return NaN
    const xs = ok.map((p) => Math.log(p.n))
    const ys = ok.map((p) => Math.log(p.y))
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length
    const my = ys.reduce((a, b) => a + b, 0) / ys.length
    let sxy = 0
    let sxx = 0
    for (let i = 0; i < xs.length; i++) {
      sxy += (xs[i]! - mx) * (ys[i]! - my)
      sxx += (xs[i]! - mx) ** 2
    }
    return sxy / sxx
  }

  console.log(`\n${'='.repeat(104)}`)
  console.log("CLEAR — pure teardown (`rows.set([])`), mutation only, layout excluded")
  console.log('='.repeat(104))
  console.log(
    `${'rows'.padStart(7)}${'Pyreon'.padStart(11)}${'CI95'.padStart(21)}` +
      `${'Vanilla'.padStart(11)}${'CI95'.padStart(21)}${'residual'.padStart(11)}${'ns/row'.padStart(10)}`,
  )
  const clearPts: Array<{ n: number; y: number }> = []
  const clearRow: Array<{ n: number; nsRow: number }> = []
  for (const n of ROW_COUNTS) {
    const p = J('pyreon', 'clear', n)
    const v = J('vanilla', 'clear', n)
    const pm = med(p)
    const vm = med(v)
    const [pl, ph] = bootCI(p)
    const [vl, vh] = bootCI(v)
    const residual = pm - vm
    clearPts.push({ n, y: residual })
    clearRow.push({ n, nsRow: (residual * 1e6) / n })
    console.log(
      `${String(n).padStart(7)}${f(pm).padStart(11)}${`[${f(pl)},${f(ph)}]`.padStart(21)}` +
        `${f(vm).padStart(11)}${`[${f(vl)},${f(vh)}]`.padStart(21)}` +
        `${f(residual).padStart(11)}${((residual * 1e6) / n).toFixed(1).padStart(10)}`,
    )
  }

  console.log(`\n${'='.repeat(104)}`)
  console.log('REPLACE - FRESH — the create-path split estimator, carried across n')
  console.log('='.repeat(104))
  console.log(
    `${'rows'.padStart(7)}${'P.replace'.padStart(11)}${'P.fresh'.padStart(11)}${'pTear'.padStart(11)}` +
      `${'V.replace'.padStart(11)}${'V.fresh'.padStart(11)}${'vTear'.padStart(11)}` +
      `${'EXCESS'.padStart(11)}${'ns/row'.padStart(10)}`,
  )
  const excessPts: Array<{ n: number; y: number }> = []
  const pTearPts: Array<{ n: number; y: number }> = []
  const excessRow: Array<{ n: number; nsRow: number }> = []
  for (const n of ROW_COUNTS) {
    const pr = med(J('pyreon', 'replace', n))
    const pf = med(J('pyreon', 'fresh', n))
    const vr = med(J('vanilla', 'replace', n))
    const vf = med(J('vanilla', 'fresh', n))
    const pTear = pr - pf
    const vTear = vr - vf
    const excess = pTear - vTear
    pTearPts.push({ n, y: pTear })
    excessPts.push({ n, y: excess })
    excessRow.push({ n, nsRow: (excess * 1e6) / n })
    console.log(
      `${String(n).padStart(7)}${f(pr).padStart(11)}${f(pf).padStart(11)}${f(pTear).padStart(11)}` +
        `${f(vr).padStart(11)}${f(vf).padStart(11)}${f(vTear).padStart(11)}` +
        `${f(excess).padStart(11)}${((excess * 1e6) / n).toFixed(1).padStart(10)}`,
    )
  }

  console.log(`\n${'='.repeat(104)}`)
  console.log('SCALING VERDICT — cost PER ROW; a flat column is linear scaling')
  console.log('='.repeat(104))
  console.log(
    `${'rows'.padStart(7)}${'clear residual'.padStart(18)}${'replace excess'.padStart(18)}` +
      `${'pTear (uncorrected)'.padStart(22)}`,
  )
  for (let i = 0; i < ROW_COUNTS.length; i++) {
    const n = ROW_COUNTS[i]!
    console.log(
      `${String(n).padStart(7)}${`${clearRow[i]!.nsRow.toFixed(1)} ns/row`.padStart(18)}` +
        `${`${excessRow[i]!.nsRow.toFixed(1)} ns/row`.padStart(18)}` +
        `${`${((pTearPts[i]!.y * 1e6) / n).toFixed(1)} ns/row`.padStart(22)}`,
    )
  }
  const verdict = (name: string, pts: Array<{ n: number; y: number }>) => {
    const e = exponent(pts)
    const lo = pts[0]!
    const hi = pts[pts.length - 1]!
    const tag = Number.isNaN(e)
      ? 'UNRESOLVED (a residual crossed zero — below the noise floor)'
      : e > 1.25
        ? 'SUPERLINEAR'
        : e < 0.75
          ? 'SUBLINEAR'
          : 'LINEAR'
    console.log(
      `\n  ${name.padEnd(22)} ${f(lo.y)} @${lo.n} -> ${f(hi.y)} @${hi.n}` +
        ` = ${(hi.y / lo.y).toFixed(1)}x for ${hi.n / lo.n}x rows` +
        ` · exponent ${e.toFixed(2)} -> ${tag}`,
    )
  }
  verdict('clear residual', clearPts)
  verdict('replace excess', excessPts)
  verdict('pTear (uncorrected)', pTearPts)

  console.log(`\n${'='.repeat(104)}`)
  console.log('LAYOUT — excluded from every timed region above; shown to prove it dominates wall-clock')
  console.log('='.repeat(104))
  for (const n of ROW_COUNTS) {
    console.log(
      `${String(n).padStart(7)}  clear: Pyreon ${f(med(out[`pyreon/clear@${n}`]!.layout)).padStart(9)}` +
        `  Vanilla ${f(med(out[`vanilla/clear@${n}`]!.layout)).padStart(9)}` +
        `   |  fresh: Pyreon ${f(med(out[`pyreon/fresh@${n}`]!.layout)).padStart(9)}` +
        `  Vanilla ${f(med(out[`vanilla/fresh@${n}`]!.layout)).padStart(9)}`,
    )
  }

  if (domControl) {
    console.log(`\n${'='.repeat(96)}`)
    console.log("DOM CONTROL — the ARM ASYMMETRY, bare DOM, no framework")
    console.log('='.repeat(104))
    console.log(
      '  Pyreon clears tbody.replaceChildren(n+2 children); Vanilla clears' +
        " host.innerHTML='' (ONE child).",
    )
    console.log('  The Δ is a confound inside every residual above — SUBTRACT it.\n')
    for (const n of ROW_COUNTS) {
      const ps = domControl[`pyreonShape@${n}`]!
      const vs = domControl[`vanillaShape@${n}`]!
      const conf = ((ps - vs) * 1e6) / n
      const raw = clearRow.find((r) => r.n === n)!.nsRow
      console.log(
        `${String(n).padStart(7)}  P-shape ${f(ps).padStart(9)}   V-shape ${f(vs).padStart(9)}` +
          `   confound ${conf.toFixed(1).padStart(7)} ns/row` +
          `   |  residual ${raw.toFixed(1).padStart(6)} -> CORRECTED ${(raw - conf).toFixed(1).padStart(6)} ns/row`,
      )
    }
  }
} finally {
  await browser.close()
  preview.kill()
}
