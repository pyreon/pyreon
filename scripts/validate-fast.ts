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
 *   - check-release-readiness (publishConfig.access / fixed-group coverage)
 *   - check-manifest-depth  (LOCKED package density regressed)
 *   - check-client-bundle-node-imports (node: import leaked into client entry)
 *   - check-mcp-docs        (MCP tool added without docs/docs/mcp.md section)
 *   - check-lint-ratchet    (oxlint warn-finding count grew above baseline)
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
  { name: 'gen-docs --check', cmd: 'bun run gen-docs --check' },
  { name: 'check-doc-claims', cmd: 'bun scripts/check-doc-claims.ts' },
  { name: 'check-changeset-required', cmd: 'bun scripts/check-changeset-required.ts' },
  { name: 'check-bundle-budgets', cmd: 'bun scripts/check-bundle-budgets.ts' },
  { name: 'check-distribution', cmd: 'bun scripts/check-distribution.ts' },
  { name: 'check-release-readiness', cmd: 'bun scripts/check-release-readiness.ts' },
  { name: 'check-manifest-depth', cmd: 'bun scripts/check-manifest-depth.ts' },
  {
    name: 'check-client-bundle-node-imports',
    cmd: 'bun scripts/check-client-bundle-node-imports.ts',
  },
  { name: 'check-mcp-docs', cmd: 'bun scripts/check-mcp-docs.ts' },
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
