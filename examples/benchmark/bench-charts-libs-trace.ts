/**
 * DECOMPOSE a chart library's frame-bounded window into main-thread buckets
 * (JS, GC, style, layout, paint, other) from a Chromium performance TRACE.
 *
 * Why a trace and not a CPU profile: a sampling profile attributes only JS,
 * and V8 reports GC as root-level `(garbage collector)` samples, never under
 * the frame that caused them — so a profile of an allocation-heavy op
 * silently omits the collections it triggers. Style/layout/paint are not JS
 * at all. The trace sees every main-thread event.
 *
 * Window: exactly the timed scenario's (see `setupChartsLibsProfile`),
 * bracketed by User Timing marks `cl-w0` / `cl-w1`. Each window's main-thread
 * events are reduced to SELF time (children subtracted) and bucketed; time
 * inside the window covered by no event is reported as `untraced`.
 *
 * Tracing adds overhead, so the window totals here run HIGHER than the timed
 * scenario's — read the SHARES, and the timed scenario for the absolute.
 *
 *   bun run build   (a minified build is fine — no function names needed)
 *   bun bench-charts-libs-trace.ts "Pyreon (PlotChart)" mount 1000 [samples]
 */
import { readdirSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const FW = process.argv[2] ?? 'Pyreon (PlotChart)'
const OP = (process.argv[3] ?? 'mount') as 'mount' | 'update' | 'settled'
const N = Number(process.argv[4] ?? 1000)
const K = Number(process.argv[5] ?? (N >= 1_000_000 ? 12 : 30))
const PORT = process.env.CP_PORT ?? '4184'

const BUCKETS: [string, RegExp][] = [
  ['GC', /GC|Scavenge|MarkCompact|GarbageCollect|V8\.GC/i],
  ['style', /UpdateLayoutTree|RecalculateStyles|recalcStyle|rebuildLayoutTree|StyleRecalc|ScheduleStyleRecalculation/i],
  ['layout', /Shape|^Layout$|performLayout|UpdateLayout|LayoutView|LayoutBlock|ComputeIntersections/i],
  ['paint', /PrePaint|Paint|Layerize|UpdateLayer|CompositingInputs|Compositor|Commit|RasterTask|CompositeLayers/i],
  ['canvas', /Canvas|DrawingBuffer|FlushRecording|GetImageData/i],
  ['JS', /^(FunctionCall|EvaluateScript|v8\.execute|V8\.Execute|v8\.callFunction|FireAnimationFrame|TimerFire|EventDispatch|RunMicrotasks|v8\.run|V8\.RunMicrotasks|ProfileCall|FireIdleCallback|HandlePostMessage|MessagePort)/i],
]
const bucketOf = (name: string): string => BUCKETS.find(([, re]) => re.test(name))?.[0] ?? `other:${name}`

const preview = spawn('bunx', ['vite', 'preview', '--port', PORT, '--strictPort'], { cwd: import.meta.dir, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] })
try {
  const dir = `${import.meta.dir}/dist/assets`
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const served = await fetch(`http://localhost:${PORT}/assets/${f}`).then((r) => (r.ok ? r.text() : null)).catch(() => null)
    if (served !== readFileSync(`${dir}/${f}`, 'utf8')) throw new Error(`[charts-trace] :${PORT} does not serve on-disk ${f}. Set CP_PORT.`)
  }
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.goto(`http://localhost:${PORT}/?profileChartsLibs=1`)
  await page.waitForFunction(() => '__chartsLibsProf' in globalThis, undefined, { timeout: 30_000 })

  type Prof = { prepare(fw: string, n: number): void; mount(): void; sampleMount(): Promise<number>; sampleUpdate(): Promise<number>; sampleMountSettled(): Promise<{ mass: number; tableRows: number }> }
  const run = (count: number) =>
    page.evaluate(
      async ({ fw, n, op, k }) => {
        const p = (globalThis as never as { __chartsLibsProf: Prof }).__chartsLibsProf
        p.prepare(fw, n)
        if (op === 'update') p.mount()
        let minMass = Infinity
        let tableRows = -1
        for (let i = 0; i < k; i++) {
          if (op === 'settled') {
            const r = await p.sampleMountSettled()
            minMass = Math.min(minMass, r.mass)
            tableRows = tableRows < 0 ? r.tableRows : Math.min(tableRows, r.tableRows)
          } else minMass = Math.min(minMass, op === 'mount' ? await p.sampleMount() : await p.sampleUpdate())
        }
        return { minMass, tableRows }
      },
      { fw: FW, n: N, op: OP, k: count },
    )
  // --history: mount 1k / 10k / 100k charts 30× each first, the state the
  // timed scenario's 1M cell starts from (it runs after the smaller cells).
  // Measured: Pyreon's 1M mount is ~31 ms on a fresh page and ~50 ms after
  // this history; uPlot is ~13 ms either way.
  if (process.argv.includes('--history')) {
    await page.evaluate(async (fw) => {
      const P = (globalThis as never as { __chartsLibsProf: { prepare(f: string, n: number): void; sampleMount(): Promise<unknown> } }).__chartsLibsProf
      for (const n of [1000, 10000, 100000]) {
        P.prepare(fw, n)
        for (let i = 0; i < 30; i++) await P.sampleMount()
      }
    }, FW)
    console.log('[charts] --history: ran 1k/10k/100k × 30 mounts first')
  }
  await run(5) // warm
  await browser.startTracing(page, {
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'blink.user_timing', 'disabled-by-default-v8.gc', 'blink'],
  })
  const { minMass, tableRows } = await run(K)
  if (OP === 'settled') console.log(`[charts-trace] accessible table body rows at window close (min over samples): ${tableRows}`)
  const buf = await browser.stopTracing()
  if (minMass < 400) throw new Error(`[charts-trace] ${FW}: min series mass ${minMass} — nothing drawn`)

  type Ev = { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number; cat: string }
  const events = (JSON.parse(buf.toString('utf8')) as { traceEvents: Ev[] }).traceEvents
  const marks = events.filter((e) => e.cat.includes('blink.user_timing') && (e.name === 'cl-w0' || e.name === 'cl-w1')).sort((a, b) => a.ts - b.ts)
  if (marks.length === 0) throw new Error('[charts-trace] no cl-w0/cl-w1 marks in the trace')
  const { pid, tid } = marks[0]!
  const main = events.filter((e) => e.pid === pid && e.tid === tid && e.ph === 'X' && typeof e.dur === 'number')
  const windows: [number, number][] = []
  for (let i = 0; i + 1 < marks.length; i++) if (marks[i]!.name === 'cl-w0' && marks[i + 1]!.name === 'cl-w1') windows.push([marks[i]!.ts, marks[i + 1]!.ts])
  if (windows.length !== K) throw new Error(`[charts-trace] expected ${K} windows, found ${windows.length}`)

  const totals = new Map<string, number>()
  let windowSum = 0
  for (const [w0, w1] of windows) {
    windowSum += w1 - w0
    // Clip events to the window, then compute self time by nesting.
    const inWin = main
      .map((e) => ({ name: e.name, s: Math.max(e.ts, w0), e: Math.min(e.ts + e.dur!, w1) }))
      .filter((e) => e.e > e.s)
      .sort((a, b) => a.s - b.s || b.e - a.e)
    const stack: { name: string; e: number; self: number }[] = []
    const flush = (x: { name: string; self: number }) => totals.set(bucketOf(x.name), (totals.get(bucketOf(x.name)) ?? 0) + x.self)
    let covered = 0
    for (const ev of inWin) {
      while (stack.length && stack.at(-1)!.e <= ev.s) flush(stack.pop()!)
      const parent = stack.at(-1)
      if (parent) parent.self -= ev.e - ev.s
      else covered += ev.e - ev.s
      stack.push({ name: ev.name, e: ev.e, self: ev.e - ev.s })
    }
    while (stack.length) flush(stack.pop()!)
    totals.set('untraced', (totals.get('untraced') ?? 0) + (w1 - w0 - covered))
  }
  const ms = (us: number): string => (us / 1000 / K).toFixed(3).padStart(8)
  const idle = totals.get('untraced') ?? 0
  console.log(`[charts-trace] BUSY main-thread time per window (window − untraced idle): ${ms(windowSum - idle).trim()}ms`)
  console.log(`\n=== ${FW} · ${OP} ${N.toLocaleString('en')} · ${K} traced windows · mean window ${ms(windowSum).trim()}ms (tracing overhead included) ===`)
  const rows = [...totals].sort((a, b) => b[1] - a[1])
  const merged = new Map<string, number>()
  for (const [k, v] of rows) {
    const top = k.startsWith('other:') && v / windowSum < 0.01 ? 'other (<1% each)' : k
    merged.set(top, (merged.get(top) ?? 0) + v)
  }
  for (const [k, v] of [...merged].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(34)} ${ms(v)}ms  ${((v / windowSum) * 100).toFixed(1).padStart(5)}%`)
  }
} finally {
  await browser.close()
  preview.kill()
}
