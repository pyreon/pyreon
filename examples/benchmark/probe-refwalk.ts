/**
 * Ceiling probe for the "chain sibling refs instead of re-walking from the
 * parent" compiler change.
 *
 * The compiler's `childNodeAccessor` builds every child ref as an independent
 * walk from the parent (`__root.firstElementChild`,
 * `__root.firstElementChild.nextElementSibling`, …), so N referenced children
 * cost O(N²) DOM property reads where O(N) would do. Chaining is safe by
 * construction — phase-1 refs all resolve against the pristine clone before any
 * phase-2 mutation — but "safe and general" is not "worth doing", so this
 * measures the UPPER BOUND of the saving before either backend is touched.
 *
 * Measures the walk in isolation against the exact shapes the benchmark and a
 * realistic wide row produce, at 10,000 rows.
 *
 *   bun probe-refwalk.ts
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4184
const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: import.meta.dir,
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] })
try {
  const page = await browser.newPage()
  await page.goto(`http://localhost:${PORT}/`)

  const out = await page.evaluate(() => {
    const N = 10_000
    const mk = (cols: number) => {
      const tr = document.createElement('tr')
      for (let i = 0; i < cols; i++) tr.appendChild(document.createElement('td'))
      return tr
    }
    const med = (a: number[]) => {
      const s = [...a].sort((x, y) => x - y)
      return s[Math.floor(s.length / 2)]!
    }

    // Per-row: reproduce exactly what one `_tpl` callback does for `cols`
    // referenced children, both ways. `sink` defeats DCE.
    let sink = 0
    const timeIt = (fn: () => void) => {
      const runs: number[] = []
      for (let r = 0; r < 15; r++) {
        const t0 = performance.now()
        fn()
        runs.push(performance.now() - t0)
      }
      return med(runs)
    }

    const results: Record<string, { walk: number; chain: number; saved: number }> = {}
    for (const cols of [2, 4, 8]) {
      const row = mk(cols)
      const walk = timeIt(() => {
        for (let i = 0; i < N; i++) {
          // idx 0..cols-1, each an independent walk from the parent
          for (let k = 0; k < cols; k++) {
            let e = row.firstElementChild
            for (let h = 0; h < k; h++) e = e!.nextElementSibling
            sink += e ? 1 : 0
          }
        }
      })
      const chain = timeIt(() => {
        for (let i = 0; i < N; i++) {
          let e = row.firstElementChild
          sink += e ? 1 : 0
          for (let k = 1; k < cols; k++) {
            e = e!.nextElementSibling
            sink += e ? 1 : 0
          }
        }
      })
      results[`${cols} referenced children`] = { walk, chain, saved: walk - chain }
    }

    // ── The same walk against a FRESHLY CLONED row per iteration ─────────────
    //
    // Everything above re-reads ONE long-lived element N times, so every pointer
    // read hits a hot cache line. That is the wrong cost model for the thing
    // being predicted: `_tpl` clones a new row per mount, and the compiled bind
    // callback walks THAT clone — cold. Reading the hot number as the ceiling
    // for the real mount understates it, which is why the end-to-end A/B
    // (`bench-refchain.ts`) measured a larger saving than the hot probe
    // predicted. Measuring both is what turns that discrepancy from a suspicious
    // surprise into an explained one.
    const template = document.createElement('template')
    const cloneResults: Record<string, { walk: number; chain: number; saved: number }> = {}
    for (const cols of [2, 4, 8]) {
      template.innerHTML = `<tr>${'<td></td>'.repeat(cols)}</tr>`
      const proto = template.content.firstElementChild!
      const walk = timeIt(() => {
        for (let i = 0; i < N; i++) {
          const row = proto.cloneNode(true) as Element
          for (let k = 0; k < cols; k++) {
            let e = row.firstElementChild
            for (let h = 0; h < k; h++) e = e!.nextElementSibling
            sink += e ? 1 : 0
          }
        }
      })
      const chain = timeIt(() => {
        for (let i = 0; i < N; i++) {
          const row = proto.cloneNode(true) as Element
          let e = row.firstElementChild
          sink += e ? 1 : 0
          for (let k = 1; k < cols; k++) {
            e = e!.nextElementSibling
            sink += e ? 1 : 0
          }
        }
      })
      cloneResults[`${cols} referenced children`] = { walk, chain, saved: walk - chain }
    }
    return { results, cloneResults, sink }
  })

  const f = (ms: number) => (ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`)
  const table = (title: string, rows: Record<string, { walk: number; chain: number; saved: number }>) => {
    console.log(`\n${title}`)
    console.log('='.repeat(64))
    console.log(
      `${'shape'.padEnd(24)}${'re-walk'.padStart(12)}${'chained'.padStart(12)}${'saved'.padStart(12)}`,
    )
    for (const [k, v] of Object.entries(rows)) {
      console.log(
        `${k.padEnd(24)}${f(v.walk).padStart(12)}${f(v.chain).padStart(12)}${f(v.saved).padStart(12)}`,
      )
    }
  }
  table(`REF-WALK, HOT element reused @ 10,000 rows (sink=${out.sink})`, out.results)
  table('REF-WALK, FRESH clone per row @ 10,000 rows — the real mount cost model', out.cloneResults)
  console.log(
    '\nThe fresh-clone rows are the ones to predict a real mount from: `_tpl` clones\n' +
      'per row, so the walk never hits a warm element. The hot table understates the\n' +
      'saving, which is why the end-to-end A/B beats it.',
  )
} finally {
  await browser.close()
  preview.kill()
}
