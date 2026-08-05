/**
 * `loom scan` benchmark — phase timings over a real workspace.
 *
 * Loom's cost is not a micro-op; it is walking a monorepo and lexing every
 * source file in it. So this bench measures the PHASES of a real scan against
 * a real tree (this repo by default), which is the only shape that answers
 * "did that change make `loom scan` faster?".
 *
 * ── Measurement discipline ──────────────────────────────────────────────────
 *
 * 1. PHASES, NOT A TOTAL. 98% of a scan is the import phase; a total alone
 *    hides which change moved what, and invites optimizing the 2%.
 * 2. A CORRECTNESS GATE BEFORE ANY TIMING. It asserts the scan found packages,
 *    edges and specifiers. A scan that silently finds nothing reads as
 *    infinitely fast, and an empty corpus must never report as a pass — the
 *    same rule the repo's gates follow.
 * 3. MEDIAN OF N, WARMED. The first pass pays cold page cache and cold JIT;
 *    both would be attributed to whichever arm ran first.
 * 4. CACHE STATE IS STATED. Every number here is WARM-cache. Comparing a warm
 *    run to a cold one manufactures a win, so an A/B must hold this equal.
 *
 * A comparison is a comparison of two of these runs on the SAME tree with the
 * machine otherwise idle. Never run it alongside a test suite or an install:
 * this repo has measured load-driven swings that flip a verdict outright.
 *
 *   bun run bench:loom               # this repo
 *   bun run bench:loom -- <path>     # another workspace
 *   bun run bench:loom -- <path> 9   # 9 rounds
 */
import { scanWorkspace } from '../../../packages/tools/loom/src/core/workspace'
import { analyzeGraph, externalUsage } from '../../../packages/tools/loom/src/core/graph'
import { scanImports } from '../../../packages/tools/loom/src/core/imports'
import {
  detectCycles,
  detectInternalRange,
  detectPeerMismatch,
  detectPhantoms,
  detectUnused,
  detectVersionDrift,
} from '../../../packages/tools/loom/src/core/detect'

const args = process.argv.slice(2)
const ROOT = args[0] ?? new URL('../../../', import.meta.url).pathname
const ROUNDS = Number(args[1] ?? 7)

const now = (): number => Number(process.hrtime.bigint()) / 1e6
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!

interface Row {
  workspace: number
  graph: number
  imports: number
  detect: number
  total: number
}

function once(): { row: Row; packages: number; edges: number; specifiers: number; issues: number } {
  let t = now()
  const model = scanWorkspace(ROOT)
  const workspace = now() - t

  t = now()
  const graph = analyzeGraph(model)
  const external = externalUsage(model)
  const graphMs = now() - t

  t = now()
  const imports = scanImports(ROOT, model.packages, model.root.devPaths ?? [])
  const importsMs = now() - t

  t = now()
  const issues = [
    ...detectVersionDrift(external, model.root.overrides),
    ...detectInternalRange(model),
    ...detectCycles(graph),
    ...detectPeerMismatch(model),
    ...detectPhantoms(model, imports),
    ...detectUnused(model, imports),
  ]
  const detectMs = now() - t

  let specifiers = 0
  for (const perPackage of imports.prod.values()) specifiers += perPackage.size

  return {
    row: {
      workspace,
      graph: graphMs,
      imports: importsMs,
      detect: detectMs,
      total: workspace + graphMs + importsMs + detectMs,
    },
    packages: model.packages.length,
    edges: graph.edges.length,
    specifiers,
    issues: issues.length,
  }
}

// ── correctness gate — before any timing ────────────────────────────────────
const probe = once()
const complaints: string[] = []
if (probe.packages === 0) complaints.push('no workspace packages found')
if (probe.edges === 0) complaints.push('no internal edges found')
if (probe.specifiers === 0) complaints.push('no prod specifiers found — the import scan did nothing')
if (complaints.length > 0) {
  console.error(`[bench:loom] refusing to report timings for ${ROOT}:`)
  for (const c of complaints) console.error(`  - ${c}`)
  console.error('  A scan that finds nothing measures as infinitely fast.')
  process.exit(1)
}

console.log(`loom scan — ${ROOT}`)
console.log(
  `  ${probe.packages} package(s) · ${probe.edges} internal edge(s) · ` +
    `${probe.specifiers} prod specifier(s) · ${probe.issues} finding(s)`,
)
console.log(`  ${ROUNDS} rounds, median, WARM cache\n`)

once() // warm

const rows: Row[] = []
for (let r = 0; r < ROUNDS; r += 1) rows.push(once().row)

const totalMed = median(rows.map((x) => x.total))
for (const key of ['workspace', 'graph', 'imports', 'detect'] as const) {
  const m = median(rows.map((x) => x[key]))
  console.log(`  ${key.padEnd(10)} ${m.toFixed(1).padStart(8)} ms   ${((m / totalMed) * 100).toFixed(1)}%`)
}
console.log(`  ${'total'.padEnd(10)} ${totalMed.toFixed(1).padStart(8)} ms`)
