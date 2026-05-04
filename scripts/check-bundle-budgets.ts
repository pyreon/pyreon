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

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { parseSync, Visitor } from 'oxc-parser'

const REPO_ROOT = resolve(import.meta.dir, '..')
const BUDGETS_PATH = join(REPO_ROOT, 'scripts', 'bundle-budgets.json')

/**
 * Override `<REPO_ROOT>/packages` discovery with a custom directory.
 * Used by the regression test in test-utils to point the script at a
 * controlled fixture (a fake package with an unresolvable import) and
 * assert that the `failures[]` field surfaces the bundle failure
 * instead of silently dropping it. Production runs always use the
 * real `packages/` directory.
 */
function getPackagesRoot(): string {
  const flag = process.argv.find((arg) => arg.startsWith('--packages-root='))
  if (flag) return resolve(flag.slice('--packages-root='.length))
  return join(REPO_ROOT, 'packages')
}

interface PackageInfo {
  name: string
  dir: string
  entry: string
  externals: string[]
}

function findPackages(): PackageInfo[] {
  const result: PackageInfo[] = []
  const packagesRoot = getPackagesRoot()
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
        // Collect every bare-module specifier referenced anywhere in
        // lib/ (the ENTIRE built tree, not just the entry). Some
        // packages vendor third-party renderers into split chunks that
        // re-import other third-parties (e.g. document's pptxgenjs
        // chunk imports `jszip`). Without this, Bun.build follows the
        // import graph through the chunk and fails on the unresolved
        // transitive — silently dropped from the measurement before
        // this fix landed. See gap #2 investigation in fix PR.
        const externals = collectBareModuleImports(join(pkgDir, 'lib'))
        result.push({ name: pj.name, dir: pkgDir, entry, externals })
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

/**
 * Walks every `*.js` file under `dir` and extracts non-relative module
 * specifiers from `import` / `export from` / dynamic `import()` /
 * `require()` syntax via AST analysis. Used to externalize every
 * third-party dep this package's built code touches, regardless of
 * whether it's a direct dep, optional dep, or a transitive of one of
 * those that ended up inlined into a chunk.
 *
 * Why scan source instead of using package.json `dependencies`:
 * `@pyreon/document` declares `pdfmake`/`pptxgenjs`/etc. as
 * `optionalDependencies`, but those packages' own internals
 * (`jszip`, etc.) get vendored INTO `document/lib/` as split chunks
 * that the consumer never sees declared. We need to externalize the
 * transitive too, or Bun.build fails resolving it.
 *
 * Why AST instead of regex (gap #4 closure):
 * `@pyreon/compiler` vendors its own JS transform output as STRING
 * LITERALS containing `import ... from "..."` — a regex can't tell
 * those apart from real import statements without a separate
 * sanitization pass (`validSpec` allowlist, etc.). The AST walker
 * sees a `Literal` node inside an `ExpressionStatement`, NOT an
 * `ImportDeclaration.source`, so it never confuses code-as-string with
 * actual imports. Reuses the same `parseSync` + `Visitor` pattern as
 * `@pyreon/lint`'s rule infrastructure.
 */
function collectBareModuleImports(dir: string): string[] {
  const found = new Set<string>()
  function record(spec: string | undefined): void {
    if (!spec) return
    // Skip relative + absolute paths — those aren't third-party.
    if (spec.startsWith('.') || spec.startsWith('/')) return
    // Skip node: builtins (already externalized via 'node:*').
    if (spec.startsWith('node:')) return
    // Skip @pyreon/* (already externalized via '@pyreon/*').
    if (spec.startsWith('@pyreon/')) return
    found.add(spec)
    // Also externalize subpath imports of the same package
    // (e.g. `lodash/fp`) so a partial-match against the package
    // root still externalizes correctly.
    const slashIdx = spec.startsWith('@')
      ? spec.indexOf('/', spec.indexOf('/') + 1)
      : spec.indexOf('/')
    if (slashIdx > 0) found.add(spec.slice(0, slashIdx) + '/*')
  }

  function extractFromFile(filePath: string, src: string): void {
    let program
    try {
      const result = parseSync(filePath, src, { sourceType: 'module', lang: 'js' })
      program = result.program
    } catch {
      // If oxc-parser can't parse the file (corrupt build artifact,
      // unsupported syntax, etc.), skip it — the bundle build itself
      // will surface the real error, we don't need to duplicate it.
      return
    }
    const callbacks: Record<string, (node: any) => void> = {
      // `import x from 'foo'` / `import 'foo'` / `import * as x from 'foo'`
      ImportDeclaration: (node) => {
        record(typeof node.source?.value === 'string' ? node.source.value : undefined)
      },
      // `export { x } from 'foo'` (re-export — `node.source` is non-null)
      ExportNamedDeclaration: (node) => {
        if (node.source) {
          record(typeof node.source.value === 'string' ? node.source.value : undefined)
        }
      },
      // `export * from 'foo'` / `export * as ns from 'foo'`
      ExportAllDeclaration: (node) => {
        record(typeof node.source?.value === 'string' ? node.source.value : undefined)
      },
      // Dynamic `import('foo')`. oxc represents this as ImportExpression.
      ImportExpression: (node) => {
        if (node.source?.type === 'Literal' && typeof node.source.value === 'string') {
          record(node.source.value)
        }
      },
      // CommonJS `require('foo')`. Bun's build may emit a chunk that
      // uses require for some dynamic specifiers — handle conservatively.
      CallExpression: (node) => {
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'require') return
        const arg = node.arguments?.[0]
        if (arg?.type === 'Literal' && typeof arg.value === 'string') {
          record(arg.value)
        }
      },
    }
    try {
      const visitor = new Visitor(callbacks)
      visitor.visit(program)
    } catch {
      // Defensive — if visitor throws, the partial collection is
      // still useful and the bundle build will surface real errors.
    }
  }

  function walk(d: string): void {
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(d, e)
      let stat
      try {
        stat = statSync(p)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        walk(p)
      } else if (e.endsWith('.js')) {
        let src: string
        try {
          src = readFileSync(p, 'utf8')
        } catch {
          continue
        }
        extractFromFile(p, src)
      }
    }
  }
  walk(dir)
  return [...found]
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
      // target: 'bun' auto-externalizes Node builtins (`module`,
      // `child_process`, `fs`, etc.) which is what server-side
      // packages (cli, mcp, lint, compiler, zero-cli) need. For pure-
      // browser packages with no Node imports the byte output is
      // identical to target: 'browser', so this is the universal
      // choice. Pre-fix the script used 'browser' and silently failed
      // on every server-side package.
      target: 'bun',
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
        // measure the right user-bundle weight (target: 'bun' already
        // handles most of these but the explicit list is harmless).
        'node:*',
        // Every bare-module specifier the package's built code
        // imports — auto-collected from `lib/**/*.js` so the gate
        // doesn't need a hardcoded allowlist that drifts.
        ...pkg.externals,
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
  const failures = results
    .filter((r) => r.failed)
    .map((r) => ({ name: r.name, error: r.error ?? 'unknown' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // ── Update mode: write fresh budgets and exit ─────────────────────
  if (updateMode) {
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `✗ Cannot regenerate budgets — ${failures.length} package(s) failed to bundle:`,
      )
      for (const f of failures) {
        // eslint-disable-next-line no-console
        console.error(`  ${f.name}: ${f.error.split('\n')[0]}`)
      }
      // eslint-disable-next-line no-console
      console.error(
        `\nFix the bundle errors first (likely an unresolved third-party dep that needs to be added to the package's package.json so the auto-external scan picks it up), then re-run --update.`,
      )
      process.exit(1)
    }
    const budgets: Record<string, unknown> = {
      _doc: 'Per-package main-entry budgets in BYTES (minified + gzipped). Externalizes @pyreon/*, node:*, and every bare-module import auto-collected from each package\'s lib/ tree — this is the unique code each package adds to a consumer bundle. Set at 25% headroom over current size at PR-time. When a package legitimately needs to grow past its budget, bump the value in the same PR for explicit review.',
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
    console.log(JSON.stringify({ violations, missing, failures, measured }, null, 2))
  } else if (violations.length === 0 && missing.length === 0 && failures.length === 0) {
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
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`\n✗ ${failures.length} package(s) failed to bundle:\n`)
      for (const f of failures) {
        // eslint-disable-next-line no-console
        console.error(`  ${f.name}: ${f.error.split('\n')[0]}`)
      }
      // eslint-disable-next-line no-console
      console.error(
        `\nThese packages are not contributing to the budget gate — likely an unresolved third-party dep. The auto-external scan walks each package's lib/ tree for bare-module imports, but it can miss specifiers buried in dynamic strings or vendored chunks. Either declare the dep in the package's package.json or add it explicitly.`,
      )
    }
  }

  if (violations.length > 0 || missing.length > 0 || failures.length > 0) {
    process.exit(1)
  }
}

await main()
