/**
 * Measure the sibling-ref CHAINING change end-to-end, on a production build, on
 * a row shape where it can actually show.
 *
 * The compiler used to emit every child ref as an independent walk from its
 * parent (`__root.firstElementChild.nextElementSibling…`), so K referenced
 * children cost 1+2+…+K DOM property reads. Chaining each phase-1 capture off
 * the previous one makes it K. On the krausest-style TWO-cell row that is one
 * redundant pointer read per row and is unmeasurable; on a realistic wide row it
 * is not, which is why `profile-create.tsx` grew an 8-cell arm and why this
 * script drives that arm rather than the narrow one.
 *
 * ARM VERIFICATION is the whole point of the preamble, and it is bundle-level
 * rather than source-level on purpose. An A/B across two compiler versions is
 * exactly the shape where a stale `dist/` silently measures the same bytes twice
 * and reports a confident Δ of ~0. So before timing anything this script FETCHES
 * the loaded chunk out of the page and reports which emit shape it contains:
 *
 *   chained  — one `.firstElementChild` per template, K-1 `.nextElementSibling`
 *   rewalk   — K `.firstElementChild`, 1+2+…+(K-1) `.nextElementSibling`
 *
 * The check COUNTS those property reads rather than matching variable names,
 * because a production build is minified and `__e0` does not survive it — a
 * name-based check would report "neither shape" on every real arm. DOM property
 * names are not manglable, so the counts are exact either way.
 *
 * Read that line before believing the number. If it says `rewalk` while you
 * think you built the fix, the bundle is stale — rebuild, do not re-run.
 *
 * The timed region is the JS half only (`create` up to, but excluding, the
 * forced layout flush): both arms produce the same box tree and therefore pay
 * the same layout, so including it would bury a JS-only change under ~7ms of
 * identical Chromium work.
 *
 *   bun run build && bun bench-refchain.ts [samples] [rows]
 */
import { loadavg } from 'node:os'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

/**
 * A/B arms are built by a `cargo` + two `vite` builds, which leave the 1-minute
 * load average elevated for a while after they exit. Measuring into that decay
 * silently inflates whichever arm ran first, so wait for the machine to be
 * quiet and REFUSE rather than publish a contaminated number.
 */
const LOAD_CEILING = 8
async function settle(): Promise<number> {
  for (let i = 0; i < 40; i++) {
    const l1 = loadavg()[0]!
    if (l1 <= LOAD_CEILING) return l1
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error(
    `[refchain] load average stayed above ${LOAD_CEILING} for 200s — refusing to measure. ` +
      `Check for orphaned processes: ps -Ao pid,ppid,pcpu,etime,comm | awk '$2==1 && $3>50'`,
  )
}

const SAMPLES = Number(process.argv[2] ?? 60)
const ROWS = Number(process.argv[3] ?? 2000)
const PORT = 4186
const CELLS_PER_ROW = 8

const loadBefore = await settle()

const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

type WideDriver = {
  create(n: number): void
  clear(): void
  rowCount(): number
  cellCount(): number
}

const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] })
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))

  await page.goto(`http://localhost:${PORT}/?profileCreate=1`)
  await page.waitForFunction(() => '__createBench' in globalThis, undefined, { timeout: 30_000 })

  // ── Arm verification, before any timing ──────────────────────────────────
  const arm = await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name)
    const url = urls.find((u) => u.includes('profile-create'))
    if (!url) return null
    const src = await (await fetch(url)).text()
    const count = (re: RegExp) => (src.match(re) ?? []).length
    return {
      url: url.split('/').pop() ?? url,
      first: count(/\.firstElementChild/g),
      next: count(/\.nextElementSibling/g),
      bytes: src.length,
    }
  })
  if (arm === null) {
    throw new Error('[refchain] could not locate the profile-create chunk to verify the arm')
  }
  // The chunk holds TWO templates: the narrow 2-cell arm (1 `firstElementChild`
  // either way, 1 `nextElementSibling` either way) and the wide 8-cell arm.
  // Wide chained: +1 first / +7 next. Wide re-walk: +8 first / +28 next. The
  // two totals are far apart, so a threshold cannot land between them by
  // accident — but assert the shape is one of the two rather than inferring.
  const shape =
    arm.next <= 12 && arm.first <= 4 ? 'chained' : arm.next >= 24 && arm.first >= 8 ? 'rewalk' : 'UNKNOWN'
  if (shape === 'UNKNOWN') {
    throw new Error(
      `[refchain] the loaded chunk matches NEITHER emit shape ` +
        `(firstElementChild x${arm.first}, nextElementSibling x${arm.next}) — the wide-row arm ` +
        `is missing or the template changed, so there is nothing to compare.`,
    )
  }

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
      `[refchain] clock too coarse: crossOriginIsolated=${clock.isolated}, ` +
        `quantum=${(clock.quantumMs * 1000).toFixed(1)}µs (need isolation + <=20µs)`,
    )
  }

  console.log(
    `[refchain] emit shape in the loaded bundle: ${shape.toUpperCase()} ` +
      `(firstElementChild x${arm.first}, nextElementSibling x${arm.next}; chunk ${arm.url}) · ` +
      `crossOriginIsolated=${clock.isolated} · ` +
      `quantum ${(clock.quantumMs * 1000).toFixed(1)}µs · ${ROWS} rows x ${CELLS_PER_ROW} cells ` +
      `· ${SAMPLES} samples`,
  )

  const out = await page.evaluate(
    async ({ samples, rows, cells }) => {
      const b = (globalThis as never as { __createBench: { wide: WideDriver } }).__createBench.wide
      const gc = (globalThis as { gc?: () => void }).gc
      const tick = () => new Promise((r) => setTimeout(r, 0))

      for (let i = 0; i < 12; i++) {
        b.clear()
        b.create(rows)
        document.body.getBoundingClientRect()
        b.clear()
        document.body.getBoundingClientRect()
        await tick()
      }

      const js: number[] = []
      for (let i = 0; i < samples; i++) {
        b.clear()
        document.body.getBoundingClientRect()
        await tick()
        gc?.()
        const t0 = performance.now()
        b.create(rows)
        const t1 = performance.now()
        // Flush layout OUTSIDE the timed region — identical across arms.
        document.body.getBoundingClientRect()
        if (b.rowCount() !== rows) throw new Error(`bad row count: ${b.rowCount()}`)
        if (b.cellCount() !== rows * cells) throw new Error(`bad cell count: ${b.cellCount()}`)
        js.push(t1 - t0)
        await tick()
      }
      const sorted = [...js].sort((x, y) => x - y)
      const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
      return { median: q(0.5), p25: q(0.25), p75: q(0.75), min: sorted[0]! }
    },
    { samples: SAMPLES, rows: ROWS, cells: CELLS_PER_ROW },
  )

  const f = (ms: number) => (ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(3)}ms`)
  console.log(
    `[refchain] ${shape}: median ${f(out.median)}  [p25 ${f(out.p25)} – p75 ${f(out.p75)}]  min ${f(out.min)}`,
  )
  console.log(
    `[refchain] per row: ${((out.median * 1_000_000) / ROWS).toFixed(0)}ns ` +
      `(${((out.median * 1_000_000) / (ROWS * CELLS_PER_ROW)).toFixed(0)}ns/cell)`,
  )
  // Both stamps, not just the entry one: a run that STARTED quiet and finished
  // loaded measured a moving machine, and only the pair shows that.
  console.log(
    `[refchain] load 1-min: ${loadBefore.toFixed(2)} before -> ${loadavg()[0]!.toFixed(2)} after` +
      (loadavg()[0]! > LOAD_CEILING ? '  <-- ABOVE CEILING, DISCARD THIS RUN' : ''),
  )
} finally {
  await browser.close()
  preview.kill()
}
