/**
 * Run moltar/typescript-runtime-type-benchmarks LOCALLY with @pyreon/validate
 * in it, so we can see where we stand against ~40 libraries in THEIR harness
 * before opening an upstream PR.
 *
 * Usage (from the repo root):
 *   bun contrib/moltar/pyreon/run-local.ts
 *   bun contrib/moltar/pyreon/run-local.ts --libs pyreon,zod,valibot,arktype
 *   bun contrib/moltar/pyreon/run-local.ts --validate-version 0.52.0
 *
 * WHAT THIS MEASURES: the PUBLISHED @pyreon/validate, not your working tree.
 * Upstream installs from npm, so that is the honest thing to compare — but it
 * means an unreleased change (e.g. a verdict-JIT still sitting in a PR) will
 * NOT appear here until it ships. Pass --validate-version to pin explicitly.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const UPSTREAM = 'https://github.com/moltar/typescript-runtime-type-benchmarks.git'
const HERE = new URL('.', import.meta.url).pathname
const REPO_ROOT = resolve(HERE, '../../..')

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback)
}

// Scratch clone lives under the USER'S OWN cache dir, deliberately not the OS
// temp dir. `/tmp` is world-writable and this path is predictable, so on a
// shared machine another user could pre-create it as a symlink and the
// writeFileSync calls below would follow it (CodeQL js/insecure-temporary-file,
// flagged high on the first version of this file). A per-user directory removes
// the class outright while still letting the clone be REUSED across runs, which
// matters — re-cloning upstream every time is slow.
const DEFAULT_DIR = join(homedir(), '.cache', 'pyreon', 'moltar-local')
const dir = resolve(arg('--dir', DEFAULT_DIR))
const libs = arg('--libs', 'pyreon,zod,valibot,arktype,typebox').split(',').map(s => s.trim())
const validateVersion = arg('--validate-version', 'latest')
// bun by default: the published packages are ESM-only (no `require` condition),
// so upstream's default ts-node/CJS runner cannot load them at all. See README.
const runtime = arg('--runtime', 'bun')

// A scratch clone of someone else's repo must never land inside ours.
if (dir.startsWith(REPO_ROOT)) {
  console.error(`[moltar] refusing to clone inside the repo: ${dir}`)
  process.exit(1)
}

const run = (cmd: string, args: string[], cwd: string) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit' })

if (!existsSync(join(dir, '.git'))) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  console.log(`[moltar] cloning upstream -> ${dir}`)
  run('git', ['clone', '--depth', '1', UPSTREAM, dir], '/')
} else {
  console.log(`[moltar] reusing existing clone at ${dir}`)
}

const upstreamSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim()

// 1. our case file
copyFileSync(join(HERE, 'cases', 'pyreon.ts'), join(dir, 'cases', 'pyreon.ts'))

// 2. register it in their case list, keeping the array sorted as they do
const idxPath = join(dir, 'cases', 'index.ts')
let idx = readFileSync(idxPath, 'utf8')
if (!/'pyreon'/.test(idx)) {
  idx = idx.replace(/export const cases = \[\n/, "export const cases = [\n  'pyreon',\n")
  writeFileSync(idxPath, idx)
}

// 3. add the dependency
const pkgPath = join(dir, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
pkg.dependencies ??= {}
pkg.dependencies['@pyreon/validate'] = validateVersion
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

console.log(`[moltar] upstream @ ${upstreamSha}`)
console.log(`[moltar] @pyreon/validate@${validateVersion}`)
console.log(`[moltar] libs: ${libs.join(', ')}`)

run('npm', ['install', '--no-audit', '--no-fund'], dir)

// 4. run. Their runner DELIBERATELY swallows a failing case ("Skipped ... due
//    to an error") so one broken library cannot fail the whole matrix. That
//    makes a silent no-result indistinguishable from success here, so the
//    output is captured and asserted rather than trusted.
const invoke: Record<string, [string, string[]]> = {
  bun: ['bun', ['index.ts', 'run', ...libs]],
  node: ['npx', ['ts-node', 'index.ts', 'run', ...libs]],
  deno: ['deno', ['-A', 'index.ts', 'run', ...libs]],
}
const [bin, binArgs] = invoke[runtime] ?? invoke.bun!
try {
  execFileSync(bin, binArgs, { cwd: dir, stdio: 'inherit' })
} catch {
  console.error(`[moltar] runner exited non-zero under ${runtime}`)
}

// VERIFY AGAINST THE RESULTS FILE, not stdout.
//
// Two traps make a stdout check worthless here. Their runner deliberately
// swallows a failing case ("Skipped ... due to an error") so one broken library
// cannot fail the matrix — and the string "@pyreon/validate" appears in npm's
// own install log, so a naive `output.includes(...)` passes even when our case
// never ran. That is not hypothetical: it is exactly what happened on the first
// run of this script, which reported success while producing zero results.
const resultsDir = join(dir, 'docs', 'results')
const candidates = readdirSync(resultsDir).filter(f => f.startsWith(runtime) && f.endsWith('.json'))
const found: string[] = []
for (const f of candidates) {
  const parsed = JSON.parse(readFileSync(join(resultsDir, f), 'utf8')) as {
    results?: { benchmark: string; name: string; ops: number; margin: number }[]
  }
  for (const r of parsed.results ?? []) {
    if (r.name === '@pyreon/validate') {
      found.push(`${r.benchmark}: ${r.ops.toLocaleString()} ops/s (±${r.margin}%)`)
    }
  }
}

const EXPECTED = 4
if (found.length < EXPECTED) {
  console.error(
    `\n[moltar] FAIL — expected ${EXPECTED} @pyreon/validate results, found ${found.length}.\n` +
      `  Their runner skips a failing case silently, so this means our entry did NOT run.\n` +
      `  Reproduce the real error with:\n` +
      `    cd ${dir} && ${runtime === 'node' ? 'npx ts-node' : runtime} index.ts run-internal pyreon\n` +
      `  Do NOT read the other libraries' numbers as a comparison.`,
  )
  process.exit(1)
}

console.log(`\n[moltar] @pyreon/validate results (${runtime}):`)
for (const line of found) console.log(`  ${line}`)
console.log(`\n[moltar] done. upstream=${upstreamSha} validate=${validateVersion} runtime=${runtime}`)
