/**
 * The browser verify runner — the half of verification the Node pipeline is
 * FORBIDDEN to claim.
 *
 * The scan's module loader compiles through Vite's SSR transform, and its own
 * contract (see `discover/load.ts`) says a check on that loader must never
 * claim a reactivity verdict — the h() lowering and the browser's `_tpl()`
 * template path are KNOWN to diverge on reactivity. So `reactivityCoverage`
 * and `snapshot` stayed honest stubs until something ran the REAL client build
 * in a REAL browser. This is that something:
 *
 *   1. boots `atlas dev` (the real workbench, real compiler, real browser
 *      module graph),
 *   2. drives every derived scenario THROUGH THE WORKBENCH MODEL (the bridge
 *      the entry exposes — no DOM scripting, no selector guessing),
 *   3. measures reactive coverage with the PAGE's own
 *      `@pyreon/reactivity/coverage` (same instances the components run on),
 *   4. screenshots the preview and compares against a per-scenario baseline
 *      (pixelmatch, tolerance-based — byte equality would false-fail on
 *      antialiasing),
 *   5. merges both verdicts into `atlas-catalog.json`, recomputing
 *      `ok`/`checked` with the registry's own derivation rules.
 *
 * Playwright is an OPTIONAL peer resolved dynamically: `atlas scan` and
 * `atlas dev` must keep working in a project that has no browser automation
 * installed, and this command tells you exactly what to install when missing.
 *
 * ## What each verdict CLAIMS
 *
 * `reactivityCoverage` is a MEASUREMENT, not a threshold gate: pass means
 * "measured", and the findings carry the numbers (percent, nodes that never
 * re-fired). A threshold would fail correct static components; the numbers let
 * a human (or a configured gate later) judge. It FAILS only when measurement
 * itself errored, and SKIPS when the dev build exposes no registry.
 *
 * `snapshot` passes when the preview matches the stored baseline within
 * tolerance, CREATES the baseline on first run (pass, with a finding saying
 * so — a created baseline is not a verified one), and fails on a real visual
 * diff, writing the actual next to the baseline for eyeballing.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CheckStatus, VerifyCheck, VerifyVerdict } from '../core'

export interface BrowserVerifyOptions {
  cwd?: string
  /** Directory to scan, relative to cwd (default `src`). */
  dir?: string
  /** Where baselines live, relative to cwd (default `atlas-snapshots`). */
  snapshotDir?: string
  /** Max fraction of differing pixels before a snapshot FAILS (default 0.01). */
  maxDiffPixelRatio?: number
  /** Overwrite every stored baseline with the current render (re-baseline). */
  updateSnapshots?: boolean
  port?: number
}

export interface ScenarioBrowserResult {
  id: string
  reactivityCoverage: VerifyCheck
  snapshot: VerifyCheck
}

export interface BrowserVerifySummary {
  scenarios: number
  snapshotsCreated: number
  snapshotsFailed: number
  coverageMeasured: number
  /**
   * Catalog scenarios the workbench could not drive — components living in
   * workbench-HOST files (they import `@pyreon/atlas`, so the dev nav filters
   * them out). Their browser verdicts stay `skip`; listed so a "26 of 43"
   * run is legible instead of silently partial.
   */
  notDriven: string[]
  catalogPath?: string
}

/** The workbench catalog shape the bridge exposes (subset the runner reads). */
interface PageCatalog {
  components: { id: string; name: string; scenarios?: { id: string }[] }[]
}

/**
 * Merge browser verdicts into a scenario's existing verify verdict,
 * recomputing `checked`/`ok` exactly the way the pipeline registry does — a
 * second derivation rule would drift.
 */
export function mergeBrowserVerdict(
  verify: VerifyVerdict | undefined,
  result: Pick<ScenarioBrowserResult, 'reactivityCoverage' | 'snapshot'>,
): VerifyVerdict {
  const SKIP: VerifyCheck = { status: 'skip' }
  const next: VerifyVerdict = {
    ok: false,
    checked: 0,
    a11y: verify?.a11y ?? SKIP,
    interaction: verify?.interaction ?? SKIP,
    reactivityCoverage: result.reactivityCoverage,
    leak: verify?.leak ?? SKIP,
    // Carried through, not recomputed: parity is a NODE-side verdict and the
    // browser pass has nothing to say about it. Dropping it here would let a
    // `verify-browser` run silently erase a real failure the scan found.
    ssrParity: verify?.ssrParity ?? SKIP,
    snapshot: result.snapshot,
  }
  const keys = ['a11y', 'interaction', 'reactivityCoverage', 'leak', 'snapshot'] as const
  const statuses: CheckStatus[] = keys.map((k) => next[k].status)
  next.checked = statuses.filter((s) => s !== 'skip').length
  next.ok = next.checked > 0 && !statuses.includes('fail')
  return next
}

/** Compare two PNG buffers; returns the differing-pixel fraction. */
export function diffPngs(
  a: Buffer,
  b: Buffer,
  deps: {
    PNG: { sync: { read(buf: Buffer): { width: number; height: number; data: Buffer } } }
    pixelmatch: (
      a: Buffer,
      b: Buffer,
      out: Buffer | null,
      w: number,
      h: number,
      opts: { threshold: number },
    ) => number
  },
): number {
  const imgA = deps.PNG.sync.read(a)
  const imgB = deps.PNG.sync.read(b)
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) return 1
  const diff = deps.pixelmatch(imgA.data, imgB.data, null, imgA.width, imgA.height, {
    threshold: 0.1,
  })
  return diff / (imgA.width * imgA.height)
}

export async function runBrowserVerify(
  options: BrowserVerifyOptions = {},
): Promise<BrowserVerifySummary> {
  const cwd = options.cwd ?? '.'
  const snapshotDir = join(cwd, options.snapshotDir ?? 'atlas-snapshots')
  const maxRatio = options.maxDiffPixelRatio ?? 0.01

  // Optional peers, resolved up front so the failure is one actionable
  // message, not a stack trace mid-run.
  let chromium: {
    launch(): Promise<{
      newPage(): Promise<PageLike>
      close(): Promise<void>
    }>
  }
  try {
    const pw = (await import('playwright-core')) as unknown as { chromium: typeof chromium }
    chromium = pw.chromium
  } catch {
    throw new Error(
      '[Pyreon] atlas verify-browser needs Playwright:\n\n    bun add -d playwright-core && bunx playwright-core install chromium\n\n  (`playwright` works too.) `atlas scan` keeps working without it.',
    )
  }
  const { default: pixelmatch } = (await import('pixelmatch')) as unknown as {
    default: Parameters<typeof diffPngs>[2]['pixelmatch']
  }
  const { PNG } = (await import('pngjs')) as unknown as {
    PNG: Parameters<typeof diffPngs>[2]['PNG']
  }

  const { startDevServer } = await import('../dev/server')
  const server = await startDevServer({
    cwd,
    ...(options.dir ? { dir: options.dir } : {}),
    port: options.port ?? 5219,
  })

  const results: ScenarioBrowserResult[] = []
  const notDriven: string[] = []
  let snapshotsCreated = 0
  let snapshotsFailed = 0
  let coverageMeasured = 0

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(server.url)
    await page.waitForSelector('[data-testid="atlas-shell"]')

    const catalog = (await page.evaluate(
      `(() => { const m = globalThis.__ATLAS_MODEL__; return { components: m.catalog.components.map((c) => ({ id: c.id, name: c.name, scenarios: (c.scenarios ?? []).map((s) => ({ id: s.id })) })) } })()`,
    )) as PageCatalog

    mkdirSync(snapshotDir, { recursive: true })

    for (const component of catalog.components) {
      for (const scenario of component.scenarios ?? []) {
        // Drive THROUGH the model: select, settle a frame, interact, measure.
        //
        // The graph comes from the page's OWN devtools bridge (the reactivity
        // instance the components actually run on); the entry's
        // `computeReactiveCoverage` is pure over that node array. The session
        // is a NEW-NODE diff: nodes present before `selectScenario` are
        // workbench chrome — scoring them would measure the workbench, not the
        // component. Fresh nodes carry absolute fire counts from creation,
        // which is exactly the session-baseline semantic of the coverage kit.
        const coverage = (await page.evaluate(
          `(async () => {
            const m = globalThis.__ATLAS_MODEL__
            const v = globalThis.__ATLAS_VERIFY__
            const bridge = globalThis.__PYREON_DEVTOOLS__ && globalThis.__PYREON_DEVTOOLS__.reactive
            if (!v || !bridge) return { status: 'skip', reason: 'no reactive devtools bridge (production build)' }
            try {
              bridge.activate()
              const before = new Set(bridge.getGraph().nodes.map((n) => n.id))
              m.selectScenario(${JSON.stringify(component.id)}, ${JSON.stringify(scenario.id)})
              await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
              const surface = m.previewElement()
              const clickable = surface ? surface.querySelectorAll('button,[role="button"],a[href],input,select') : []
              for (const el of clickable) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
              await new Promise((r) => requestAnimationFrame(r))
              const fresh = bridge.getGraph().nodes.filter((n) => !before.has(n.id))
              const report = v.computeReactiveCoverage(fresh)
              return { status: 'done', percent: report.percent, total: report.total, uncovered: report.uncovered }
            } catch (err) {
              return { status: 'error', reason: String(err && err.message || err) }
            }
          })()`,
        )) as
          | { status: 'skip' | 'error'; reason: string }
          | { status: 'done'; percent: number; total: number; uncovered: number }

        let reactivityCoverage: VerifyCheck
        if (coverage.status === 'done') {
          coverageMeasured += 1
          reactivityCoverage = {
            status: 'pass',
            findings: [
              coverage.total === 0
                ? 'measured in real Chromium: no reactive nodes created by this scenario (static render)'
                : `measured in real Chromium: ${coverage.percent}% of ${coverage.total} reactive node(s) fired` +
                  (coverage.uncovered > 0 ? `; ${coverage.uncovered} never re-fired` : ''),
            ],
          }
        } else if (coverage.status === 'skip') {
          reactivityCoverage = { status: 'skip', findings: [coverage.reason] }
        } else {
          reactivityCoverage = { status: 'fail', findings: [`coverage measurement errored: ${coverage.reason}`] }
        }

        // Snapshot the preview surface.
        let snapshot: VerifyCheck
        try {
          const shot = await page.locator('[data-testid="canvas-preview"]').screenshot({
            animations: 'disabled',
          })
          const baselinePath = join(snapshotDir, `${scenario.id}.png`)
          // Read the baseline directly — a missing file is just a read miss
          // (ENOENT), not a state to pre-check. An exists-then-use pair is the
          // TOCTOU shape CodeQL rightly flags (js/file-system-race).
          let baseline: Buffer | null = null
          if (!options.updateSnapshots) {
            try {
              baseline = readFileSync(baselinePath)
            } catch {
              baseline = null
            }
          }
          if (options.updateSnapshots) {
            writeFileSync(baselinePath, shot)
            snapshotsCreated += 1
            snapshot = { status: 'pass', findings: ['baseline UPDATED this run (re-baselined on request)'] }
          } else if (baseline === null) {
            writeFileSync(baselinePath, shot)
            snapshotsCreated += 1
            snapshot = {
              status: 'pass',
              findings: ['baseline created this run — a created baseline is recorded, not yet compared'],
            }
          } else {
            const ratio = diffPngs(baseline, shot, { PNG, pixelmatch })
            if (ratio <= maxRatio) {
              snapshot = { status: 'pass' }
            } else {
              const actualPath = join(snapshotDir, `${scenario.id}.actual.png`)
              writeFileSync(actualPath, shot)
              snapshotsFailed += 1
              snapshot = {
                status: 'fail',
                findings: [
                  `visual diff ${(ratio * 100).toFixed(2)}% of pixels (limit ${(maxRatio * 100).toFixed(2)}%) — actual written to ${actualPath}`,
                ],
              }
            }
          }
        } catch (err) {
          snapshot = {
            status: 'fail',
            findings: [`screenshot failed: ${err instanceof Error ? err.message : String(err)}`],
          }
        }

        results.push({ id: scenario.id, reactivityCoverage, snapshot })
      }
    }
  } finally {
    await browser.close()
    await server.close()
  }

  // Merge into the on-disk catalog, when one exists — the runner UPGRADES the
  // scan's verdicts rather than owning a second artifact. Read directly and
  // treat a missing/unreadable file as "no catalog" (same TOCTOU rule as the
  // baseline read above).
  const catalogPath = join(cwd, 'atlas-catalog.json')
  let wrote: string | undefined
  let data: { components: { scenarios: { id: string; verify?: VerifyVerdict }[] }[] } | null = null
  try {
    data = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
      components: { scenarios: { id: string; verify?: VerifyVerdict }[] }[]
    }
  } catch {
    data = null
  }
  if (data) {
    const byId = new Map(results.map((r) => [r.id, r]))
    for (const component of data.components) {
      for (const scenario of component.scenarios) {
        const r = byId.get(scenario.id)
        if (r) scenario.verify = mergeBrowserVerdict(scenario.verify, r)
        else notDriven.push(scenario.id)
      }
    }
    writeFileSync(catalogPath, JSON.stringify(data, null, 2))
    wrote = catalogPath
  }

  return {
    scenarios: results.length,
    snapshotsCreated,
    snapshotsFailed,
    coverageMeasured,
    notDriven,
    ...(wrote ? { catalogPath: wrote } : {}),
  }
}

/** Minimal structural page type — playwright's types stay out of the graph. */
interface PageLike {
  goto(url: string): Promise<unknown>
  waitForSelector(sel: string): Promise<unknown>
  evaluate(script: string): Promise<unknown>
  locator(sel: string): { screenshot(opts: { animations: 'disabled' }): Promise<Buffer> }
}
