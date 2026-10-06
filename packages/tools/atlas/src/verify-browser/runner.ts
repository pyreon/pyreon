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
 *      (`pixel-diff.ts`, a perceptual YIQ comparison that forgives
 *      anti-aliasing — byte equality would false-fail on it),
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
 * diff, writing the actual next to the baseline for eyeballing, plus a
 * `<id>.diff.png` marking which pixels differ.
 */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CheckStatus, VerifyCheck, VerifyVerdict } from '../core'
import { CHECK_KEYS, finding } from '../core'
import { skipped } from '../plugins/registry'
import { pixelDiff } from './pixel-diff'
import { decodePng, encodePng } from './png'

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
  /**
   * axe-core accessibility checks, run per scenario against the live preview.
   * `false` switches them off (the a11y verdict then stays the scan's static
   * one). `minImpact` drops violations below that axe impact level (default
   * `minor`: everything); `rules` toggles individual axe rules.
   */
  axe?: false | { minImpact?: AxeImpact; rules?: Record<string, { enabled: boolean }> }
}

export type AxeImpact = 'minor' | 'moderate' | 'serious' | 'critical'
const IMPACT_ORDER: readonly AxeImpact[] = ['minor', 'moderate', 'serious', 'critical']

export interface ScenarioBrowserResult {
  id: string
  reactivityCoverage: VerifyCheck
  snapshot: VerifyCheck
  /** Present only when axe was attempted for this scenario. */
  a11y?: VerifyCheck
}

export interface BrowserVerifySummary {
  scenarios: number
  snapshotsCreated: number
  snapshotsFailed: number
  coverageMeasured: number
  /** Scenarios axe-core actually ran on (a run that errored is not counted). */
  axeChecked: number
  /** Of those, scenarios with at least one violation at/above the impact threshold. */
  axeFailed: number
  /**
   * Catalog scenarios the workbench could not drive — components living in
   * workbench-HOST files (they import `@pyreon/atlas`, so the dev nav filters
   * them out). Their browser verdicts stay `skip`; listed so a "26 of 43"
   * run is legible instead of silently partial.
   */
  notDriven: string[]
  /**
   * Browser results whose scenario id is in NO catalog entry — present only
   * when a catalog was merged into. Non-empty means the two surfaces derived
   * different ids for the same scenario (identity drift), so those verdicts
   * were measured and then dropped; the CLI exits non-zero rather than let
   * that read as a clean run.
   */
  unmatched: string[]
  catalogPath?: string
}

/** The workbench catalog shape the bridge exposes (subset the runner reads). */
interface PageCatalog {
  components: { id: string; name: string; scenarios?: { id: string }[] }[]
}

/** The finding codes axe contributes — stripped before a re-merge so a rerun never stacks stale results. */
const AXE_CODES = new Set<string>(['axe-violation', 'axe-incomplete'])

/** The page-side shape of `runAxe`'s report (structural: the UI type stays out of Node's graph). */
export interface AxeReportLike {
  status: 'ready' | 'running' | 'done' | 'failed'
  violations: { id: string; impact: string; help: string; target: string; html: string; nodes: number }[]
  incomplete: number
  error?: string
}

/**
 * Turn an axe report into an a11y check. A run that did not happen is a SKIP
 * with its reason — never a pass — and `incomplete` items (axe's "needs a
 * human") are reported on a pass rather than dropped.
 */
export function axeReportToCheck(report: AxeReportLike, minImpact: AxeImpact = 'minor'): VerifyCheck {
  if (report.status !== 'done') {
    return skipped('not-run', `axe-core did not run: ${report.error ?? `report status "${report.status}"`}`)
  }
  const floor = IMPACT_ORDER.indexOf(minImpact)
  // An impact axe did not classify ('unknown') is KEPT: dropping what cannot
  // be ranked would hide exactly the findings nobody has triaged.
  const kept = report.violations.filter((v) => {
    const at = IMPACT_ORDER.indexOf(v.impact as AxeImpact)
    return at === -1 || at >= floor
  })
  if (kept.length > 0) {
    return {
      status: 'fail',
      findings: kept.map((v) =>
        finding(
          'axe-violation',
          `axe-core ${v.id} (${v.impact}): ${v.help} — ${v.nodes} node(s), first ${v.target || '(no selector)'}: ${v.html}`,
        ),
      ),
    }
  }
  return report.incomplete > 0
    ? {
        status: 'pass',
        findings: [
          finding(
            'axe-incomplete',
            `axe-core found no violations but could not decide ${report.incomplete} item(s) automatically — they need a human review`,
          ),
        ],
      }
    : { status: 'pass' }
}

/**
 * Fold axe's verdict into the scenario's existing a11y verdict.
 *
 * The static check's REAL result (pass, or a fail with its own findings) is
 * kept; its "nothing to check statically — run verify-browser" skip is
 * dropped, because that promise has just been kept or its failure reported.
 * A failure from either side fails the merged check. Prior axe findings are
 * stripped first so a re-run replaces them instead of stacking.
 */
export function mergeA11y(prev: VerifyCheck | undefined, axe: VerifyCheck): VerifyCheck {
  const staticFindings = (prev?.findings ?? []).filter((f) => !AXE_CODES.has(f.code))
  const staticStatus: CheckStatus | 'none' =
    !prev || prev.status === 'skip' || (prev.status === 'fail' && staticFindings.length === 0)
      ? 'none'
      : prev.status
  const axeFindings = axe.findings ?? []
  if (staticStatus === 'fail' || axe.status === 'fail') {
    return {
      status: 'fail',
      findings: [...(staticStatus === 'fail' ? staticFindings : []), ...axeFindings],
    }
  }
  const status: CheckStatus = staticStatus === 'pass' || axe.status === 'pass' ? 'pass' : 'skip'
  return axeFindings.length > 0 ? { status, findings: axeFindings } : { status }
}

/**
 * Merge browser verdicts into a scenario's existing verify verdict,
 * recomputing `checked`/`ok` exactly the way the pipeline registry does — a
 * second derivation rule would drift.
 */
export function mergeBrowserVerdict(
  verify: VerifyVerdict | undefined,
  result: Pick<ScenarioBrowserResult, 'reactivityCoverage' | 'snapshot' | 'a11y'>,
): VerifyVerdict {
  const SKIP: VerifyCheck = { status: 'skip' }
  const next: VerifyVerdict = {
    ok: false,
    checked: 0,
    // Axe attempted → fold it in; not attempted (`--no-axe`) → carried as-is.
    a11y: result.a11y ? mergeA11y(verify?.a11y, result.a11y) : (verify?.a11y ?? SKIP),
    interaction: verify?.interaction ?? SKIP,
    reactivityCoverage: result.reactivityCoverage,
    leak: verify?.leak ?? SKIP,
    // Carried through, not recomputed: parity is a NODE-side verdict and the
    // browser pass has nothing to say about it. Dropping it here would let a
    // `verify-browser` run silently erase a real failure the scan found.
    ssrParity: verify?.ssrParity ?? SKIP,
    snapshot: result.snapshot,
  }
  // The canonical key list, never a local copy: a hand-written list here
  // omitted `ssrParity`, so a parity FAILURE carried through above was then
  // ignored when recomputing `ok` — a scan-time failure became `ok: true`.
  const statuses: CheckStatus[] = CHECK_KEYS.map((k) => next[k].status)
  next.checked = statuses.filter((s) => s !== 'skip').length
  next.ok = next.checked > 0 && !statuses.includes('fail')
  return next
}

export interface PngComparison {
  /** Fraction of pixels that differ perceptibly (0..1). A size mismatch is 1. */
  ratio: number
  /**
   * The diff image as a PNG (differences red, forgiven anti-aliasing yellow,
   * matching pixels a faded greyscale of the baseline), or `null` when the
   * sizes differ and there is no pixel correspondence to draw.
   */
  diffPng: Buffer | null
}

/**
 * Compare two PNG screenshots. The threshold (0.1) is the one the pixelmatch
 * dependency ran with before `pixel-diff.ts` replaced it — baselines recorded
 * under the old comparator keep their verdicts.
 */
export function comparePngs(a: Buffer, b: Buffer): PngComparison {
  const imgA = decodePng(a)
  const imgB = decodePng(b)
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) return { ratio: 1, diffPng: null }
  const out = Buffer.alloc(imgA.data.length)
  const diff = pixelDiff(imgA.data, imgB.data, out, imgA.width, imgA.height, { threshold: 0.1 })
  return {
    ratio: diff / (imgA.width * imgA.height),
    diffPng: encodePng(imgA.width, imgA.height, out),
  }
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
  const { startDevServer } = await import('../dev/server')
  const server = await startDevServer({
    cwd,
    ...(options.dir ? { dir: options.dir } : {}),
    port: options.port ?? 5219,
  })

  const results: ScenarioBrowserResult[] = []
  const notDriven: string[] = []
  const unmatched: string[] = []
  const snapshotOutcomes: SnapshotOutcome[] = []
  let coverageMeasured = 0
  let axeChecked = 0
  let axeFailed = 0
  const axeOpts = options.axe === false ? null : (options.axe ?? {})

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(server.url)
    await page.waitForSelector('[data-testid="atlas-shell"]')

    const catalog = (await page.evaluate(
      `(() => { const m = globalThis.__ATLAS_MODEL__; return { components: m.catalog.components.map((c) => ({ id: c.id, name: c.name, scenarios: (c.scenarios ?? []).map((s) => ({ id: s.id })) })) } })()`,
    )) as PageCatalog

    // The page's ids are the join key AND the snapshot filenames: a repeat
    // would let one scenario's baseline/verdict serve another.
    const seenIds = new Set<string>()
    for (const component of catalog.components) {
      for (const scenario of component.scenarios ?? []) {
        if (seenIds.has(scenario.id)) {
          throw new Error(
            `[Pyreon] atlas verify-browser: scenario id "${scenario.id}" appears more than once in the workbench catalog (component "${component.name}") — verdicts and snapshots are keyed by id, so they would overwrite each other.`,
          )
        }
        seenIds.add(scenario.id)
      }
    }

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
              finding(
                'coverage-measured',
                coverage.total === 0
                  ? 'measured in real Chromium: no reactive nodes created by this scenario (static render)'
                  : `measured in real Chromium: ${coverage.percent}% of ${coverage.total} reactive node(s) fired` +
                    (coverage.uncovered > 0 ? `; ${coverage.uncovered} never re-fired` : ''),
              ),
            ],
          }
        } else if (coverage.status === 'skip') {
          reactivityCoverage = skipped('not-run', coverage.reason)
        } else {
          reactivityCoverage = {
            status: 'fail',
            findings: [finding('coverage-errored', `coverage measurement errored: ${coverage.reason}`)],
          }
        }

        // axe-core against the same live preview. Run in the page, through the
        // workbench's own vendored axe (`@pyreon/atlas/ui` runAxe), so the DOM
        // judged is the DOM the coverage pass just exercised.
        let a11y: VerifyCheck | undefined
        if (axeOpts) {
          try {
            const report = (await page.evaluate(
              `(async () => {
                const m = globalThis.__ATLAS_MODEL__
                const v = globalThis.__ATLAS_VERIFY__
                if (!v || !v.runAxe) return { status: 'failed', violations: [], incomplete: 0, error: 'this dev build exposes no axe runner' }
                const surface = m.previewElement()
                if (!surface) return { status: 'failed', violations: [], incomplete: 0, error: 'no preview surface to audit' }
                return await v.runAxe(surface, ${JSON.stringify(axeOpts.rules ?? {})})
              })()`,
            )) as AxeReportLike
            a11y = axeReportToCheck(report, axeOpts.minImpact)
          } catch (err) {
            a11y = skipped('not-run', `axe-core did not run: ${err instanceof Error ? err.message : String(err)}`)
          }
          if (a11y.status !== 'skip') axeChecked += 1
          if (a11y.status === 'fail') axeFailed += 1
        }

        // Snapshot the preview surface. Counting is derived from the verdict,
        // so every failing path — a thrown screenshot included — reaches the
        // tally the CLI exits on.
        const { snapshot, created } = await snapshotScenario(page, scenario.id, {
          snapshotDir,
          maxRatio,
          updateSnapshots: options.updateSnapshots === true,
        })
        snapshotOutcomes.push({ snapshot, created })

        results.push({ id: scenario.id, reactivityCoverage, snapshot, ...(a11y ? { a11y } : {}) })
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
    const known = new Set(data.components.flatMap((c) => c.scenarios.map((s) => s.id)))
    for (const r of results) if (!known.has(r.id)) unmatched.push(r.id)
    for (const component of data.components) {
      for (const scenario of component.scenarios) {
        const r = byId.get(scenario.id)
        if (r) scenario.verify = mergeBrowserVerdict(scenario.verify, r)
        else notDriven.push(scenario.id)
      }
    }
    writeAtomic(catalogPath, JSON.stringify(data, null, 2))
    wrote = catalogPath
  }

  const { created: snapshotsCreated, failed: snapshotsFailed } = countSnapshots(snapshotOutcomes)
  return {
    scenarios: results.length,
    snapshotsCreated,
    snapshotsFailed,
    coverageMeasured,
    axeChecked,
    axeFailed,
    notDriven,
    unmatched,
    ...(wrote ? { catalogPath: wrote } : {}),
  }
}

/** One scenario's snapshot verdict plus whether it wrote a baseline. */
export interface SnapshotOutcome {
  snapshot: VerifyCheck
  created: boolean
}

/**
 * Tally snapshot outcomes for the summary. `failed` is derived from the
 * VERDICT, not incremented per branch — the per-branch form missed the
 * thrown-screenshot path, so a run whose screenshots all threw reported
 * "0 visual diff(s)" and the CLI exited 0.
 */
export function countSnapshots(outcomes: readonly SnapshotOutcome[]): {
  created: number
  failed: number
} {
  let created = 0
  let failed = 0
  for (const o of outcomes) {
    if (o.created) created += 1
    if (o.snapshot.status === 'fail') failed += 1
  }
  return { created, failed }
}

/**
 * Screenshot one scenario's preview and judge it against its baseline.
 *
 * Exported so the verdict/count contract is testable without a browser: a
 * screenshot that THROWS is a failure the summary must count — it used to set
 * `snapshot: fail` while `snapshotsFailed` stayed 0, so the CLI printed
 * "0 visual diff(s)" and exited 0 over a scenario it never compared.
 */
export async function snapshotScenario(
  page: Pick<PageLike, 'locator'>,
  scenarioId: string,
  opts: {
    snapshotDir: string
    maxRatio: number
    updateSnapshots: boolean
  },
): Promise<SnapshotOutcome> {
  const { snapshotDir, maxRatio } = opts
  try {
    const shot = await page.locator('[data-testid="canvas-preview"]').screenshot({
      animations: 'disabled',
    })
    const baselinePath = join(snapshotDir, `${scenarioId}.png`)
    // Read the baseline directly — a missing file is just a read miss
    // (ENOENT), not a state to pre-check. An exists-then-use pair is the
    // TOCTOU shape CodeQL rightly flags (js/file-system-race).
    let baseline: Buffer | null = null
    if (!opts.updateSnapshots) {
      try {
        baseline = readFileSync(baselinePath)
      } catch {
        baseline = null
      }
    }
    if (opts.updateSnapshots) {
      writeFileSync(baselinePath, shot)
      return {
        created: true,
        snapshot: {
          status: 'pass',
          findings: [finding('baseline-updated', 'baseline UPDATED this run (re-baselined on request)')],
        },
      }
    }
    if (baseline === null) {
      writeFileSync(baselinePath, shot)
      return {
        created: true,
        snapshot: {
          status: 'pass',
          findings: [
            finding(
              'baseline-created',
              'baseline created this run — a created baseline is recorded, not yet compared',
            ),
          ],
        },
      }
    }
    const { ratio, diffPng } = comparePngs(baseline, shot)
    if (ratio <= maxRatio) return { created: false, snapshot: { status: 'pass' } }
    const actualPath = join(snapshotDir, `${scenarioId}.actual.png`)
    writeFileSync(actualPath, shot)
    const diffPath = diffPng ? join(snapshotDir, `${scenarioId}.diff.png`) : null
    if (diffPng && diffPath) writeFileSync(diffPath, diffPng)
    return {
      created: false,
      snapshot: {
        status: 'fail',
        findings: [
          finding(
            'snapshot-differs',
            `visual diff ${(ratio * 100).toFixed(2)}% of pixels (limit ${(maxRatio * 100).toFixed(2)}%) — actual written to ${actualPath}` +
              (diffPath ? `, diff image to ${diffPath}` : ' (sizes differ, so there is no diff image)'),
            `Compare ${actualPath} against the baseline${diffPath ? ` (${diffPath} marks the differing pixels red)` : ''}. If the change is intended, re-run with --update-snapshots.`,
          ),
        ],
      },
    }
  } catch (err) {
    return {
      created: false,
      snapshot: {
        status: 'fail',
        findings: [
          finding('snapshot-failed', `screenshot failed: ${err instanceof Error ? err.message : String(err)}`),
        ],
      },
    }
  }
}

/**
 * Write via tmp-then-rename — a reader (or a crash mid-write) sees the old
 * catalog or the whole new one, never a truncated file. Same contract as the
 * scan's catalog write.
 */
export function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.tmp.${process.pid}`
  writeFileSync(tmp, content)
  try {
    renameSync(tmp, path)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {
      // best-effort cleanup; the rename error is the one worth reporting
    }
    throw error
  }
}

/** Minimal structural page type — playwright's types stay out of the graph. */
interface PageLike {
  goto(url: string): Promise<unknown>
  waitForSelector(sel: string): Promise<unknown>
  evaluate(script: string): Promise<unknown>
  locator(sel: string): { screenshot(opts: { animations: 'disabled' }): Promise<Buffer> }
}
