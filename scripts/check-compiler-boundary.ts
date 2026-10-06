#!/usr/bin/env bun
/**
 * Compiler boundary ratchet — library knowledge inside the compilers may only SHRINK.
 *
 * A compiler should know its CONTRACT (the runtime helpers it injects, the
 * authoring API it lowers) and nothing about individual libraries. The test for
 * any line: "if I deleted package X from the monorepo, would this line need
 * editing?" If yes, the compiler is carrying X's knowledge.
 *
 * Today both compilers carry a lot of it (`parse.ts` alone names 56 hooks and
 * hundreds of `@pyreon/*` specifiers). The architecture plan moves that
 * knowledge into the packages that own it, one library at a time. This gate is
 * the number that goes down while that happens, and it refuses to let it go up
 * while it is happening — the same shape as `lint-baseline.json`.
 *
 * Two measures, per compiler (`native-compiler`, `compiler`):
 *   1. `packages` — occurrences of a quoted `@pyreon/<name>` specifier in
 *      non-test source, per library name. CONTRACT packages (the runtime the
 *      compiler targets, and the authoring API PMTC lowers) are not counted.
 *   2. `hooks` — occurrences of a quoted `useXxx` hook-name literal. These are
 *      the by-name recognizers the plugin work replaces with import-keyed claims.
 *
 * Decreases pass (tighten with `--update`). A NEW library name, or any count
 * above its baseline, fails and names the files. `--update` refuses to raise a
 * number: fix the code, or scope it with a rationale, never absorb a finding.
 *
 * Usage:
 *   bun scripts/check-compiler-boundary.ts            # gate
 *   bun scripts/check-compiler-boundary.ts --json
 *   bun scripts/check-compiler-boundary.ts --update   # tighten the baseline (only DOWN)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// `import.meta.dir` is Bun-only; tests import these scripts under vitest, so derive it portably.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

const REPO_ROOT = resolve(SCRIPT_DIR, '..')
export const BASELINE_PATH = join(SCRIPT_DIR, 'compiler-boundary-baseline.json')

export interface CompilerSpec {
  /** Key in the baseline. */
  id: string
  /** Source dir, repo-relative. */
  dir: string
  /** `@pyreon/<name>` names that are the compiler's CONTRACT, not library knowledge. */
  contract: readonly string[]
  /** Files that are GENERATED from a library's own source (counted elsewhere, by their generator's gate). */
  generated: readonly string[]
}

export const COMPILERS: readonly CompilerSpec[] = [
  {
    id: 'native-compiler',
    dir: 'packages/native/compiler/src',
    // primitives is the cross-target authoring API PMTC exists to lower; core/compiler are the substrate.
    contract: ['primitives', 'core', 'compiler', 'reactivity', 'native-compiler'],
    generated: [
      // @pyreon/hooks' own plugin, copied by scripts/gen-native-builtin-plugins.ts (freshness-gated).
      'built-in-services.generated.ts',
    ],
  },
  {
    id: 'compiler',
    dir: 'packages/core/compiler/src',
    // The runtime packages whose helpers the transform injects.
    contract: ['core', 'reactivity', 'runtime-dom', 'runtime-server', 'compiler'],
    generated: [],
  },
]

export interface BoundaryCounts {
  packages: Record<string, number>
  hooks: number
}
export type BoundaryBaseline = Record<string, BoundaryCounts>

/**
 * Read a file that may not exist. A missing file is a read miss, not a separate "does it exist"
 * check followed by a read (that pair is a time-of-check/time-of-use race). Only ENOENT is swallowed.
 */
function readOptional(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

const SPECIFIER = /['"`]@pyreon\/([a-z0-9-]+)/g
const HOOK_LITERAL = /['"`]use[A-Z][A-Za-z0-9]*['"`]/g

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'tests' || name === '__tests__' || name === 'fixtures' || name === 'golden-fixtures' || name === 'node_modules') continue
      walk(full, out)
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

export interface FileHit {
  file: string
  packages: Record<string, number>
  hooks: number
}

/** Pure: count the two measures in one file's source text. */
export function countSource(
  rawSource: string,
  contract: readonly string[],
): { packages: Record<string, number>; hooks: number } {
  // Whole-line comments are prose, not knowledge the compiler acts on. Only whole lines are
  // dropped, never a `//` inside a string, so a URL literal cannot make code vanish from the count.
  const source = rawSource
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n')
  const skip = new Set(contract)
  const packages: Record<string, number> = {}
  for (const m of source.matchAll(SPECIFIER)) {
    const name = `@pyreon/${m[1]}`
    if (skip.has(m[1] as string)) continue
    packages[name] = (packages[name] ?? 0) + 1
  }
  return { packages, hooks: (source.match(HOOK_LITERAL) ?? []).length }
}

export function measure(spec: CompilerSpec, root = REPO_ROOT): { counts: BoundaryCounts; files: FileHit[] } {
  const base = join(root, spec.dir)
  const files: FileHit[] = []
  const counts: BoundaryCounts = { packages: {}, hooks: 0 }
  let sources: string[]
  try {
    sources = walk(base)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { counts, files }
    throw error
  }
  for (const file of sources) {
    if (spec.generated.some((g) => file.endsWith(g))) continue
    const c = countSource(readFileSync(file, 'utf8'), spec.contract)
    if (Object.keys(c.packages).length === 0 && c.hooks === 0) continue
    files.push({ file: relative(root, file), ...c })
    for (const [k, v] of Object.entries(c.packages)) counts.packages[k] = (counts.packages[k] ?? 0) + v
    counts.hooks += c.hooks
  }
  counts.packages = Object.fromEntries(Object.entries(counts.packages).sort(([a], [b]) => a.localeCompare(b)))
  return { counts, files }
}

export interface Regression {
  compiler: string
  what: string
  baseline: number
  current: number
}

/** Pure: anything above baseline (or a library name the baseline has never seen) is a regression. */
export function compareToBaseline(current: BoundaryCounts, baseline: BoundaryCounts | undefined, compiler: string): Regression[] {
  const out: Regression[] = []
  const b = baseline ?? { packages: {}, hooks: 0 }
  for (const [name, n] of Object.entries(current.packages)) {
    const was = b.packages[name] ?? 0
    if (n > was) out.push({ compiler, what: name, baseline: was, current: n })
  }
  if (current.hooks > b.hooks) out.push({ compiler, what: 'hook-name literals', baseline: b.hooks, current: current.hooks })
  return out
}

/** Pure: the tightened baseline — each number is min(current, previous); never raised. */
export function tighten(current: BoundaryCounts, baseline: BoundaryCounts | undefined): BoundaryCounts {
  const b = baseline ?? { packages: {}, hooks: Number.POSITIVE_INFINITY }
  const packages: Record<string, number> = {}
  for (const [name, n] of Object.entries(current.packages)) {
    packages[name] = Math.min(n, b.packages[name] ?? n)
  }
  return { packages, hooks: Math.min(current.hooks, b.hooks) }
}

function total(c: BoundaryCounts): number {
  return Object.values(c.packages).reduce((a, n) => a + n, 0)
}

function main(): number {
  const args = process.argv.slice(2)
  const measured = COMPILERS.map((spec) => ({ spec, ...measure(spec) }))
  const baselineText = readOptional(BASELINE_PATH)
  const baseline: BoundaryBaseline = baselineText === null ? {} : (JSON.parse(baselineText) as BoundaryBaseline)

  if (args.includes('--update')) {
    const next: BoundaryBaseline = {}
    for (const m of measured) {
      const regress = compareToBaseline(m.counts, baseline[m.spec.id], m.spec.id)
      // First write (no baseline yet) seeds; afterwards only DOWN.
      if (baseline[m.spec.id] && regress.length > 0) {
        console.error(
          `[check-compiler-boundary] refusing to raise the baseline for ${m.spec.id}: ${regress.map((r) => `${r.what} ${r.baseline}→${r.current}`).join(', ')}`,
        )
        return 1
      }
      next[m.spec.id] = tighten(m.counts, baseline[m.spec.id])
    }
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`)
    console.log('[check-compiler-boundary] baseline written')
    return 0
  }

  const regressions = measured.flatMap((m) => compareToBaseline(m.counts, baseline[m.spec.id], m.spec.id))
  if (args.includes('--json')) {
    console.log(JSON.stringify({ measured: Object.fromEntries(measured.map((m) => [m.spec.id, m.counts])), regressions }, null, 2))
    return regressions.length > 0 ? 1 : 0
  }
  for (const m of measured) {
    console.log(`[check-compiler-boundary] ${m.spec.id}: ${total(m.counts)} library specifiers across ${Object.keys(m.counts.packages).length} packages, ${m.counts.hooks} hook-name literals`)
  }
  if (regressions.length === 0) return 0
  console.error('[check-compiler-boundary] library knowledge INCREASED inside a compiler:')
  for (const r of regressions) console.error(`  ${r.compiler}: ${r.what} ${r.baseline} → ${r.current}`)
  for (const m of measured) {
    const names = new Set(regressions.filter((r) => r.compiler === m.spec.id).map((r) => r.what))
    if (names.size === 0) continue
    console.error(`  files in ${m.spec.id} naming a regressed item:`)
    for (const hit of m.files.filter((h) => [...names].some((n) => n in h.packages || n === 'hook-name literals')).slice(0, 12)) {
      console.error(`    ${hit.file}`)
    }
  }
  console.error(
    '\nA compiler must not learn about individual libraries. Declare the knowledge in the owning package (a native plugin) instead. See the compiler-boundary plan. Never raise the baseline to absorb a finding.',
  )
  return 1
}

if (import.meta.main) process.exit(main())
