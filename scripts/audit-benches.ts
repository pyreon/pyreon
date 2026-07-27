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

interface Row {
  file: string
  deterministic: boolean
  competitor: string | null
  competitorStatic: boolean
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

const rows: Row[] = []
for (const f of files) {
  let raw: string
  try { raw = readFileSync(f, 'utf8') } catch { continue }
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
    competitor,
    competitorStatic,
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
  if (r.competitor && !isBundleSize(r.file)) {
    // A top-level assignment IS sufficient when the competitor is loaded by a
    // DYNAMIC import (it runs after the assignment). Only a STATIC competitor
    // import needs the self-re-exec guard.
    if (r.prod === 'none') issues.push('PROD:none')
    else if (r.competitorStatic && r.prod === 'toplevel') issues.push('PROD:hoisted (static competitor import)')
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
