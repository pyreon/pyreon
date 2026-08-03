/**
 * Benchmark objectivity audit.
 *
 * Checks every bench in the repo against the criteria the KNOWN-GOOD harnesses
 * establish (`ssr-crossframework.ts`, `validate.ts`, `router.ts`). A bench that
 * compares us to a competitor and fails these is not just noisy — it can
 * produce a claim that is wrong in our favour, which is the failure mode that
 * matters most.
 *
 * Criteria:
 *   PROD    NODE_ENV=production reaches the libs. A self-re-exec guard is the
 *           only form that beats ESM import hoisting for a library that selects
 *           its build at module-init (react-dom). A top-level assignment works
 *           only for call-time gates.
 *   GATE    A correctness gate runs BEFORE timing. Without it a "win" can be a
 *           renderer emitting nothing.
 *   STATS   Median + CI/tie detection, not a single duration or a bare mean.
 *   ISO     Per-impl process isolation, or interleaving, so JIT/GC debt does
 *           not land on one contestant.
 *   ROTATE  Rotated inputs — a constant closed-over input lets the JIT
 *           over-specialise and fabricates cross-lib verdicts.
 *   NOGC    No forced GC inside timed regions (jettisons compiled code in JSC).
 *
 * usage: bun scripts/audit-benches.ts [--all]
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const showAll = process.argv.includes('--all')

const files = execSync(
  `find scripts/bench packages -name '*.ts' -path '*bench*' -not -path '*/node_modules/*' -not -path '*/lib/*' -not -name '*.test.ts' | sort`,
)
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean)

// Competitor packages we benchmark against, by import specifier.
const COMPETITORS = [
  'react-dom', '@preact/signals', 'preact', 'solid-js', 'vue', 'svelte',
  'zustand', 'jotai', 'valtio', 'mobx', 'redux',
  'zod', 'valibot', 'arktype', 'yup', 'joi',
  '@tanstack/', 'react-query', 'react-table', 'react-virtual',
  'find-my-way', 'radix3', 'hono', 'react-router', 'vue-router', 'next',
  'i18next', 'xstate', 'mobx-state-tree', 'casl', 'unhead',
  'tinykeys', 'hotkeys-js', 'mousetrap', 'immer', 'yjs',
  'echarts-for-react', '@uiw/react-codemirror', '@tiptap/react',
  'motion', 'framer-motion', 'react-hot-toast', 'sonner',
]

/**
 * Does this package actually vary its behavior by NODE_ENV?
 *
 * Only such a package can be HURT by a hoisted `process.env.NODE_ENV`
 * assignment. react-dom is the canonical case (separate development/production
 * builds chosen at module-init). A package with neither development/production
 * export conditions nor any `process.env.NODE_ENV` reference in its shipped
 * code cannot be affected, so a static import of it is harmless.
 *
 * Resolution is best-effort: an UNRESOLVABLE package returns `true` (assume
 * risk) so a missing install can never silently downgrade a real finding.
 */
function packageVariesByNodeEnv(pkg: string): boolean {
  try {
    // `require.resolve` alone is not enough: under bun's ISOLATED layout the
    // package lives in `node_modules/.bun/<name>@<ver>/node_modules/<name>` and
    // is not resolvable from the repo root, so resolution failed for
    // `@preact/signals-core` and `yjs` and the assume-risk fallback fired —
    // reinstating exactly the false positives this check removes. Fall back to
    // locating the package on disk before giving up.
    let pkgJsonPath = execSync(
      `node -e "try{process.stdout.write(require.resolve('${pkg}/package.json',{paths:['${process.cwd()}']}))}catch(e){}"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    if (!pkgJsonPath) {
      pkgJsonPath = execSync(
        `find node_modules/.bun -maxdepth 4 -type d -path '*/${pkg}' 2>/dev/null | head -1`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim()
      if (pkgJsonPath) pkgJsonPath = `${pkgJsonPath}/package.json`
    }
    if (!pkgJsonPath) return true
    const dir = pkgJsonPath.replace(/\/package\.json$/, '')
    const manifest = readFileSync(pkgJsonPath, 'utf8')
    if (/"(development|production)"\s*:/.test(manifest)) return true
    const grep = execSync(
      `grep -rlF "process.env.NODE_ENV" "${dir}" '--include=*.js' '--include=*.mjs' '--include=*.cjs' 2>/dev/null | head -1`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    return grep.length > 0
  } catch {
    return true
  }
}

interface Row {
  file: string
  deterministic: boolean
  /** Does this file ever read a clock? If not, it published no speed number. */
  timing: boolean
  competitor: string | null
  competitorStatic: boolean
  competitorSpecifier: string | null
  competitorHasDevGate: boolean
  prod: 'reexec' | 'toplevel' | 'external' | 'none'
  gate: boolean
  stats: boolean
  iso: boolean
  rotate: boolean
  forcedGc: boolean
}

// Deterministic COUNT benches (render counts, setOption counts, cell re-runs)
// produce the same integer every run — a median or CI over them is meaningless.
// They need a GATE, not STATS.
const isDeterministicCount = (src: string) =>
  /deterministic (render )?count|render COUNT|DETERMINISTIC/i.test(src)

/**
 * Not every competitor-comparing file is a TIMING benchmark.
 *
 * `validate/typecheck.ts` is a compile-time inference-equality check — `tsc`
 * errors ARE the result, nothing executes. `validate/behavior.ts` prints each
 * library's real error shapes side by side and asserts nothing. Both compare
 * against zod/valibot/arktype, so they look competitor-facing, but neither
 * makes a throughput claim — and PROD / STATS exist solely to protect
 * throughput claims. Flagging them demanded a production gate and a median for
 * code that never calls a clock, which is noise that trains people to ignore
 * the audit.
 *
 * The discriminator is mechanical rather than a name list: a file that never
 * reads a clock cannot have published a speed number.
 */
const isTimingBench = (src: string) => /performance\.now\(|Bun\.nanoseconds\(|hrtime/.test(src)

/**
 * Runner + injected-payload pairs.
 *
 * A bench is not always ONE file. `packages/ui-system/kinetic/bench` is a
 * `run.ts` harness that `Bun.build`s `scenarios.ts` and executes it inside real
 * Chromium — the competitor (`motion`) is imported by the PAYLOAD while the
 * controls (NODE_ENV, correctness gate, median + CI95) live in the RUNNER,
 * which is the only correct place for them: a `process.env.NODE_ENV` assignment
 * inside browser-injected code is meaningless.
 *
 * Auditing the payload alone reported `PROD:none, no STATS` for a bench that is
 * fully controlled — a false positive that would have been "fixed" by adding
 * dead code to the payload. So a file's control surface includes any SIBLING
 * bench file that references it by name.
 */
const siblingHarnessSrc = new Map<string, string>()
for (const f of files) {
  const dir = f.slice(0, f.lastIndexOf('/'))
  const base = f.slice(f.lastIndexOf('/') + 1)
  let extra = ''
  for (const other of files) {
    // SAME directory only, not the whole subtree: `scripts/bench/run-all.ts`
    // names every `scripts/bench/core/*.ts` it orchestrates, and a subtree
    // match folded all of their sources into it — which made the orchestrator
    // itself look competitor-facing. A runner/payload pair is always siblings.
    if (other === f || other.slice(0, other.lastIndexOf('/')) !== dir) continue
    try {
      const otherSrc = readFileSync(other, 'utf8')
      if (otherSrc.includes(base)) extra += `\n${otherSrc}`
    } catch {
      /* unreadable sibling — ignore */
    }
  }
  if (extra) siblingHarnessSrc.set(f, extra)
}

const rows: Row[] = []
for (const f of files) {
  let raw: string
  try { raw = readFileSync(f, 'utf8') } catch { continue }
  // Fold in the harness that injects this file, if any — see above.
  raw += siblingHarnessSrc.get(f) ?? ''
  // Strip comments FIRST — every early false positive came from prose. Four
  // benches were flagged for "forced GC" purely because their headers explain
  // why they deliberately do NOT call `Bun.gc(true)`.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n')
  // Only consider real import specifiers, not prose in comments.
  const staticImports = src.split('\n').filter((l) => /^\s*import\s/.test(l)).join('\n')
  const dynamicImports = src.split('\n').filter((l) => /await import\(/.test(l)).join('\n')
  const hit = (hay: string, c: string) => hay.includes(`'${c}`) || hay.includes(`"${c}`)
  const competitor = COMPETITORS.find((c) => hit(staticImports, c) || hit(dynamicImports, c)) ?? null
  // A competitor loaded by STATIC import is hoisted ABOVE a top-level
  // `process.env.NODE_ENV` assignment, so the assignment cannot save it.
  // Measured: react-dom via static import renders at 96.1us vs 13.9us dynamic
  // — a 6.9x penalty from silently loading its DEV build.
  const competitorStatic = competitor ? hit(staticImports, competitor) : false

  // ...but hoisting can only BITE a library that actually varies by NODE_ENV.
  // react-dom does (separate development/production builds selected at
  // module-init). Most do not: `@tanstack/form-core`, `@preact/signals-core`
  // and `zod` contain ZERO `process.env.NODE_ENV` references in their dist and
  // ship no development/production export conditions, so a hoisted assignment
  // changes nothing for them.
  //
  // Flagging on the SYNTAX alone produced 8 findings that were all false
  // positives — an audit nobody could act on, which is worse than no audit
  // (see .claude/rules/workflow.md "a red gate is a dead gate"). Resolve the
  // competitor and check whether a dev/prod split exists at all; flag only
  // then, so every remaining finding is real.
  // COMPETITORS holds PREFIXES ('@tanstack/'), so resolve the ACTUAL specifier
  // the file imports — resolving the prefix would always fail and fall back to
  // "assume risk", reinstating the false positives this check exists to remove.
  const competitorSpecifier = competitor
    ? (staticImports.match(
        new RegExp(`['"](${competitor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^'"]*)['"]`),
      )?.[1] ?? competitor)
    : null
  const competitorHasDevGate = competitorSpecifier
    ? packageVariesByNodeEnv(competitorSpecifier)
    : false

  const prod: Row['prod'] = /spawnSync\(\[['"]bun['"],\s*import\.meta\.path/.test(src)
    ? 'reexec'
    : /^\s*process\.env\.NODE_ENV\s*=/m.test(src)
      ? 'toplevel'
      : /NODE_ENV=production/.test(src)
        ? 'external'
        : 'none'

  rows.push({
    file: f,
    deterministic: isDeterministicCount(raw),
    timing: isTimingBench(src),
    competitor,
    competitorStatic,
    competitorSpecifier,
    competitorHasDevGate,
    prod,
    // A gate is any pre-timing assertion that ABORTS. In-tree that is spelled
    // three ways: an explicit "CORRECTNESS GATE" throw, a bare
    // `throw new Error(...)` after comparing the two sides, or `process.exit(1)`.
    // The first version only matched the literal phrase and so reported three
    // properly-gated benches (charts, table-rerender, toast-commit) as gapless.
    gate:
      /correctness gate|CORRECTNESS|verifyCorrect|assertSame|sanity check/i.test(src) ||
      /throw new Error\(/.test(src) ||
      /process\.exit\(1\)/.test(src),
    stats: /bootstrapCI|percentile|median|ci95|CI95|p50/i.test(src),
    iso: /spawnSync|Bun\.spawn|child_process|interleav|round-robin|process isolation|per-op process/i.test(src),
    rotate: /rotat|inputPool|pool\[|inputs\[i %|% inputs\.length|cycle/i.test(src),
    forcedGc: /Bun\.gc\(true\)|global\.gc\(\)|globalThis\.gc\(\)/.test(src),
  })
}

// Bundle-SIZE benches are deterministic byte counts — medians, correctness
// gates and process isolation are meaningless for them.
const isBundleSize = (f: string) => /bundle|bundle-size|\/bundle\//.test(f)

const bad = (r: Row) => {
  const issues: string[] = []
  // A file that never reads a clock published no speed number, so the
  // throughput controls do not apply to it — see `isTimingBench`.
  if (r.competitor && !isBundleSize(r.file) && r.timing) {
    // A top-level assignment IS sufficient when the competitor is loaded by a
    // DYNAMIC import (it runs after the assignment). Only a STATIC competitor
    // import needs the self-re-exec guard.
    if (r.prod === 'none') issues.push('PROD:none')
    else if (r.competitorStatic && r.competitorHasDevGate && r.prod === 'toplevel')
      issues.push(`PROD:hoisted (static import of ${r.competitorSpecifier}, which VARIES by NODE_ENV)`)
    if (!r.gate) issues.push('no GATE')
    if (!r.stats && !r.deterministic) issues.push('no STATS')
  }
  if (r.forcedGc) issues.push('forced GC')
  return issues
}

const competitorRows = rows.filter((r) => r.competitor)
console.log(`Benchmark objectivity audit — ${rows.length} bench file(s), ${competitorRows.length} compare against a competitor\n`)

console.log('COMPETITOR-FACING BENCHES (claims about other libraries)')
console.log('='.repeat(100))
console.log(
  `${'file'.padEnd(52)}${'vs'.padEnd(16)}${'PROD'.padEnd(9)}${'GATE'.padEnd(6)}${'STATS'.padEnd(7)}${'ISO'.padEnd(5)}ROT`,
)
console.log('-'.repeat(100))
const flagged: Row[] = []
for (const r of competitorRows.sort((a, b) => a.file.localeCompare(b.file))) {
  const issues = bad(r)
  if (issues.length) flagged.push(r)
  console.log(
    `${r.file.replace('packages/', '').replace('scripts/bench/', '~/').padEnd(52)}` +
      `${(r.competitor ?? '').slice(0, 14).padEnd(16)}${r.prod.padEnd(9)}` +
      `${(r.gate ? 'yes' : 'NO').padEnd(6)}${(r.stats ? 'yes' : 'NO').padEnd(7)}` +
      `${(r.iso ? 'yes' : 'NO').padEnd(5)}${r.rotate ? 'yes' : '-'}`,
  )
}

console.log(`\nFLAGGED (${flagged.length} competitor-facing bench(es) missing an objectivity control)`)
console.log('='.repeat(100))
for (const r of flagged) console.log(`  ${r.file}\n      -> ${bad(r).join(', ')}`)

const gcOffenders = rows.filter((r) => r.forcedGc)
if (gcOffenders.length) {
  console.log(`\nFORCED GC inside a bench (${gcOffenders.length}) — jettisons compiled code in JSC:`)
  for (const r of gcOffenders) console.log(`  ${r.file}`)
}

if (showAll) {
  console.log('\nPYREON-ONLY BENCHES (no competitor — lower bar, but noise still misleads)')
  console.log('='.repeat(100))
  for (const row of rows.filter((x) => !x.competitor).sort((a, b) => a.file.localeCompare(b.file))) {
    console.log(`${row.file.padEnd(60)} PROD:${row.prod.padEnd(9)} STATS:${row.stats ? 'yes' : 'NO'}`)
  }
}

process.exit(flagged.length > 0 ? 1 : 0)
