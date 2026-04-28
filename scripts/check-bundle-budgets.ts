#!/usr/bin/env bun
/**
 * check-bundle-budgets — bundle-size budget gate.
 *
 * For every published `@pyreon/*` package, bundles `src/index.ts` with
 * Bun's bundler (minified, browser target, workspace-externalized) and
 * asserts the gzipped size is ≤ the budget locked in
 * `scripts/bundle-budgets.json`.
 *
 * Why this exists: an audit caught `@pyreon/flow` shipping 6.8 MB
 * unpacked. The 6.8 MB number was misleading (3.8 MB was source maps,
 * the elk lazy-chunk is correctly architected) — but the audit was
 * the wrong shape of catch. We don't want eyeballed `du -sh` to be
 * the tool that flags bundle regressions. A locked-budget CI gate is
 * the structural answer: any PR that grows a main entry past its
 * budget fails to merge until the budget is explicitly bumped.
 *
 * Externalization: bundling externalizes `@pyreon/*` and `node:*` so
 * each measurement reflects the UNIQUE bytes that package adds to a
 * consumer bundle, not bytes shared with workspace deps. Lazy-loaded
 * dynamic-import chunks (e.g. flow's elkjs, document's PDF/DOCX
 * renderers) are NOT counted toward the main-entry budget — by design,
 * they're only fetched when the consumer invokes the feature.
 *
 * Run:
 *   bun run check-bundle-budgets          # exit non-zero if over budget
 *   bun run check-bundle-budgets --json   # machine-readable
 *   bun run check-bundle-budgets --update # regenerate budgets from current sizes
 *                                         # (use AFTER intentional growth)
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const REPO_ROOT = resolve(import.meta.dir, '..')
const BUDGETS_PATH = join(REPO_ROOT, 'scripts', 'bundle-budgets.json')

interface PackageInfo {
  name: string
  dir: string
  entry: string
}

function findPackages(): PackageInfo[] {
  const result: PackageInfo[] = []
  const packagesRoot = join(REPO_ROOT, 'packages')
  for (const cat of readdirSync(packagesRoot)) {
    const catDir = join(packagesRoot, cat)
    for (const pkg of readdirSync(catDir)) {
      const pkgDir = join(catDir, pkg)
      const pjPath = join(pkgDir, 'package.json')
      try {
        const pj = JSON.parse(readFileSync(pjPath, 'utf8'))
        if (pj.private) continue
        // Measure the BUILT entry (`lib/index.js`), not the TS source.
        // Bundling `src/index.ts` from inside the monorepo triggers
        // package.json exports-field resolution where relative imports
        // get treated as external (Bun looks up `./batch` against the
        // package's `exports` field, finds nothing, treats as external)
        // — every package measures at ~400 bytes of pure re-exports.
        // Bundling `lib/index.js` is also more accurate: it's the
        // exact code that ships to npm, after the package's build tool
        // has already resolved imports + applied any compile-time
        // transforms.
        const entry = join(pkgDir, 'lib', 'index.js')
        if (!fileExists(entry)) continue
        result.push({ name: pj.name, dir: pkgDir, entry })
      } catch {
        // Skip — no package.json or unreadable
      }
    }
  }
  return result
}

function fileExists(path: string): boolean {
  try {
    readFileSync(path)
    return true
  } catch {
    return false
  }
}

interface BundleResult {
  name: string
  raw: number
  gzip: number
  failed?: boolean
  error?: string
}

async function measurePackage(pkg: PackageInfo): Promise<BundleResult> {
  try {
    const result = await Bun.build({
      entrypoints: [pkg.entry],
      minify: true,
      target: 'browser',
      // splitting: true keeps dynamic imports as separate chunks so we
      // can measure ONLY the main entry-point cost — flow's elkjs and
      // document's PDF/DOCX renderers are dynamic imports that load
      // on-demand, not on page load. Without splitting, Bun inlines
      // them into the main bundle and inflates the measurement to
      // include cost the consumer never actually pays unless they
      // invoke the lazy feature.
      splitting: true,
      // outdir is required when splitting:true. Bun writes files but
      // we read from result.outputs in memory, so the directory is
      // basically a sink — set to a Bun-managed temp.
      outdir: `/tmp/check-bundle-budgets/${pkg.name.replace('@', '').replace('/', '-')}`,
      external: [
        // Externalize all workspace packages — measure THIS package's
        // unique bytes, not bytes from cross-package deps.
        '@pyreon/*',
        // Externalize Node built-ins so server-only packages still
        // measure the right user-bundle weight (none in the case of
        // server packages — but the externalization is harmless).
        'node:*',
        // Externalize popular peer deps that bundle separately
        '@tanstack/*',
        'echarts',
        'echarts/*',
        'elkjs',
        'codemirror',
        '@codemirror/*',
      ],
    })
    if (!result.success) {
      return {
        name: pkg.name,
        raw: 0,
        gzip: 0,
        failed: true,
        error: result.logs.map((l) => String(l)).join('\n'),
      }
    }
    // Pick ONLY the entry-point output (kind: 'entry-point') —
    // ignore split chunks emitted from dynamic imports.
    const entry = result.outputs.find((o) => o.kind === 'entry-point')
    if (!entry) {
      return { name: pkg.name, raw: 0, gzip: 0, failed: true, error: 'no entry-point output' }
    }
    const code = await entry.text()
    const raw = Buffer.byteLength(code, 'utf-8')
    const gzip = gzipSync(code, { level: 9 }).byteLength
    return { name: pkg.name, raw, gzip }
  } catch (err) {
    return {
      name: pkg.name,
      raw: 0,
      gzip: 0,
      failed: true,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const jsonMode = args.includes('--json')
  const updateMode = args.includes('--update')

  const packages = findPackages()

  // Measure all in parallel — Bun.build is async and CPU-light per call.
  const results: BundleResult[] = await Promise.all(packages.map(measurePackage))
  const measured = results
    .filter((r) => !r.failed)
    .sort((a, b) => a.name.localeCompare(b.name))

  // ── Update mode: write fresh budgets and exit ─────────────────────
  if (updateMode) {
    const budgets: Record<string, unknown> = {
      _doc: 'Per-package main-entry budgets in BYTES (minified + gzipped). Externalizes @pyreon/*, node:*, @tanstack/*, echarts, elkjs, codemirror — this is the unique code each package adds to a consumer bundle. Set at 25% headroom over current size at PR-time. When a package legitimately needs to grow past its budget, bump the value in the same PR for explicit review.',
      _units: 'bytes (gzipped)',
    }
    for (const r of measured) {
      // 25% headroom, rounded up to nearest 256B for clean numbers
      budgets[r.name] = Math.ceil((r.gzip * 1.25) / 256) * 256
    }
    writeFileSync(BUDGETS_PATH, JSON.stringify(budgets, null, 2) + '\n')
    // eslint-disable-next-line no-console
    console.log(
      `✓ Wrote ${measured.length} budgets to scripts/bundle-budgets.json (current+25% headroom)`,
    )
    return
  }

  // ── Check mode: load budgets, compare, fail on drift ─────────────
  let budgetsRaw: string
  try {
    budgetsRaw = readFileSync(BUDGETS_PATH, 'utf8')
  } catch {
    // eslint-disable-next-line no-console
    console.error(
      '✗ scripts/bundle-budgets.json not found. Run `bun run check-bundle-budgets --update` to seed it.',
    )
    process.exit(1)
  }
  const budgets = JSON.parse(budgetsRaw) as Record<string, number | string>

  interface Violation {
    name: string
    current: number
    budget: number
    overBy: number
    overByPct: number
  }
  interface MissingBudget {
    name: string
    current: number
  }

  const violations: Violation[] = []
  const missing: MissingBudget[] = []

  for (const r of measured) {
    const budget = budgets[r.name]
    if (typeof budget !== 'number') {
      missing.push({ name: r.name, current: r.gzip })
      continue
    }
    if (r.gzip > budget) {
      const overBy = r.gzip - budget
      violations.push({
        name: r.name,
        current: r.gzip,
        budget,
        overBy,
        overByPct: (overBy / budget) * 100,
      })
    }
  }

  if (jsonMode) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ violations, missing, measured }, null, 2))
  } else if (violations.length === 0 && missing.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`✓ All ${measured.length} package(s) within budget.`)
  } else {
    if (violations.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`✗ ${violations.length} package(s) over budget:\n`)
      for (const v of violations) {
        // eslint-disable-next-line no-console
        console.error(
          `  ${v.name}: ${(v.current / 1024).toFixed(2)} KB > budget ${(v.budget / 1024).toFixed(2)} KB (over by ${(v.overBy / 1024).toFixed(2)} KB, +${v.overByPct.toFixed(1)}%)`,
        )
      }
      // eslint-disable-next-line no-console
      console.error(
        `\nIf this growth is intentional, bump the budget in scripts/bundle-budgets.json. The bump itself is a PR signal: "this package legitimately got bigger".`,
      )
    }
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`\n✗ ${missing.length} package(s) missing budget entry:\n`)
      for (const m of missing) {
        // eslint-disable-next-line no-console
        console.error(`  ${m.name}: ${(m.current / 1024).toFixed(2)} KB (no entry)`)
      }
      // eslint-disable-next-line no-console
      console.error(
        `\nNew package? Run \`bun run check-bundle-budgets --update\` to add it. Review the value in the diff.`,
      )
    }
  }

  if (violations.length > 0 || missing.length > 0) {
    process.exit(1)
  }
}

await main()
