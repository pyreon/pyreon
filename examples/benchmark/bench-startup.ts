#!/usr/bin/env bun
/**
 * Cross-framework STARTUP + SIZE benchmark — krausest's Lighthouse-derived
 * startup family and its separate size family.
 *
 * Our published suite had NO startup metric of any kind. This adds them using
 * krausest's own definitions and, for the two that matter most, krausest's own
 * measurement tool (real Lighthouse audits) rather than a reimplementation.
 *
 * ## What krausest actually defines — and where our own skill doc is wrong
 *
 * Fetched from master 2026-08-18. There are TWO families, not one:
 *
 * `webdriver-ts/src/benchmarksLighthouse.ts` — STARTUP:
 *   31_startup-ci              "consistently interactive"   audit `interactive`
 *   32_startup-bt              "script bootup time"         audit `bootup-time`
 *   33_startup-mainthreadcost  "main thread work cost"      audit `mainthread-work-breakdown`
 *   34_startup-interactive     "interactive"                audit `interactive`  (same property as 31)
 *
 * `webdriver-ts/src/benchmarksSize.ts` — SIZE (`40_sizes`), a DIFFERENT family:
 *   41_size-uncompressed  "uncompressed size of all implementation files (excluding /css and http headers)"
 *   42_size-compressed    "BROTLI compressed size of all implementation files"
 *   43_first-paint        `performance.getEntriesByType('paint')`
 *
 * Our benchmark skill says krausest has "three startup metrics (script bootup,
 * main-thread work, transfer size)". Two corrections follow from the source:
 * transfer size is NOT a startup metric upstream, and it is **brotli**, not the
 * gzip our `bench-bundle.ts` reports. There is also a `first-paint` metric the
 * skill does not mention, and a fourth startup entry (interactive).
 *
 * ## Fidelity notes
 *
 *  - Lighthouse is invoked exactly as krausest invokes it: `lighthouse(url,
 *    { onlyCategories: ['performance'], port }, null)`. The `null` config is
 *    load-bearing — it selects Lighthouse's DEFAULT settings, i.e. mobile form
 *    factor, `throttlingMethod: 'simulate'` and `cpuSlowdownMultiplier: 4`.
 *    Verified at runtime, not assumed: the harness reads the settings back out
 *    of the report and prints them, and refuses to run if the CPU multiplier
 *    ever stops being 4.
 *  - Values are `audits[property].numericValue` — krausest's `extractRawValue`.
 *  - The browser binary is the SAME Chromium the memory bench drives
 *    (Playwright's `chromium` channel), so the two benches are not comparing
 *    across engines.
 *
 * ## Two honest limitations of the numbers this prints
 *
 *  1. **`first-paint` / `interactive` are NOT comparable to krausest's.** Our
 *     page shell carries a static paint anchor (see `src/startup/index.html`),
 *     so FCP is gated by document parse, not by the framework. Reported, but
 *     flagged, and never ranked.
 *  2. **Size here is the app, not hello-world.** Every build carries the same
 *     row-model impl and the same shell, so the DELTAS are the signal and the
 *     absolutes overstate a minimal app for everyone equally — the same
 *     caveat `bench-bundle.ts` carries.
 *
 * Usage:
 *   bun bench-startup.ts                      # 3 Lighthouse passes per framework
 *   bun bench-startup.ts --repeat 5
 *   bun bench-startup.ts --json out.json
 *   bun bench-startup.ts --skip-build
 */
import { writeFileSync } from 'node:fs'
import * as os from 'node:os'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import { chromium } from 'playwright'
import {
  buildAll,
  loadAvg1,
  measureAssets,
  startPreview,
  TARGETS,
  verifyServedArms,
  DIST_ROOT,
  type AssetSizes,
} from './startup-build'
import { join } from 'node:path'

const PORT = 4180

/** krausest's startup audits. `property` is the Lighthouse audit id. */
const STARTUP_AUDITS = [
  // MEASURED AND REPORTED, BUT DEAD AT THIS APP SIZE — see `SCRIPT_BOOTUP_NOTE`.
  { id: '32_startup-bt', label: 'script bootup time (krausest)', property: 'bootup-time', rank: false },
  {
    id: '33_startup-mainthreadcost',
    label: 'main thread work cost',
    property: 'mainthread-work-breakdown',
    rank: true,
  },
  // Reported for completeness (krausest has it twice, 31 and 34, on the same
  // property) but NOT ranked — see the header: our shell paints statically.
  { id: '31/34_startup-interactive', label: 'interactive (see caveat)', property: 'interactive', rank: false },
] as const

/**
 * Lighthouse's `bootup-time` audit drops any script whose total work is under
 * `THRESHOLD_IN_MS = 50` before summing. Every framework in this suite — React
 * included, at 187 KB uncompressed — boots in well under 50ms even with
 * Lighthouse's 4x CPU throttling, so the audit's `details.items` comes back
 * EMPTY and `numericValue` is 0 for all eight.
 *
 * That is a real property of the metric at this app size, not a harness fault,
 * and it is why the row is reported but NOT ranked: a metric that reads
 * exactly 0 for every entrant ranks nothing. Verified directly — `items: []`
 * for both React and Pyreon.
 *
 * The quantity krausest's label describes ("the total ms required to
 * parse/compile/evaluate all the page's scripts") is still available, without
 * the threshold, from the OTHER audit's trace grouping:
 * `scriptEvaluation + scriptParseCompile` in
 * `mainthread-work-breakdown.details.items`. That derived figure IS ranked,
 * and is labelled as our derivation rather than as krausest's number.
 *
 * `FRAMEWORK_GROUPS` below names the two trace groups that constitute it.
 */
const FRAMEWORK_GROUPS = ['scriptEvaluation', 'scriptParseCompile'] as const

interface CliArgs {
  repeat: number
  jsonOut: string | undefined
  frameworks: readonly string[]
  skipBuild: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    repeat: 3,
    jsonOut: undefined,
    frameworks: TARGETS.map((t) => t.name),
    skipBuild: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repeat' && argv[i + 1]) {
      const v = Number(argv[++i])
      if (Number.isInteger(v) && v >= 1 && v <= 20) args.repeat = v
    } else if (a === '--json' && argv[i + 1]) {
      args.jsonOut = argv[++i]
    } else if (a === '--skip-build') {
      args.skipBuild = true
    } else if (a === '--frameworks' && argv[i + 1]) {
      const next = argv[++i]
      if (next) {
        const requested = next.split(',').map((s) => s.trim())
        const filtered = TARGETS.map((t) => t.name).filter((f) => requested.includes(f))
        if (filtered.length > 0) args.frameworks = filtered
      }
    }
  }
  return args
}

function shuffled<T>(input: readonly T[]): T[] {
  const out = [...input]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = out[i]
    const b = out[j]
    if (a === undefined || b === undefined) continue
    out[i] = b
    out[j] = a
  }
  return out
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) * 0.5)] ?? 0
}

function ci95(xs: readonly number[]): [number, number] {
  if (xs.length < 2) return [xs[0] ?? 0, xs[0] ?? 0]
  const medians: number[] = []
  for (let b = 0; b < 1000; b++) {
    const rs: number[] = []
    for (let i = 0; i < xs.length; i++) rs.push(xs[Math.floor(Math.random() * xs.length)] ?? 0)
    medians.push(median(rs))
  }
  medians.sort((a, b) => a - b)
  return [
    medians[Math.floor((medians.length - 1) * 0.025)] ?? 0,
    medians[Math.floor((medians.length - 1) * 0.975)] ?? 0,
  ]
}

function cv(xs: readonly number[]): number {
  if (xs.length < 2) return 0
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  if (mean === 0) return 0
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1))
  return sd / mean
}

/** CI95 intervals overlap ⇒ the two medians are a statistical tie. */
function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1]
}

interface LhRun {
  audits: Record<string, number>
  /** mainthread-work-breakdown group -> ms. Unthresholded, unlike bootup-time. */
  groups: Record<string, number>
  totalByteWeight: number
  cpuSlowdownMultiplier: number
  throttlingMethod: string
  formFactor: string
}

/**
 * One Lighthouse pass against one framework's isolated build.
 *
 * A fresh Chrome per pass — krausest launches per framework, and reusing one
 * would let an earlier framework's compilation cache and heap state ride into
 * the next framework's bootup number, which is precisely the quantity being
 * measured.
 */
async function runLighthouse(url: string, chromePath: string): Promise<LhRun> {
  const chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: [
      '--headless',
      '--no-sandbox',
      '--no-first-run',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-translate',
      '--disable-sync',
      '--disable-extensions',
      '--disable-default-apps',
    ],
  })
  try {
    // `null` config === krausest. Do NOT pass a config object here: it would
    // silently change the throttling model and make these numbers
    // incomparable to the upstream board they are named after.
    const res = (await (lighthouse as unknown as (
      u: string,
      o: unknown,
      c: unknown,
    ) => Promise<{ lhr: Record<string, never> }>)(
      url,
      { onlyCategories: ['performance'], port: chrome.port, logLevel: 'error' },
      null,
    )) as unknown as { lhr: LighthouseReport }

    const lhr = res.lhr
    if (lhr.runtimeError) {
      throw new Error(`lighthouse runtimeError: ${lhr.runtimeError.code} — ${lhr.runtimeError.message}`)
    }
    const audits: Record<string, number> = {}
    for (const a of STARTUP_AUDITS) {
      const v = lhr.audits[a.property]?.numericValue
      if (typeof v !== 'number') {
        throw new Error(
          `audit '${a.property}' produced no numericValue (${lhr.audits[a.property]?.errorMessage ?? 'no error message'})`,
        )
      }
      audits[a.property] = v
    }
    // Unthresholded per-group main-thread time. This is where the real
    // script bootup number lives (see SCRIPT_BOOTUP_NOTE above) AND where the
    // framework-vs-browser decomposition comes from.
    const groups: Record<string, number> = {}
    for (const it of lhr.audits['mainthread-work-breakdown']?.details?.items ?? []) {
      if (typeof it.group === 'string' && typeof it.duration === 'number') {
        groups[it.group] = (groups[it.group] ?? 0) + it.duration
      }
    }

    const tbw = lhr.audits['total-byte-weight']?.numericValue
    return {
      audits,
      groups,
      totalByteWeight: typeof tbw === 'number' ? tbw : Number.NaN,
      cpuSlowdownMultiplier: lhr.configSettings.throttling.cpuSlowdownMultiplier,
      throttlingMethod: lhr.configSettings.throttlingMethod,
      formFactor: lhr.configSettings.formFactor,
    }
  } finally {
    await chrome.kill()
  }
}

interface LighthouseReport {
  audits: Record<
    string,
    | {
        numericValue?: number
        errorMessage?: string
        details?: { items?: Array<{ group?: string; duration?: number }> }
      }
    | undefined
  >
  runtimeError?: { code: string; message: string }
  configSettings: {
    throttling: { cpuSlowdownMultiplier: number }
    throttlingMethod: string
    formFactor: string
  }
}

const KB = 1024

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const targets = TARGETS.filter((t) => args.frameworks.includes(t.name))

  if (!args.skipBuild) buildAll(targets)
  const sizes = new Map<string, AssetSizes>()
  for (const t of targets) sizes.set(t.name, measureAssets(join(DIST_ROOT, t.slug)))

  const loadBefore = loadAvg1()
  console.log(
    `[bench-startup] machine: ${os.cpus()[0]?.model ?? '?'} · ${os.cpus().length} threads · ` +
      `1-min load ${loadBefore.toFixed(2)}`,
  )
  if (loadBefore > 8) {
    console.log(
      `[bench-startup] WARNING: 1-min load ${loadBefore.toFixed(2)} > 8 — do NOT publish this run.`,
    )
  }

  // Same binary as bench-memory: Playwright's 'chromium' channel.
  const probe = await chromium.launch({ channel: 'chromium' })
  const chromePath = probe.browserType().executablePath({ channel: 'chromium' } as never)
  await probe.close()

  const server = await startPreview(PORT)
  // Prove we are measuring the bytes this process built, before measuring
  // anything. Guarded so a mismatch cannot strand the preview server on its
  // port — a leaked server is exactly the stale-arm hazard this check exists
  // to catch, and it would make the NEXT run fail on --strictPort instead.
  try {
    await verifyServedArms(server.baseUrl, targets)
  } catch (err) {
    server.stop()
    throw err
  }

  const lhSamples = new Map<string, Map<string, number[]>>()
  const tbwSamples = new Map<string, number[]>()
  /** framework -> trace group -> per-pass ms. */
  const groupSamples = new Map<string, Map<string, number[]>>()
  for (const t of targets) {
    lhSamples.set(t.name, new Map(STARTUP_AUDITS.map((a) => [a.property, [] as number[]])))
    tbwSamples.set(t.name, [])
    groupSamples.set(t.name, new Map())
  }
  let settings: { cpu: number; method: string; formFactor: string } | null = null

  try {
    for (let pass = 0; pass < args.repeat; pass++) {
      const order = shuffled(targets)
      console.log(
        `[bench-startup] pass ${pass + 1}/${args.repeat} order: ${order.map((t) => t.name).join(' → ')}`,
      )
      for (const t of order) {
        const run = await runLighthouse(`${server.baseUrl}/${t.slug}/index.html`, chromePath)
        if (!settings) {
          settings = {
            cpu: run.cpuSlowdownMultiplier,
            method: run.throttlingMethod,
            formFactor: run.formFactor,
          }
          console.log(
            `[bench-startup] lighthouse settings: formFactor=${settings.formFactor} · ` +
              `throttlingMethod=${settings.method} · cpuSlowdownMultiplier=${settings.cpu}`,
          )
          // Guard the fidelity claim rather than asserting it in a comment:
          // krausest's numbers come from the default 4x-CPU simulate profile,
          // so if a Lighthouse upgrade changes the default, these stop being
          // comparable and the run should fail rather than quietly diverge.
          if (settings.cpu !== 4 || settings.method !== 'simulate') {
            throw new Error(
              `Lighthouse defaults changed (cpu=${settings.cpu}, method=${settings.method}). ` +
                `krausest's startup numbers assume cpuSlowdownMultiplier=4 + simulate; these ` +
                `results would not be comparable. Refusing to continue.`,
            )
          }
        }
        for (const a of STARTUP_AUDITS) {
          lhSamples.get(t.name)?.get(a.property)?.push(run.audits[a.property] ?? Number.NaN)
        }
        if (Number.isFinite(run.totalByteWeight)) tbwSamples.get(t.name)?.push(run.totalByteWeight)
        const gm = groupSamples.get(t.name)
        if (gm) {
          for (const [g, ms] of Object.entries(run.groups)) {
            if (!gm.has(g)) gm.set(g, [])
            gm.get(g)?.push(ms)
          }
        }
      }
    }
  } finally {
    server.stop()
  }

  const loadAfter = loadAvg1()

  // ── startup table ─────────────────────────────────────────────────────────
  console.log(
    `\nkrausest STARTUP metrics — Lighthouse default profile ` +
      `(mobile · simulate · 4x CPU), ${args.repeat} passes, median ms`,
  )
  console.log('─'.repeat(108))
  const nameW = 26
  console.log('metric'.padEnd(nameW) + targets.map((t) => t.name.padStart(11)).join(''))

  const startupRows: Record<string, Record<string, { median: number; ci95: [number, number]; cv: number }>> = {}
  for (const a of STARTUP_AUDITS) {
    startupRows[a.id] = {}
    let line = (a.label + (a.rank ? '' : ' ‡')).padEnd(nameW)
    for (const t of targets) {
      const s = lhSamples.get(t.name)?.get(a.property) ?? []
      const cell = { median: median(s), ci95: ci95(s), cv: cv(s) }
      startupRows[a.id]![t.name] = cell
      line += cell.median.toFixed(1).padStart(11)
    }
    console.log(line)
  }

  // ── derived script bootup + framework-vs-browser decomposition ───────────
  //
  // The prompt every new metric in this repo has to answer: how much of this
  // number is FRAMEWORK work? Lighthouse's own trace grouping answers it
  // directly, so it is printed rather than left for the reader to assume.
  const groupMedian = (fw: string, g: string): number =>
    median(groupSamples.get(fw)?.get(g) ?? [])
  const derivedBootup = (fw: string): number =>
    FRAMEWORK_GROUPS.reduce((sum, g) => sum + groupMedian(fw, g), 0)

  console.log(
    `\nscript bootup, DERIVED (scriptEvaluation + scriptParseCompile, unthresholded) — median ms`,
  )
  console.log('─'.repeat(108))
  {
    let line = 'derived script bootup'.padEnd(nameW)
    for (const t of targets) line += derivedBootup(t.name).toFixed(1).padStart(11)
    console.log(line)
  }

  console.log(`\nWhat IS 'main thread work cost'? — median ms per Lighthouse trace group`)
  console.log('─'.repeat(108))
  const allGroups = [
    ...new Set(targets.flatMap((t) => [...(groupSamples.get(t.name)?.keys() ?? [])])),
  ].sort()
  console.log('group'.padEnd(nameW) + targets.map((t) => t.name.padStart(11)).join(''))
  for (const g of allGroups) {
    let line = (FRAMEWORK_GROUPS.includes(g as never) ? `${g} *` : g).padEnd(nameW)
    for (const t of targets) line += groupMedian(t.name, g).toFixed(1).padStart(11)
    console.log(line)
  }
  {
    let line = 'framework share *'.padEnd(nameW)
    for (const t of targets) {
      const total = allGroups.reduce((s2, g) => s2 + groupMedian(t.name, g), 0)
      const share = total > 0 ? (derivedBootup(t.name) / total) * 100 : 0
      line += `${share.toFixed(0)}%`.padStart(11)
    }
    console.log(line)
  }
  console.log(
    `\n* = the framework's OWN work. Everything else in that table is browser work —\n` +
      `  'other' (Chromium internals), Style & Layout, Rendering, Parse HTML & CSS —\n` +
      `  which is broadly constant across frameworks. Read the framework share before\n` +
      `  quoting a 'main thread work cost' ratio: a 2x difference in framework work is\n` +
      `  diluted to a much smaller difference in the headline metric. This repo has twice\n` +
      `  published numbers that turned out to be mostly Chromium layout; this row exists\n` +
      `  so that cannot happen again here.`,
  )

  // ── size table ────────────────────────────────────────────────────────────
  console.log(`\nkrausest SIZE metrics (\`40_sizes\`) — per-framework isolated production build`)
  console.log('─'.repeat(108))
  console.log('metric'.padEnd(nameW) + targets.map((t) => t.name.padStart(11)).join(''))
  const sizeRow = (label: string, pick: (s: AssetSizes) => number): void => {
    let line = label.padEnd(nameW)
    for (const t of targets) line += (pick(sizes.get(t.name)!) / KB).toFixed(1).padStart(11)
    console.log(line)
  }
  sizeRow('41 uncompressed KB', (s) => s.raw)
  sizeRow('42 compressed KB (brotli)', (s) => s.brotli)
  sizeRow('— gzip KB (not krausest)', (s) => s.gzip)
  {
    let line = 'transferred KB (LH)'.padEnd(nameW)
    for (const t of targets) {
      const s = tbwSamples.get(t.name) ?? []
      line += (median(s) / KB).toFixed(1).padStart(11)
    }
    console.log(line)
  }

  // ── verdicts ──────────────────────────────────────────────────────────────
  console.log(`\nVerdicts — ranked metrics only (lower is better; 🤝 = CI95 overlap with the leader)`)
  console.log('─'.repeat(108))
  for (const a of STARTUP_AUDITS) {
    if (!a.rank) continue
    const cells = targets.map((t) => ({ name: t.name, ...startupRows[a.id]![t.name]! }))
    const best = cells.reduce((m, c) => (c.median < m.median ? c : m))
    const tied = cells.filter((c) => c.name !== best.name && overlaps(c.ci95, best.ci95))
    const pyreon = cells.find((c) => c.name === 'Pyreon')
    const rank = [...cells].sort((x, y) => x.median - y.median).findIndex((c) => c.name === 'Pyreon') + 1
    console.log(
      `  ${a.label.padEnd(24)} leader ${best.name} ${best.median.toFixed(1)}ms` +
        (tied.length ? `  🤝 tied: ${tied.map((c) => c.name).join(', ')}` : '') +
        (pyreon ? `  · Pyreon ${pyreon.median.toFixed(1)}ms (rank ${rank}/${cells.length})` : ''),
    )
  }
  {
    const cells = targets.map((t) => ({ name: t.name, v: derivedBootup(t.name) }))
    const best = cells.reduce((m, c) => (c.v < m.v ? c : m))
    const rank = [...cells].sort((x, y) => x.v - y.v).findIndex((c) => c.name === 'Pyreon') + 1
    const pyreon = cells.find((c) => c.name === 'Pyreon')
    console.log(
      `  ${'derived script bootup'.padEnd(24)} leader ${best.name} ${best.v.toFixed(1)}ms` +
        (pyreon ? `  · Pyreon ${pyreon.v.toFixed(1)}ms (rank ${rank}/${cells.length})` : ''),
    )
  }
  {
    const cells = targets.map((t) => ({ name: t.name, br: sizes.get(t.name)!.brotli }))
    const best = cells.reduce((m, c) => (c.br < m.br ? c : m))
    const rank = [...cells].sort((x, y) => x.br - y.br).findIndex((c) => c.name === 'Pyreon') + 1
    const pyreon = cells.find((c) => c.name === 'Pyreon')
    console.log(
      `  ${'42 compressed (brotli)'.padEnd(24)} leader ${best.name} ${(best.br / KB).toFixed(1)}KB` +
        (pyreon ? `  · Pyreon ${(pyreon.br / KB).toFixed(1)}KB (rank ${rank}/${cells.length})` : ''),
    )
  }

  // ── dispersion ────────────────────────────────────────────────────────────
  console.log(`\nCI95 / CV per startup cell`)
  console.log('─'.repeat(108))
  for (const a of STARTUP_AUDITS) {
    for (const t of targets) {
      const c = startupRows[a.id]![t.name]!
      console.log(
        `  ${a.id.padEnd(26)} ${t.name.padEnd(11)} median ${c.median.toFixed(1)}ms  ` +
          `CI95 [${c.ci95[0].toFixed(1)}, ${c.ci95[1].toFixed(1)}]  CV ${(c.cv * 100).toFixed(1)}%`,
      )
    }
  }

  console.log(
    `\n‡ = reported but NOT ranked: our page shell carries a static paint anchor, so FCP/TTI are\n` +
      `  gated by document parse rather than by the framework. Not comparable to krausest's.\n` +
      `\nRECONCILIATION with bench-bundle.ts: that bench builds a KEEP-REFERENCE entry (code is\n` +
      `retained but never runs) and reports gzip -9; this one builds an EXECUTING entry (startup\n` +
      `metrics are parse + compile + EVALUATE, so a non-executing entry would report ~0 bootup for\n` +
      `everyone) and reports brotli -11 to match krausest. The '— gzip KB' row above is the\n` +
      `apples-to-apples column against bench-bundle; any residual delta is the shell + the mount\n` +
      `call the executing entry adds.`,
  )

  console.log(
    `\n[bench-startup] 1-min load before ${loadBefore.toFixed(2)} → after ${loadAfter.toFixed(2)}` +
      (Math.max(loadBefore, loadAfter) > 8 ? '  ← ABOVE 8: do not publish these numbers' : ''),
  )

  if (args.jsonOut) {
    writeFileSync(
      args.jsonOut,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          machine: { cpu: os.cpus()[0]?.model, threads: os.cpus().length },
          load: { before: loadBefore, after: loadAfter },
          repeat: args.repeat,
          lighthouseSettings: settings,
          startup: startupRows,
          sizes: Object.fromEntries([...sizes].map(([k, v]) => [k, v])),
          transferredBytes: Object.fromEntries([...tbwSamples].map(([k, v]) => [k, median(v)])),
          mainthreadGroupsMs: Object.fromEntries(
            [...groupSamples].map(([k, m]) => [k, Object.fromEntries([...m].map(([g, v]) => [g, median(v)]))]),
          ),
          derivedScriptBootupMs: Object.fromEntries(targets.map((t) => [t.name, derivedBootup(t.name)])),
        },
        null,
        2,
      ),
    )
    console.log(`[bench-startup] wrote ${args.jsonOut}`)
  }
}

await main()
