#!/usr/bin/env bun
/**
 * A spec that skips silently is a gate that cannot fail.
 *
 * ## The failure this catches
 *
 * Seven specs across charts / store / lint guarded themselves on
 * `existsSync(lib/…)`, because they measure BUILT output rather than source —
 * the plot families' tree-shaking, the store's dev-gate stripping, and the
 * proof that `pyreon-lint`'s published `bin` actually invokes the CLI (a spec
 * that exists because that bin was once a total no-op in every published
 * version).
 *
 * The guard is right locally, where a fresh worktree has no `lib/`. It is
 * wrong in CI, where the test cells restore the bootstrap and a skip means a
 * green suite that measured nothing. Two of the seven had a loud counterpart
 * assertion; four had none, and nobody could tell — a skipped spec produces
 * no output, no failure, and no absence anyone notices.
 *
 * `hasBuiltLib(path, what)` from `@pyreon/test-utils/built-lib` is the shape
 * that works in both places: it names what it skipped, and THROWS under
 * `PYREON_REQUIRE_BUILT_LIB=1`, which the CI test cells set.
 *
 * ## Why a gate rather than a rule
 *
 * Because the rule already existed. `.claude/rules/testing.md` has said "a
 * skipped suite must never masquerade as coverage" since the release audit,
 * and the next four guards were still written the quiet way — which is what a
 * documented-but-unenforced invariant does. This makes it structural.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const ROOTS = ['packages', 'examples', 'docs']
const SKIP_DIRS = new Set(['node_modules', 'lib', 'dist', '.git', 'templates', '__goldens__'])
/**
 * Files that CONTAIN the bad shape as data rather than as code.
 *
 * Exactly one: this gate's own fixture file, whose whole job is to hold the
 * shapes the matcher must catch. A path list rather than a "skip quoted
 * lines" heuristic on purpose — the heuristic would silently un-flag a real
 * guard someone happened to write inside a template literal, and one named
 * exemption is auditable while a clever matcher is not.
 */
const EXEMPT = new Set(['packages/internals/test-utils/src/tests/check-skip-guards.test.ts'])
/** `describe.skipIf(!existsSync(X))` / `it.skipIf(!fs.existsSync(X))` and friends. */
const BARE_EXISTS_SKIP = /\.skipIf\s*\(\s*!\s*(?:[\w.]+\.)?existsSync\s*\(/

/** Every test file under the scanned roots. */
function testFiles(dir: string, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) testFiles(p, out)
    else if (/\.(test|spec)\.(ts|tsx|mts)$/.test(e.name)) out.push(p)
  }
  return out
}

export interface SkipGuardFinding {
  file: string
  line: number
  text: string
}

/** The bare-`existsSync` skip guards in one file's source. */
export function findBareExistsSkips(source: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    if (BARE_EXISTS_SKIP.test(l)) out.push({ line: i + 1, text: l.trim() })
  }
  return out
}

function main(): void {
  const files: string[] = []
  for (const root of ROOTS) {
    const p = join(REPO_ROOT, root)
    try {
      if (statSync(p).isDirectory()) testFiles(p, files)
    } catch {
      // A root that does not exist in this checkout is not a finding.
    }
  }
  if (files.length === 0) {
    // An empty scan is a SKIP masquerading as a pass — the very class this
    // gate exists for, so it fails rather than reporting clean.
    console.error('[check-skip-guards] ✗ scanned ZERO test files — the roots are wrong, not the repo clean.')
    process.exit(1)
  }
  const findings: SkipGuardFinding[] = []
  const seenExempt = new Set<string>()
  for (const f of files) {
    const rel = relative(REPO_ROOT, f)
    if (EXEMPT.has(rel)) {
      seenExempt.add(rel)
      continue
    }
    for (const hit of findBareExistsSkips(readFileSync(f, 'utf8'))) {
      findings.push({ file: rel, line: hit.line, text: hit.text })
    }
  }
  // The exemption list is a RATCHET: an entry whose file is gone would silence
  // nothing and outlive its reason, so it fails rather than passing quietly.
  const stale = [...EXEMPT].filter((e) => !seenExempt.has(e))
  if (stale.length > 0) {
    console.error(`[check-skip-guards] ✗ exempt file(s) no longer exist — drop the entry: ${stale.join(', ')}`)
    process.exit(1)
  }
  if (findings.length > 0) {
    console.error(
      `[check-skip-guards] ✗ ${findings.length} spec guard(s) skip on a bare \`existsSync\`, which is silent:\n`,
    )
    for (const f of findings) console.error(`  ${f.file}:${f.line}\n    ${f.text}`)
    console.error(
      `\n  Use \`hasBuiltLib(path, what)\` from \`@pyreon/test-utils/built-lib\` instead. It names what it\n`
        + `  skipped and why, and THROWS under PYREON_REQUIRE_BUILT_LIB=1 — which the CI test cells set,\n`
        + `  because they restore the bootstrap and so guarantee the artifact. A silent skip there is a\n`
        + `  green suite that measured nothing.`,
    )
    process.exit(1)
  }
  console.log(`[check-skip-guards] ✓ ${files.length} test file(s), no silently-skipping artifact guards.`)
}

if (import.meta.main) main()
