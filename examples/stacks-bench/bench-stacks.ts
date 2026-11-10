#!/usr/bin/env bun
/**
 * Full-stack meta-framework benchmark: the same small app (CONTRACT.md) in
 * @pyreon/zero and each rival stack, each a production build served by the
 * framework's own documented Node server.
 *
 *   bun bench-stacks.ts <stackId…>   measure the listed arms (all when none), one after another,
 *                                    writing results/<id>.json
 *   bun bench-stacks.ts --report     print the comparison tables from results/*.json
 *
 * Per arm, in order:
 *   1. data module drift check + correctness gate (lib/gate.ts) on its own server start;
 *   2. STARTS (default 5) independent server starts, each:
 *        cold start (spawn → first 200 on /items) →
 *        warmup: autocannon -c 50 -d 3 (discarded) →
 *        TTFB: 200 sequential requests on one keep-alive connection (lib/ttfb-client.mjs, own process) →
 *        throughput: autocannon -c 50 -d 10 (own process; no Accept-Encoding) → stop;
 *   3. BSTARTS (default 2) more server starts for the browser, each: one untimed load
 *      (warms the server; on the first start also the script inventory: lib/browser.ts),
 *      then LOADS (default 8) timed first-visit loads (fresh context each).
 * CIs: two-stage cluster bootstrap (examples/benchmark/cluster-bootstrap.ts),
 * clusters = server starts. With one sample per start (rps, p50, p99, cold
 * start) that is the ordinary bootstrap over starts.
 *
 * AUTHOR-JUDGE: written and judged by the Pyreon authors. One app shape (a
 * 100-row list page); every number is FIRST-PASS until reproduced.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import * as os from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { clusterBootstrapCI95, medianOf } from '../benchmark/cluster-bootstrap'
import { type Inventory, inventory, type LoadSample, timedLoad } from './lib/browser'
import { runGate } from './lib/gate'
import {
  assertDataIdentical,
  installedVersions,
  loadStacks,
  portFor,
  ROOT,
  type StackManifest,
  startServer,
} from './lib/stacks'

const STARTS = Number(process.env.STACKS_STARTS ?? 5)
const BSTARTS = Number(process.env.STACKS_BSTARTS ?? 2)
const LOADS = Number(process.env.STACKS_LOADS ?? 8)
const CONNECTIONS = 50
const DURATION_S = Number(process.env.STACKS_DURATION ?? 10)
const WARMUP_S = 3
const TTFB_N = 200
const RESULTS = join(ROOT, 'results')
const AUTOCANNON = join(ROOT, 'node_modules', 'autocannon', 'autocannon.js')
const TTFB_CLIENT = join(ROOT, 'lib', 'ttfb-client.mjs')

interface ArmResult {
  id: string
  label: string
  versions: Record<string, string>
  node: string
  chromium: string
  hydration: StackManifest['hydration']
  streaming: string
  notes: string[]
  docs: string[]
  gateNotes: string[]
  load: { before: number[]; after: number[] }
  wallMs: number
  /** One entry per server start. */
  server: {
    coldStartMs: number
    rps: number
    p50: number
    p99: number
    errors: number
    non2xx: number
    bytesPerReq: number
    ttfb: number[]
    ttlb: number[]
    contentEncoding: string | null
    transferEncoding: string | null
  }[]
  /** One array of loads per (browser) server start. */
  browser: LoadSample[][]
  inventory: Inventory
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (b: Buffer) => (out += b.toString()))
    p.stderr.on('data', (b: Buffer) => (err += b.toString()))
    p.on('exit', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(' ')} → ${code}\n${err}`)),
    )
  })
}

interface Cannon {
  requests: { average: number; total: number }
  latency: { p50: number; p99: number }
  throughput: { total: number }
  errors: number
  non2xx: number
  timeouts: number
}
async function autocannon(url: string, seconds: number): Promise<Cannon> {
  const out = await run('node', [
    AUTOCANNON,
    '-c',
    String(CONNECTIONS),
    '-d',
    String(seconds),
    '-j',
    url,
  ])
  return JSON.parse(out) as Cannon
}

async function measureArm(
  dir: string,
  m: StackManifest,
  chromiumVersion: string,
): Promise<ArmResult> {
  const t0 = performance.now()
  const load = { before: os.loadavg(), after: [] as number[] }
  assertDataIdentical(dir, m)
  const port = portFor(m.id)
  const browser = await chromium.launch()
  const resumable = m.hydration === 'resumable'
  try {
    // 1. correctness gate on its own server start (it mutates state: POST)
    let gateNotes: string[] = []
    {
      const srv = await startServer(dir, m, port)
      try {
        const g = await runGate(m, srv, browser)
        if (!g.ok)
          throw new Error(
            `[stacks-bench] ${m.id} FAILED the correctness gate:\n  ${g.failures.join('\n  ')}`,
          )
        console.log(`  gate ✓${g.notes.length ? `  (${g.notes.join('; ')})` : ''}`)
        gateNotes = g.notes
      } finally {
        await srv.stop()
      }
    }
    // 2. server-side
    const server: ArmResult['server'] = []
    for (let s = 1; s <= STARTS; s++) {
      const srv = await startServer(dir, m, port)
      try {
        const url = `${srv.base}/items`
        // Probe only (not timed): does this server compress when a client ASKS?
        // (The load generators never ask; their bytes/request proves it.)
        const head = await fetch(url, { headers: { 'accept-encoding': 'gzip, deflate, br' } })
        await head.arrayBuffer()
        await autocannon(url, WARMUP_S)
        const t = JSON.parse(await run('node', [TTFB_CLIENT, url, String(TTFB_N)])) as {
          ttfb: number[]
          ttlb: number[]
        }
        const c = await autocannon(url, DURATION_S)
        server.push({
          coldStartMs: srv.coldStartMs,
          rps: c.requests.average,
          p50: c.latency.p50,
          p99: c.latency.p99,
          errors: c.errors + c.timeouts,
          non2xx: c.non2xx,
          bytesPerReq: c.requests.total > 0 ? c.throughput.total / c.requests.total : 0,
          ttfb: t.ttfb,
          ttlb: t.ttlb,
          contentEncoding: head.headers.get('content-encoding'),
          transferEncoding: head.headers.get('transfer-encoding'),
        })
        const last = server[server.length - 1]!
        console.log(
          `  start ${s}/${STARTS}: cold ${srv.coldStartMs.toFixed(0)} ms · ${last.rps.toFixed(0)} req/s · p50 ${last.p50} ms · p99 ${last.p99} ms · TTFB ${medianOf(t.ttfb).toFixed(2)} ms${last.errors || last.non2xx ? ` · ERRORS ${last.errors} non2xx ${last.non2xx}` : ''}`,
        )
      } finally {
        await srv.stop()
      }
    }
    // 3. browser
    const browserRuns: LoadSample[][] = []
    let inv: Inventory | undefined
    for (let s = 1; s <= BSTARTS; s++) {
      const srv = await startServer(dir, m, port)
      try {
        if (!inv) inv = await inventory(browser, srv.base, resumable)
        else await timedLoad(browser, `${srv.base}/items`, resumable) // untimed warm load
        const loads: LoadSample[] = []
        for (let i = 0; i < LOADS; i++)
          loads.push(await timedLoad(browser, `${srv.base}/items`, resumable))
        browserRuns.push(loads)
        console.log(
          `  browser start ${s}/${BSTARTS}: window ${medianOf(loads.map((l) => l.windowMs)).toFixed(1)} ms · script ${medianOf(loads.map((l) => l.scriptMs)).toFixed(1)} ms · layout ${medianOf(loads.map((l) => l.layoutMs)).toFixed(1)} ms · click ${medianOf(loads.map((l) => l.clickMs)).toFixed(2)} ms`,
        )
      } finally {
        await srv.stop()
      }
    }
    load.after = os.loadavg()
    return {
      id: m.id,
      label: m.label,
      versions: installedVersions(dir, m),
      node: process.versions.node ?? (await run('node', ['-v'])).trim(),
      chromium: chromiumVersion,
      hydration: m.hydration,
      streaming: m.streaming,
      notes: m.notes,
      docs: m.docs,
      gateNotes,
      load,
      wallMs: performance.now() - t0,
      server,
      browser: browserRuns,
      inventory: inv as Inventory,
    }
  } finally {
    await browser.close()
  }
}

// ── report ───────────────────────────────────────────────────────────────────

interface Stat {
  med: number
  ci: [number, number]
}
const stat = (clusters: number[][]): Stat => ({
  med: medianOf(clusters.flat()),
  ci: clusterBootstrapCI95(clusters),
})
const f = (x: number, d = 1) => x.toFixed(d)
const fs = (s: Stat, d = 1) => `${f(s.med, d)} [${f(s.ci[0], d)}–${f(s.ci[1], d)}]`
const kb = (b: number) => `${(b / 1024).toFixed(1)}`

interface Row {
  metric: string
  better: 'lower' | 'higher'
  per: Map<string, Stat>
  digits: number
}

function report(): void {
  const results = readdirSync(RESULTS)
    .filter((x) => x.endsWith('.json'))
    .map((x) => JSON.parse(readFileSync(join(RESULTS, x), 'utf8')) as ArmResult)
    .sort((a, b) => (a.id === 'zero' ? -1 : b.id === 'zero' ? 1 : a.id.localeCompare(b.id)))
  if (results.length === 0) throw new Error('no results/*.json — run `bun bench-stacks.ts` first')

  console.log('# Stacks benchmark — FIRST-PASS\n')
  console.log(
    `node ${results[0]!.node} · ${results[0]!.chromium} · ${os.cpus()[0]?.model} × ${os.cpus().length}\n`,
  )
  console.log('## Versions and audit notes\n')
  for (const r of results) {
    console.log(
      `- **${r.label}** (\`${r.id}\`): ${Object.entries(r.versions)
        .map(([k, v]) => `${k} ${v}`)
        .join(' · ')}`,
    )
    console.log(
      `  - hydration: ${r.hydration}; /items: ${r.streaming}; wall ${f(r.wallMs / 1000, 0)} s; load ${r.load.before.map((x) => f(x)).join('/')} → ${r.load.after.map((x) => f(x)).join('/')}`,
    )
    const enc = new Set(r.server.map((s) => s.contentEncoding ?? 'none'))
    const bpr = medianOf(r.server.map((s) => s.bytesPerReq))
    console.log(
      `  - under load (no Accept-Encoding): ${f(bpr, 0)} B/response vs ${r.inventory.html.raw} B raw HTML → ${bpr < r.inventory.html.raw ? 'COMPRESSED' : 'uncompressed'}; when a client asks for gzip/br it answers: ${[...enc].join(', ')}; transfer-encoding: ${[...new Set(r.server.map((s) => s.transferEncoding ?? 'none'))].join(', ')}`,
    )
    const errs = r.server.reduce((a, s) => a + s.errors + s.non2xx, 0)
    if (errs > 0) console.log(`  - ⚠ ${errs} errors / non-2xx responses under load`)
    for (const n of r.gateNotes) console.log(`  - gate note: ${n}`)
  }

  const rows: Row[] = []
  const add = (
    metric: string,
    better: Row['better'],
    digits: number,
    get: (r: ArmResult) => number[][],
  ) => {
    const per = new Map<string, Stat>()
    for (const r of results) {
      const c = get(r)
      if (c.flat().length > 0) per.set(r.id, stat(c))
    }
    rows.push({ metric, better, per, digits })
  }
  add('SSR throughput /items (req/s, c=50)', 'higher', 0, (r) => r.server.map((s) => [s.rps]))
  add('latency p50 under load (ms)', 'lower', 1, (r) => r.server.map((s) => [s.p50]))
  add('latency p99 under load (ms)', 'lower', 1, (r) => r.server.map((s) => [s.p99]))
  add('TTFB, 1 connection (ms)', 'lower', 2, (r) => r.server.map((s) => s.ttfb))
  add('time to last byte, 1 connection (ms)', 'lower', 2, (r) => r.server.map((s) => s.ttlb))
  add('cold start: spawn → first 200 (ms)', 'lower', 0, (r) => r.server.map((s) => [s.coldStartMs]))
  add('hydration window: nav → island ready (ms)', 'lower', 1, (r) =>
    r.hydration === 'resumable' ? [] : r.browser.map((b) => b.map((l) => l.windowMs)),
  )
  add('main-thread script in window (ms)', 'lower', 1, (r) =>
    r.browser.map((b) => b.map((l) => l.scriptMs)),
  )
  add('main-thread layout+paint in window (ms)', 'lower', 1, (r) =>
    r.browser.map((b) => b.map((l) => l.layoutMs)),
  )
  add('first click → DOM change (ms)', 'lower', 2, (r) =>
    r.browser.map((b) => b.map((l) => l.clickMs)),
  )

  const ids = results.map((r) => r.id)
  console.log('\n## Timed rows (median [cluster-bootstrap CI95])\n')
  console.log(`| metric | ${ids.join(' | ')} |`)
  console.log(`| --- | ${ids.map(() => '---:').join(' | ')} |`)
  for (const row of rows) {
    console.log(
      `| ${row.metric} | ${ids.map((id) => (row.per.has(id) ? fs(row.per.get(id)!, row.digits) : 'n/a')).join(' | ')} |`,
    )
  }

  console.log('\n## Bytes\n')
  console.log(`| | ${ids.join(' | ')} |`)
  console.log(`| --- | ${ids.map(() => '---:').join(' | ')} |`)
  const inv = (g: (i: Inventory) => string) =>
    ids.map((id) => g(results.find((r) => r.id === id)!.inventory)).join(' | ')
  console.log(
    `| /items HTML raw / gzip / br (KB) | ${inv((i) => `${kb(i.html.raw)} / ${kb(i.html.gzip)} / ${kb(i.html.brotli)}`)} |`,
  )
  console.log(`| inline <script> in HTML (KB raw) | ${inv((i) => kb(i.html.inlineScriptBytes))} |`)
  console.log(`| first-load JS files | ${inv((i) => String(i.totals.count))} |`)
  console.log(
    `| first-load JS raw / gzip / br (KB) | ${inv((i) => `${kb(i.totals.raw)} / ${kb(i.totals.gzip)} / ${kb(i.totals.brotli)}`)} |`,
  )
  const execBr = (i: Inventory) =>
    i.scripts.filter((s) => s.executed).reduce((a, s) => a + s.brotli, 0)
  console.log(`| of which executed during load (KB br) | ${inv((i) => kb(execBr(i)))} |`)
  console.log(`| requests during load | ${inv((i) => String(i.requests))} |`)

  // Pyreon vs best rival per row
  console.log('\n## @pyreon/zero vs the best rival per row\n')
  console.log(
    '| metric | zero | best rival | ratio (rival-relative, >1 = zero worse) | CI-disjoint |',
  )
  console.log('| --- | ---: | --- | ---: | --- |')
  const vs = (
    metric: string,
    better: Row['better'],
    per: Map<string, Stat>,
    digits: number,
    exact = false,
  ) => {
    const z = per.get('zero')
    const rivals = [...per.entries()].filter(([id]) => id !== 'zero')
    if (!z || rivals.length === 0) return
    const best = rivals.sort((a, b) =>
      better === 'lower' ? a[1].med - b[1].med : b[1].med - a[1].med,
    )[0]!
    const ratio = better === 'lower' ? z.med / best[1].med : best[1].med / z.med
    const disjoint = z.ci[1] < best[1].ci[0] || best[1].ci[1] < z.ci[0]
    if (exact) {
      console.log(
        `| ${metric} | ${f(z.med, digits)} | ${best[0]} ${f(best[1].med, digits)} | ${f(ratio, 2)} | exact (deterministic bytes) |`,
      )
      return
    }
    console.log(
      `| ${metric} | ${fs(z, digits)} | ${best[0]} ${fs(best[1], digits)} | ${f(ratio, 2)} | ${disjoint ? 'yes' : 'no (tie)'} |`,
    )
  }
  for (const row of rows) vs(row.metric, row.better, row.per, row.digits)
  const byteRow = (metric: string, g: (i: Inventory) => number) => {
    const per = new Map<string, Stat>()
    for (const r of results)
      per.set(r.id, { med: g(r.inventory), ci: [g(r.inventory), g(r.inventory)] })
    vs(metric, 'lower', per, 1, true)
  }
  byteRow('/items HTML (KB br)', (i) => i.html.brotli / 1024)
  byteRow('first-load JS (KB br)', (i) => i.totals.brotli / 1024)
  byteRow('first-load JS (KB gzip)', (i) => i.totals.gzip / 1024)

  console.log('\n## Script inventory\n')
  for (const r of results) {
    console.log(
      `- ${r.id}: ${r.inventory.scripts.map((s) => `${s.url.split('/').pop()} (${s.how}${s.executed ? ', executed' : ''}, ${kb(s.brotli)} KB br)`).join(', ')}`,
    )
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

if (process.argv.includes('--report')) {
  report()
  process.exit(0)
}
if (!existsSync(AUTOCANNON))
  throw new Error(`autocannon not found at ${AUTOCANNON} — run bun install at the repo root`)
mkdirSync(RESULTS, { recursive: true })
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const stacks = loadStacks(ids)
const cv = await chromium.launch().then(async (b) => {
  const v = b.version()
  await b.close()
  return `Chromium ${v}`
})
console.log(
  `[bench-stacks] ${stacks.map((s) => s.m.id).join(', ')} · node ${process.versions.node} (servers: ${(await run('node', ['-v'])).trim()}) · ${cv} · starts ${STARTS} × (${WARMUP_S}s warmup + ${DURATION_S}s @ c=${CONNECTIONS}), browser ${BSTARTS} × ${LOADS} loads · load ${os
    .loadavg()
    .map((x) => x.toFixed(1))
    .join('/')}`,
)
for (const { dir, m } of stacks) {
  if (m.skip) {
    console.log(`- ${m.id}: SKIPPED (${m.skip})`)
    continue
  }
  console.log(`▸ ${m.label}`)
  const r = await measureArm(dir, m, cv)
  r.node = (await run('node', ['-v'])).trim()
  writeFileSync(join(RESULTS, `${m.id}.json`), JSON.stringify(r, null, 1))
  console.log(`  wall ${(r.wallMs / 1000).toFixed(0)} s → results/${m.id}.json`)
}
