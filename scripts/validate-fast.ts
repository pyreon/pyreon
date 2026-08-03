#!/usr/bin/env bun
/**
 * validate-fast — run every CI gate that takes < 30 seconds locally.
 *
 * The pre-push hook runs lint + affected-typecheck + affected-tests.
 * Those catch most regressions but miss the gates that have repeatedly
 * tripped freshly-pushed PRs:
 *
 *   - check-doc-claims      (CLAUDE.md doc page count drifted)
 *   - check-changeset-required (no changeset for published-pkg source change)
 *   - check-bundle-budgets   (new publishable package missing entry)
 *   - check-distribution    (sideEffects / source-map invariants)
 *   - check-export-entries  (subpath export has a build entry — release-build guard)
 *   - check-release-readiness (publishConfig.access / fixed-group coverage)
 *   - check-manifest-depth  (LOCKED package density regressed)
 *   - check-manifest-examples (a manifest api[].example no longer typechecks vs the shipped export)
 *   - check-client-bundle-node-imports (node: import leaked into client entry)
 *   - check-ios-signing-policy (unsigned test step -> CI-only Keychain denial)
 *   - check-shared-source-deps (tri-target shared source unbuildable for web)
 *   - check-mcp-docs        (MCP tool added without docs/src/content/docs/mcp.md section)
 *   - loom-scan             (dependency-fabric errors: phantom deps, runtime cycles, drift)
 *   - check-advisory-comment-steps (advisory PR-comment step that can turn a check red)
 *   - check-lint-ratchet    (oxlint warn-finding count grew above baseline)
 *   - check-pyreon-lint-ratchet (@pyreon/lint advisory-finding count over framework src grew above baseline)
 *   - gen-docs --check      (manifest edited but generated files stale)
 *
 * Each gate runs ~1-15s, total ~30-60s. The point is: catch ALL the
 * cheap-to-detect failures locally with ONE command before pushing.
 *
 * Run:
 *   bun run validate-fast              # all gates, exit 1 on any fail
 *   bun run validate-fast --json       # machine-readable result
 *
 * Gates are run SEQUENTIALLY so the output is easy to read top-down.
 * If you want parallel, run individual scripts via `bun run check-X`.
 *
 * NOT included (too slow for "fast"):
 *   - verify-modes (~90s)
 *   - audit-types --all --strict (~15s but mostly redundant with manifest-depth)
 *   - test:e2e (3-5 min)
 *   - scaffold-smoke (~3 min)
 *   - bench:* (varies)
 *
 * Run those separately when the change actually warrants it.
 */
import { spawnSync } from 'node:child_process'

interface Gate {
  name: string
  cmd: string
  /** When to skip — e.g. only run if a specific file changed. */
  skipIf?: () => boolean
}

const GATES: Gate[] = [
  { name: 'lint', cmd: 'bun run lint' },
  { name: 'check-lint-ratchet', cmd: 'bun scripts/check-lint-ratchet.ts' },
  { name: 'check-pyreon-lint-ratchet', cmd: 'bun scripts/check-pyreon-lint-ratchet.ts' },
  { name: 'gen-docs --check', cmd: 'bun run gen-docs --check' },
  { name: 'check-doc-claims', cmd: 'bun scripts/check-doc-claims.ts' },
  { name: 'check-no-legacy-playground', cmd: 'bun scripts/check-no-legacy-playground.ts' },
  { name: 'check-changeset-required', cmd: 'bun scripts/check-changeset-required.ts' },
  { name: 'check-bundle-budgets', cmd: 'bun scripts/check-bundle-budgets.ts' },
  { name: 'check-distribution', cmd: 'bun scripts/check-distribution.ts' },
  { name: 'check-export-entries', cmd: 'bun scripts/check-export-entries.ts' },
  { name: 'check-tsconfig-presets', cmd: 'bun scripts/check-tsconfig-presets.ts' },
  { name: 'check-release-readiness', cmd: 'bun scripts/check-release-readiness.ts' },
  { name: 'check-manifest-depth', cmd: 'bun scripts/check-manifest-depth.ts' },
  { name: 'check-manifest-examples', cmd: 'bun scripts/check-manifest-examples.ts' },
  {
    name: 'check-client-bundle-node-imports',
    cmd: 'bun scripts/check-client-bundle-node-imports.ts',
  },
  { name: 'check-mcp-docs', cmd: 'bun scripts/check-mcp-docs.ts' },
  // A workflow step that RUNS an iOS app must not disable code signing: an
  // unsigned app has no entitlements and securityd denies SecItemAdd, so any
  // Keychain use fails ONLY in CI while passing on every developer machine.
  {
    name: 'check-ios-signing-policy',
    cmd: 'bun scripts/check-ios-signing-policy.ts',
  },
  // A CI job that restores the bootstrap cache (~6 min) must budget for it.
  // Four REQUIRED gates sat at `timeout-minutes: 5`, so setup consumed the
  // whole budget and the check never ran — and a timed-out job reports
  // `cancelled`, which satisfies no required context and shows no red X. The
  // PR just sits at BLOCKED with nothing failing and nothing to fix.
  {
    name: 'check-ci-job-timeouts',
    cmd: 'bun scripts/check-ci-job-timeouts.ts',
  },
  // A cache SAVE key and its RESTORE key must hash the same inputs. hashFiles()
  // is a pure function of its argument list, so two different lists can never
  // produce a matching digest — the restore just misses, silently, forever.
  // Measured cost of the drift this caught: 228 of one CI run's 401
  // runner-minutes spent rebuilding artifacts cached minutes earlier.
  {
    name: 'check-cache-key-sync',
    cmd: 'bun scripts/check-cache-key-sync.ts',
  },
  // A tri-target shared source must be buildable for the WEB target too. The
  // two native targets compile it through PMTC and never read node_modules,
  // so they stay green while the web build cannot resolve a new import —
  // which is how @pyreon/elements + @pyreon/coolgrid shipped as a red e2e
  // ~50 minutes into CI, reported as a blank page rather than a missing dep.
  {
    name: 'check-shared-source-deps',
    cmd: 'bun scripts/check-shared-source-deps.ts',
  },
  // Dogfood: the workspace's own dependency fabric, gated by @pyreon/loom.
  // Errors only (phantom deps, runtime cycles, cross-major drift, internal-
  // range lies); warnings stay advisory. ~1s over the whole repo.
  { name: 'loom-scan', cmd: 'bun packages/tools/loom/src/cli/run-scan-gate.ts' },
  {
    name: 'check-advisory-comment-steps',
    cmd: 'bun scripts/check-advisory-comment-steps.ts',
  },
]

interface Result {
  name: string
  ok: boolean
  durationMs: number
  output: string
}

const startTotal = Date.now()
const results: Result[] = []
const json = process.argv.includes('--json')

for (const gate of GATES) {
  if (gate.skipIf?.()) {
    results.push({ name: gate.name, ok: true, durationMs: 0, output: '(skipped)' })
    continue
  }
  const start = Date.now()
  const r = spawnSync('sh', ['-c', gate.cmd], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const durationMs = Date.now() - start
  const ok = r.status === 0
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  results.push({ name: gate.name, ok, durationMs, output })
  if (!json) {
    const status = ok ? '✓' : '✗'
    const time = `${(durationMs / 1000).toFixed(1)}s`
    console.log(`${status} ${gate.name.padEnd(38)} ${time.padStart(7)}`)
    if (!ok) {
      console.log()
      console.log(output)
      console.log()
    }
  }
}

const totalMs = Date.now() - startTotal
const failed = results.filter((r) => !r.ok)

if (json) {
  console.log(JSON.stringify({ ok: failed.length === 0, totalMs, results }, null, 2))
  process.exit(failed.length > 0 ? 1 : 0)
}

console.log()
if (failed.length === 0) {
  console.log(`✓ all ${results.length} gate(s) passed in ${(totalMs / 1000).toFixed(1)}s`)
  process.exit(0)
}

console.log(
  `✗ ${failed.length} of ${results.length} gate(s) failed in ${(totalMs / 1000).toFixed(1)}s`,
)
console.log()
console.log('Failed gates:')
for (const f of failed) console.log(`  - ${f.name}`)
console.log()
console.log('Fix the failures above and re-run `bun run validate-fast`. Or run a')
console.log('single gate to iterate: `bun run check-doc-claims`, `bun run gen-docs --check`, etc.')
process.exit(1)
