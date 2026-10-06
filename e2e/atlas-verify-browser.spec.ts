/**
 * `atlas verify-browser` — the browser half of verification, tested as the
 * SUBPROCESS a user runs (own dev server, own Chromium; no webServer entry).
 *
 * One spec drives the full lifecycle in order, because the phases are causally
 * chained: scan writes the catalog the runner merges into; the first
 * verify-browser run CREATES baselines; the second COMPARES against them.
 * Splitting into independent specs would either re-run the ~60s pipeline per
 * spec or hide the ordering in test-run luck.
 *
 * The load-bearing assertion is the non-zero coverage totals: the first cut of
 * the runner read the ENTRY's copy of the coverage registry — a second Vite
 * reactivity instance that never saw a node — and reported "100% of 0" for
 * every scenario. Only the page's own `__PYREON_DEVTOOLS__.reactive` bridge is
 * instance-correct; a regression to the split reads all-zeros again and this
 * spec fails.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'

// Playwright transpiles specs to CJS (`import.meta` unavailable); every suite
// here is invoked from the repo root, which the sibling specs already rely on.
const ROOT = resolve(process.cwd())
const BIN = resolve(ROOT, 'packages/tools/atlas/bin/atlas.js')
const WORKSHOP = resolve(ROOT, 'examples/atlas-workshop')
const SNAPSHOTS = join(WORKSHOP, 'atlas-snapshots')
const CATALOG = join(WORKSHOP, 'atlas-catalog.json')

interface CatalogJson {
  components: {
    scenarios: {
      id: string
      verify?: {
        ok: boolean
        checked: number
        // Catalog v2: a finding is `{ code, message, fix? }`, not a string.
        reactivityCoverage: { status: string; findings?: { code: string; message: string }[] }
        snapshot: { status: string; findings?: { code: string; message: string }[] }
      }
    }[]
  }[]
}

test('scan → create baselines → compare → merged catalog verdicts', () => {
  test.setTimeout(600_000)

  // Fresh state: no baselines, fresh catalog from the scan.
  rmSync(SNAPSHOTS, { recursive: true, force: true })
  const scan = spawnSync('bun', [BIN, 'scan', 'examples/atlas-workshop'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300_000,
  })
  // Exit 1 is the scan's DOCUMENTED state: the workshop ships two deliberate
  // a11y failures (button--empty, badge--empty) so a red scan stays provable.
  expect(scan.status, scan.stderr).toBe(1)
  expect(existsSync(CATALOG)).toBe(true)

  // Run 1: every drivable scenario measured, every baseline created.
  const first = spawnSync('node', [BIN, 'verify-browser', WORKSHOP], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300_000,
  })
  expect(first.status, first.stderr).toBe(0)
  // 27 drivable: every component carries a Default, the content seed adds an
  // Empty + Long-content scenario per CONTENT control, and the variant axes
  // fan one value at a time rather than crossing.
  expect(first.stdout).toContain('27 scenario(s)')
  expect(first.stdout).toContain('coverage measured on 27')
  expect(first.stdout).toContain('27 baseline(s) created')
  expect(first.stdout).toContain('0 visual diff(s)')
  // Partial coverage is REPORTED, never silent: workbench-host components
  // (demo-catalog.tsx, workshop.tsx) can't be driven through the dev nav.
  expect(first.stdout).toContain('17 scenario(s) not drivable')

  // Run 2: baselines exist → pure compare, nothing created, nothing diffs.
  const second = spawnSync('node', [BIN, 'verify-browser', WORKSHOP], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300_000,
  })
  expect(second.status, second.stderr).toBe(0)
  expect(second.stdout).toContain('0 baseline(s) created')
  expect(second.stdout).toContain('0 visual diff(s)')

  // The catalog carries the merged verdicts.
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8')) as CatalogJson
  const scenarios = catalog.components.flatMap((c) => c.scenarios)
  const driven = scenarios.filter((s) => s.verify?.snapshot.status !== 'skip')
  expect(driven.length).toBe(27)

  // Coverage is a real measurement on the components' OWN reactivity
  // instance — at least one scenario must have seen reactive nodes, and the
  // all-zeros signature of the dual-instance split must not reappear.
  const totals = driven.map((s) => {
    const message = s.verify?.reactivityCoverage.findings?.[0]?.message ?? ''
    const m = message.match(/of (\d+) reactive node/)
    return m ? Number(m[1]) : 0
  })
  expect(Math.max(...totals)).toBeGreaterThan(0)

  // Merged verdicts recompute checked with the browser pair included.
  const sample = driven.find((s) => s.verify && s.verify.checked >= 3)
  expect(sample, 'a scenario with ≥3 non-skip checks after merge').toBeTruthy()
})

// #3823 — two same-named components in different directories. The Node scan and
// the dev server the browser runner boots reached the same files through
// different roots (cwd-relative vs absolute), so their scenario ids differed
// and no browser verdict could merge (`notDriven` held both, silently).
//
// The fixture lives INSIDE the workshop so `@pyreon/*` resolves from its
// node_modules; it is created and removed by the test.
test('same-named components in different directories merge their browser verdicts', () => {
  test.setTimeout(600_000)
  const FX = join(WORKSHOP, '.fx-collision-e2e')
  rmSync(FX, { recursive: true, force: true })
  try {
    for (const d of ['one', 'two']) {
      mkdirSync(join(FX, 'src', d), { recursive: true })
      writeFileSync(
        join(FX, 'src', d, 'Glyph.tsx'),
        `export default function Glyph() { return <span>${d}</span> }\n`,
      )
    }
    writeFileSync(
      join(FX, 'atlas.config.ts'),
      `export default { title: 'Collision', projects: [{ name: 'Example', dir: 'src' }] }\n`,
    )

    const scan = spawnSync('node', [BIN, 'scan', FX], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 })
    expect(scan.status, scan.stderr).toBe(0)
    const run = spawnSync('node', [BIN, 'verify-browser', FX], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 300_000,
    })
    // Exit 0 also proves nothing was `unmatched` (the runner now exits 1 then).
    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toContain('2 scenario(s)')
    expect(run.stdout).not.toContain('not drivable')

    const catalog = JSON.parse(readFileSync(join(FX, 'atlas-catalog.json'), 'utf8')) as CatalogJson
    const scenarios = catalog.components.flatMap((c) => c.scenarios)
    expect(scenarios.map((s) => s.id).sort()).toEqual([
      'example-glyph-one--default',
      'example-glyph-two--default',
    ])
    // Both verdicts merged: the browser-only snapshot check is no longer a skip.
    for (const s of scenarios) expect(s.verify?.snapshot.status, s.id).not.toBe('skip')
    // Snapshot filenames carry no checkout path.
    expect(existsSync(join(FX, 'atlas-snapshots', 'example-glyph-one--default.png'))).toBe(true)
  } finally {
    rmSync(FX, { recursive: true, force: true })
  }
})
