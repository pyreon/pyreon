#!/usr/bin/env bun
/**
 * validate-fast — run every CI gate that takes < 30 seconds locally.
 *
 * The pre-push hook runs lint + affected-typecheck + affected-tests.
 * Those catch most regressions but miss the gates that have repeatedly
 * tripped freshly-pushed PRs:
 *
 *   - check-doc-claims      (CLAUDE.md doc page count drifted)
 *   - check-multiplatform-matrix (matrix headline drifted from its own table)
 *   - check-changeset-required (no changeset for published-pkg source change)
 *   - check-no-major-changesets (a `major` bump is illegal while Pyreon is 0.x)
 *   - check-bundle-budgets   (new publishable package missing entry)
 *   - check-distribution    (sideEffects / source-map invariants)
 *   - check-export-entries  (subpath export has a build entry — release-build guard)
 *   - check-release-readiness (publishConfig.access / fixed-group coverage)
 *   - check-manifest-depth  (LOCKED package density regressed)
 *   - check-manifest-examples (a manifest api[].example no longer typechecks vs the shipped export)
 *   - check-client-bundle-node-imports (node: import leaked into client entry)
 *   - check-ios-signing-policy (unsigned test step -> CI-only Keychain denial)
 *   - check-shared-source-deps (tri-target shared source unbuildable for web)
 *   - check-native-srcdirs-drift (an example's Gradle srcDirs disagree with `wire`)
 *   - check-lathe-fresh     (committed generated client drifted from its OpenAPI spec)
 *   - check-mcp-docs        (MCP tool added without docs/src/content/docs/mcp.md section)
 *   - loom-scan             (dependency-fabric errors: phantom deps, runtime cycles, drift)
 *   - check-advisory-comment-steps (advisory PR-comment step that can turn a check red)
 *   - check-lint-ratchet    (oxlint warn-finding count grew above baseline)
 *   - check-multiplatform-tier (published pkg without a declared multiplatform story)
 *   - check-native-coverage (an app-runtime pkg that should cross to native regressed)
 *   - check-pyreon-lint-ratchet (@pyreon/lint advisory-finding count over framework src grew above baseline)
 *   - gen-docs --check      (manifest edited but generated files stale)
 *   - check-generated-fresh (the OTHER half of the pair: `anti-patterns.md` /
 *                            manifest edits leave the docs-site reference,
 *                            troubleshooting and examples pages stale)
 *
 * 35 gates, ~4-8s warm on an unloaded machine. The point is: catch ALL the
 * cheap-to-detect failures locally with ONE command before pushing.
 *
 * That number is worth keeping honest, because it is what decides whether
 * people run this or reach for `--no-verify`. It was ~19s until two changes:
 * `check-manifest-examples` stopped rebuilding a 3,191-file TypeScript program
 * four times per run (74% of the wall on its own), and the gates stopped
 * running one at a time.
 *
 * Run:
 *   bun run validate-fast              # all gates, exit 1 on any fail
 *   bun run validate-fast --json       # machine-readable result
 *
 * Gates run CONCURRENTLY (they are independent — see the runner below), but
 * their results print in declaration order, so the output still reads top-down.
 * `--serial` forces one-at-a-time when you need to isolate a gate.
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
import { spawn } from 'node:child_process'
import { availableParallelism } from 'node:os'

interface Gate {
  name: string
  cmd: string
  /** When to skip — e.g. only run if a specific file changed. */
  skipIf?: () => boolean
}

const GATES: Gate[] = [
  { name: 'lint', cmd: 'bun run lint' },
  { name: 'check-lint-ratchet', cmd: 'bun scripts/check-lint-ratchet.ts' },
  { name: 'check-multiplatform-tier', cmd: 'bun scripts/check-multiplatform-tier.ts' },
  // The finish-line ratchet: every app-runtime/feature-building package that
  // SHOULD cross to native either lowers clean through PMTC or ships a native
  // runtime — regressions (a snippet that starts warning, a co-source that
  // vanished) fail here. Runs the real compiler over ~22 snippets (~1-2s).
  { name: 'check-native-coverage', cmd: 'bun scripts/check-native-coverage.ts' },
  { name: 'check-pyreon-lint-ratchet', cmd: 'bun scripts/check-pyreon-lint-ratchet.ts' },
  // App-side line count across the reference apps — the framework's "write
  // less code" claim, ratcheted so it cannot quietly drift the wrong way.
  { name: 'check-app-loc', cmd: 'bun scripts/check-app-loc.ts' },
  // IP: every workspace carries the root LICENSE byte-for-byte and declares
  // "license": "MIT". A published package without either ships with no stated
  // terms; an example without either is code people copy with none.
  { name: 'check-license-coverage', cmd: 'bun scripts/check-license-coverage.ts' },
  { name: 'gen-docs --check', cmd: 'bun run gen-docs --check' },
  // The OTHER half of the generator pair. `gen-docs` regenerates llms/api-reference;
  // `gen-all.ts` regenerates the docs-site reference/troubleshooting/examples pages
  // from `anti-patterns.md` and the manifests. Running only the first leaves the
  // second stale, which is exactly what the `Docs Generated Fresh` CI job catches —
  // and it caught it FOUR times in one day, each costing a CI round trip, because
  // validate-fast checked one half and not the other. 0.3s.
  { name: 'check-generated-fresh', cmd: 'bun docs/scripts/check-generated-fresh.ts' },
  { name: 'check-doc-claims', cmd: 'bun scripts/check-doc-claims.ts' },
  // The multiplatform capability matrix's headline must equal its own table's
  // Σ(weight × fraction) — the page once carried three disagreeing self-ratings.
  { name: 'check-multiplatform-matrix', cmd: 'bun scripts/check-multiplatform-matrix.ts' },
  { name: 'check-no-legacy-playground', cmd: 'bun scripts/check-no-legacy-playground.ts' },
  { name: 'check-changeset-required', cmd: 'bun scripts/check-changeset-required.ts' },
  // Pairs with the one above: having a changeset is not enough, its SEVERITY
  // must be legal for 0.x. Pure file read, milliseconds — and without it the
  // only feedback on a `major` bump is a CI round trip.
  { name: 'check-no-major-changesets', cmd: 'bun scripts/check-no-major-changesets.ts' },
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
  // Milliseconds — it reads two markdown files and one .ts, no scan. This is
  // the half of the docs problem that CANNOT be derived (semantics stay
  // hand-written); the gate makes the one checkable claim about them, that
  // every prop name the prose cites actually exists.
  { name: 'check-prose-props', cmd: 'bun scripts/check-prose-props.ts' },
  { name: 'check-native-runtime-parity', cmd: 'bun scripts/check-native-runtime-parity.ts' },
  // Every native lifecycle container (reactive start()/connect()) is either
  // auto-started by BOTH emits or explicitly registered MANUAL. Catches the
  // "never-wired class": a container whose start() nobody calls ships frozen
  // at its initial value (useOnline true / usePush / useAppState all did).
  { name: 'check-native-lifecycle-wiring', cmd: 'bun scripts/check-native-lifecycle-wiring.ts' },
  // Co-located native runtimes (@pyreon/<pkg>/native/{swift,kotlin}) left the
  // monolith's own test chains — this compiles + smoke-runs them against the
  // stub harness. Skips gracefully when kotlinc/swiftc are absent (CI Fast
  // Gates), so it protects on every local push where the toolchains exist.
  { name: 'check-native-primitive-coverage', cmd: 'bun scripts/check-native-primitive-coverage.ts' },
  { name: 'check-native-cosource', cmd: 'bun scripts/check-native-cosource.ts' },
  { name: 'check-native-srcdirs-drift', cmd: 'bun scripts/check-native-srcdirs-drift.ts' },
  { name: 'check-gates-wired', cmd: 'bun scripts/check-gates-wired.ts' },
  { name: 'check-component-docs', cmd: 'bun scripts/check-component-docs.ts' },
  // NOT here: `check-atlas-guide`. It MOUNTS 108 components through Vite, and
  // measured cold it costs ~48s — which would take this list from ~19s to ~66s
  // and turn the pre-push hook into something people reach for `--no-verify` to
  // avoid. A gate everyone bypasses protects nothing. It runs in CI instead
  // (`Fast Gates` → "Atlas Agent Guide"), and locally on demand via
  // `bun run atlas-guide`.
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
  // Shell has no hoisting, and `bash -n` cannot see it — the script is
  // syntactically valid and the failure is ordering. A helper defined below an
  // EARLY-EXIT branch is a path no pull request exercises, so it stays green on
  // every PR and exits 127 on the first push to main.
  {
    name: 'check-workflow-shell-order',
    cmd: 'bun scripts/check-workflow-shell-order.ts',
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
  // Generated client code is COMMITTED, so a spec edit without a regeneration
  // leaves the repo describing an API that no longer exists — and the stale
  // client typechecks perfectly against itself, so nothing else notices.
  // Imports the generator from source (never spawns the bin, which reads
  // `lib/` and would report a false GREEN against an unbuilt tree).
  {
    name: 'check-lathe-fresh',
    cmd: 'bun scripts/check-lathe-fresh.ts',
  },
  {
    name: 'check-shared-source-deps',
    cmd: 'bun scripts/check-shared-source-deps.ts',
  },
  // AGP's minimum Gradle vs the version native-device.yml pins. They live in
  // different files with nothing linking them, and disagreeing costs ~6
  // minutes into a native-labelled-only job for a one-line mismatch:
  // "Minimum supported Gradle version is 8.13. Current version is 8.10.2."
  {
    name: 'check-agp-gradle-lockstep',
    cmd: 'bun scripts/check-agp-gradle-lockstep.ts',
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
const json = process.argv.includes('--json')
const serial = process.argv.includes('--serial')

const CWD = new URL('..', import.meta.url).pathname

/**
 * Why these run CONCURRENTLY.
 *
 * The gates are independent by construction — every one of them either only
 * READS the tree, or writes somewhere no other gate touches. The three that can
 * write a shared file (`check-lint-ratchet`, `check-pyreon-lint-ratchet`,
 * `check-bundle-budgets`) do so only behind `--update` / `--write-table`, which
 * this runner never passes; `check-manifest-examples` owns `.cache/manifest-
 * examples` exclusively. So there is no ordering constraint to respect, and
 * running them one at a time just serialises ~30 process startups behind one
 * long gate.
 *
 * Output ordering is preserved exactly: results are printed in DECLARATION
 * order as a cursor advances over completed gates, so the transcript reads
 * top-down the same way it always has. Concurrency changes when work happens,
 * not how it is reported.
 *
 * `--serial` restores one-at-a-time execution. Keep it: when a gate misbehaves
 * only under load, being able to take concurrency out of the picture is the
 * difference between a diagnosis and a guess.
 */
const POOL = serial ? 1 : Math.max(2, Math.min(8, (availableParallelism?.() ?? 4) - 1))

function runGate(gate: Gate): Promise<Result> {
  if (gate.skipIf?.()) {
    return Promise.resolve({ name: gate.name, ok: true, durationMs: 0, output: '(skipped)' })
  }
  return new Promise((resolveGate) => {
    const start = Date.now()
    const child = spawn('sh', ['-c', gate.cmd], { cwd: CWD, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let settled = false
    // Every exit path must resolve exactly once. A pool worker awaits this
    // promise, so an unhandled spawn failure would not fail the run — it would
    // HANG it, with no output and nothing to read. Worse than a red gate.
    const finish = (ok: boolean, text: string) => {
      if (settled) return
      settled = true
      resolveGate({ name: gate.name, ok, durationMs: Date.now() - start, output: text.trim() })
    }
    child.stdout.on('data', (c: Buffer) => (out += c))
    child.stderr.on('data', (c: Buffer) => (out += c))
    child.on('error', (err) => finish(false, `${out}\nfailed to start: ${err.message}`))
    child.on('close', (code) => finish(code === 0, out))
  })
}

const results: Result[] = new Array(GATES.length)

async function runAll(): Promise<void> {
  let next = 0
  // The print cursor. A gate is only printed once every gate declared before it
  // has finished, which is what keeps the output identical to the serial run.
  let printed = 0
  const flush = () => {
    if (json) return
    while (printed < GATES.length && results[printed] !== undefined) {
      const r = results[printed]!
      const time = `${(r.durationMs / 1000).toFixed(1)}s`
      console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(38)} ${time.padStart(7)}`)
      if (!r.ok) console.log(`\n${r.output}\n`)
      printed++
    }
  }
  const worker = async (): Promise<void> => {
    while (next < GATES.length) {
      const index = next++
      results[index] = await runGate(GATES[index]!)
      flush()
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, GATES.length) }, worker))
}

await runAll()

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
