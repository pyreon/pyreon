/**
 * ISOLATION PROBE — does the TEXT CONTENT of a row change how long the browser
 * takes to lay out 10,000 of them?
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Two first-party instruments disagree by ~6x on "the layout cost of building
 * 10,000 Pyreon rows vs 10,000 hand-written ones", both measured on the same
 * quiet machine the same night:
 *
 *   bench-createdecomp.ts   (fresh, 10k)  vanilla 74.37ms · L3 76.46ms  -> +2.09ms
 *   bench-teardown-curve.ts (fresh, 10k)  Vanilla 55.17ms · Pyreon 72.34ms -> +17.17ms
 *
 * The PYREON arms agree to ~5% (76.46 vs 72.34). The VANILLA arms do not:
 * 74.37ms vs 55.17ms, a 19.2ms gap that is the ENTIRE disagreement. So the
 * question is not "how expensive is Pyreon's layout" — both agree on that — it
 * is "why does one hand-written control lay out 10,000 rows 26% cheaper than
 * the other".
 *
 * The two controls differ in exactly one respect: the TEXT they put in the
 * cells. `bench-teardown-curve.ts`'s in-script control hardcodes
 *
 *     td1.textContent = String(i)              // 0..n-1
 *     td2.textContent = 'lorem ipsum dolor'    // THE SAME STRING, n times
 *
 * while every other arm in the suite — the real `impl/vanilla.ts`, the
 * `profile-decomp.tsx` ladder, and the Pyreon arm it is being compared against
 * — renders the seeded-RNG label `${adjective} ${colour} ${noun}` (25x11x13 =
 * 3,575 distinct strings) and a large monotonic id.
 *
 * A constant string repeated 10,000 times is the best case for Chromium's text
 * shaping and word caches; 3,575 distinct phrases is not. That is a hypothesis,
 * not a finding, which is what this probe is for.
 *
 * ─── DESIGN ──────────────────────────────────────────────────────────────────
 * A 2x2 over the two content variables, in FOUR arms that are otherwise
 * byte-identical hand-written Vanilla: same `<tr><td><td>` structure, same host
 * element styles, same `bench-fixture` class (so the same deterministic
 * `table-layout: fixed`), same detached-build-then-append commit.
 *
 *   const/small    id=String(i)        label='lorem ipsum dolor'   <- B's control, exactly
 *   varied/small   id=String(i)        label=RNG phrase            <- isolates LABEL
 *   const/big      id=String(bigId++)  label='lorem ipsum dolor'   <- isolates ID
 *   varied/big     id=String(bigId++)  label=RNG phrase            <- the real suite content
 *
 * STRUCTURE IS THE CONTROL THAT MUST NOT MOVE. All four arms emit the same
 * element/text-node counts into the same layout mode; only the characters
 * differ. If layout is structure-bound, all four medians agree and the
 * hypothesis is refuted outright.
 *
 * Only LAYOUT is reported. The timed region is the forced
 * `document.body.getBoundingClientRect()` AFTER the mutation, measured
 * separately from the mutation itself, matching both instruments under
 * reconciliation.
 *
 * Protocol: production build, arms interleaved with the order reversed on
 * alternate passes, only the arm under test holds rows (asserted), `gc()`
 * between samples outside the timed region, median + 95% bootstrap CI, load
 * stamped at both ends, `crossOriginIsolated` + real clock quantum asserted.
 *
 *   bun run build && bun probe-labelcontent.ts [samples] [rows]
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const SAMPLES = Number(process.argv[2] ?? 20)
const ROWS = Number(process.argv[3] ?? 10_000)
const PASSES = 3
const PORT = 4189

const loadStamp = async (when: string) => {
  const p = Bun.spawn(['uptime'], { stdout: 'pipe' })
  console.log(`[labelcontent] load ${when}: ${(await new Response(p.stdout).text()).trim()}`)
}

await loadStamp('BEFORE')

const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
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
  // `?profileClear=1` is used only to get the real page + its `.bench-fixture`
  // CSS. Its Pyreon arm is cleared and asserted empty before every sample, so
  // it contributes no rows to the document being laid out.
  await page.goto(`http://localhost:${PORT}/?profileClear=1`)
  await page.waitForFunction(() => '__clearBench' in globalThis, undefined, { timeout: 30_000 })

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
    `[labelcontent] crossOriginIsolated=${clock.isolated} · ` +
      `quantum ${(clock.quantumMs * 1000).toFixed(1)}µs · ${SAMPLES} samples x ${PASSES} passes · ${ROWS} rows`,
  )
  if (!clock.isolated) console.log('[labelcontent] WARNING: not cross-origin isolated — coarse clock')

  const out = await page.evaluate(
    async ({ samples, passes, rows }) => {
      // Same three pools + LCG the suite's `runner.ts` uses, inlined so this
      // probe depends on nothing but the page it is measuring in.
      const ADJECTIVES = ['pretty','large','big','small','tall','short','long','handsome','plain','quaint','clean','elegant','easy','angry','crazy','helpful','mushy','odd','unsightly','adorable','important','inexpensive','cheap','expensive','fancy']
      const COLOURS = ['red','yellow','blue','green','pink','brown','purple','brown','white','black','orange']
      const NOUNS = ['table','chair','house','bbq','desk','car','pony','cookie','sandwich','burger','pizza','mouse','keyboard']
      let seed = 0x2f6e2b1
      const rng = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        return seed / 0x7fffffff
      }
      const pick = <T,>(a: T[]): T => a[Math.floor(rng() * a.length)] as T

      type Arm = { create: (n: number) => void; clear: () => void; rowCount: () => number }

      // One hand-written Vanilla arm. `variedLabel` / `bigId` are the ONLY
      // things that differ between the four instances.
      const makeArm = (variedLabel: boolean, bigId: boolean): Arm => {
        const host = document.createElement('div')
        host.className = 'bench-fixture'
        host.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;visibility:hidden'
        document.body.appendChild(host)
        let nextId = 1_000_000
        const renderAll = (n: number) => {
          host.innerHTML = ''
          const table = document.createElement('table')
          const tbody = document.createElement('tbody')
          for (let i = 0; i < n; i++) {
            const tr = document.createElement('tr')
            const td1 = document.createElement('td')
            const td2 = document.createElement('td')
            td1.textContent = bigId ? String(nextId++) : String(i)
            td2.textContent = variedLabel
              ? `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}`
              : 'lorem ipsum dolor'
            tr.appendChild(td1)
            tr.appendChild(td2)
            tbody.appendChild(tr)
          }
          table.appendChild(tbody)
          host.appendChild(table)
        }
        return {
          create: (n) => renderAll(n),
          clear: () => renderAll(0),
          rowCount: () => host.querySelectorAll('tr').length,
        }
      }

      const KEYS = ['const/small', 'varied/small', 'const/big', 'varied/big'] as const
      type Key = (typeof KEYS)[number]
      const arms: Record<Key, Arm> = {
        'const/small': makeArm(false, false),
        'varied/small': makeArm(true, false),
        'const/big': makeArm(false, true),
        'varied/big': makeArm(true, true),
      }
      const pyreonIdle = (globalThis as never as { __clearBench: Arm }).__clearBench
      const gc = (globalThis as { gc?: () => void }).gc
      const tick = () => new Promise((r) => setTimeout(r, 0))

      const clearEverything = () => {
        pyreonIdle.clear()
        for (const k of KEYS) arms[k].clear()
      }

      // STRUCTURAL EQUIVALENCE CHECK — the probe's own control. If the four arms
      // did not emit identical element/text-node counts, a layout difference
      // between them would not isolate text content at all.
      const shape = (k: Key) => {
        clearEverything()
        arms[k].create(200)
        const host = document.querySelectorAll('.bench-fixture')
        void host
        const trs = arms[k].rowCount()
        // count td + text nodes under the arm's own table
        let tds = 0
        let texts = 0
        const tables = document.querySelectorAll('.bench-fixture table')
        for (const t of tables) {
          if (t.querySelectorAll('tr').length !== 200) continue
          tds = t.querySelectorAll('td').length
          const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT)
          while (walk.nextNode()) texts++
          break
        }
        return { trs, tds, texts }
      }
      const shapes = Object.fromEntries(KEYS.map((k) => [k, shape(k)])) as Record<
        Key,
        { trs: number; tds: number; texts: number }
      >
      const s0 = JSON.stringify(shapes[KEYS[0]])
      for (const k of KEYS) {
        if (JSON.stringify(shapes[k]) !== s0) {
          throw new Error(
            `arms are NOT structurally identical — ${k}=${JSON.stringify(shapes[k])} vs ${KEYS[0]}=${s0}`,
          )
        }
      }
      clearEverything()

      const runCell = async (k: Key) => {
        const arm = arms[k]
        const layout: number[] = []
        const js: number[] = []
        for (let i = 0; i < 6; i++) {
          clearEverything()
          document.body.getBoundingClientRect()
          arm.create(rows)
          document.body.getBoundingClientRect()
          await tick()
        }
        for (let i = 0; i < samples; i++) {
          clearEverything()
          document.body.getBoundingClientRect() // settle BEFORE timing
          for (const other of KEYS) {
            if (arms[other].rowCount() !== 0) throw new Error(`idle arm ${other} not empty`)
          }
          if (pyreonIdle.rowCount() !== 0) throw new Error('idle Pyreon arm not empty')
          await tick()
          gc?.()
          const t0 = performance.now()
          arm.create(rows)
          const t1 = performance.now()
          document.body.getBoundingClientRect()
          const t2 = performance.now()
          if (arm.rowCount() !== rows) throw new Error(`${k}: bad post-state`)
          js.push(t1 - t0)
          layout.push(t2 - t1)
          await tick()
        }
        return { js, layout }
      }

      const pooled: Record<string, { js: number[]; layout: number[] }> = {}
      for (const k of KEYS) pooled[k] = { js: [], layout: [] }
      for (let p = 0; p < passes; p++) {
        const order = p % 2 === 0 ? [...KEYS] : [...KEYS].reverse()
        for (const k of order) {
          const r = await runCell(k)
          pooled[k]!.js.push(...r.js)
          pooled[k]!.layout.push(...r.layout)
        }
      }
      return { pooled, shape: shapes[KEYS[0]] }
    },
    { samples: SAMPLES, passes: PASSES, rows: ROWS },
  )

  const med = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
  }
  const bootDiffCI = (a: number[], b: number[]) => {
    const R = 2000
    const d: number[] = []
    for (let r = 0; r < R; r++) {
      const ra: number[] = []
      const rb: number[] = []
      for (let i = 0; i < a.length; i++) ra.push(a[Math.floor(Math.random() * a.length)]!)
      for (let i = 0; i < b.length; i++) rb.push(b[Math.floor(Math.random() * b.length)]!)
      d.push(med(rb) - med(ra))
    }
    d.sort((x, y) => x - y)
    return [d[Math.floor(R * 0.025)]!, d[Math.floor(R * 0.975)]!] as const
  }
  const f = (ms: number) => `${ms.toFixed(2)}ms`

  console.log(`\nstructure per arm (200-row shape check): ${JSON.stringify(out.shape)}`)
  console.log('\n========================================================================')
  console.log(`LAYOUT of ${ROWS} hand-written Vanilla rows — content is the ONLY variable`)
  console.log('========================================================================')
  console.log(`\narm            JS          layout`)
  for (const k of ['const/small', 'varied/small', 'const/big', 'varied/big']) {
    const c = out.pooled[k]!
    console.log(`${k.padEnd(14)} ${f(med(c.js)).padEnd(11)} ${f(med(c.layout))}`)
  }

  const L = (k: string) => out.pooled[k]!.layout
  const ci = (a: string, b: string) => {
    const [lo, hi] = bootDiffCI(L(a), L(b))
    return `${f(med(L(b)) - med(L(a)))} [95% CI ${f(lo)}..${f(hi)}]`
  }
  console.log(`\n-- what each variable costs, in LAYOUT --`)
  console.log(`label const -> varied (small id): ${ci('const/small', 'varied/small')}`)
  console.log(`label const -> varied (big id):   ${ci('const/big', 'varied/big')}`)
  console.log(`id small -> big (const label):    ${ci('const/small', 'const/big')}`)
  console.log(`id small -> big (varied label):   ${ci('varied/small', 'varied/big')}`)
  console.log(`\nB's control -> real suite content: ${ci('const/small', 'varied/big')}`)
} finally {
  await browser.close()
  preview.kill()
  await loadStamp('AFTER')
}
