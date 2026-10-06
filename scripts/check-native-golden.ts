#!/usr/bin/env bun
/**
 * Native-compiler GOLDEN corpus — the refactor lock for the PMTC emitters.
 *
 * The boundary plan moves library-specific lowering out of
 * `@pyreon/native-compiler` core into package-owned plugins. Every step of
 * that move must leave the emitted Swift and Kotlin BYTE-IDENTICAL, and the
 * unit suite alone cannot prove it: its snippets are hand-picked, and a
 * refactor can change output for a shape nobody wrote a test for.
 *
 * This gate compiles a fixed corpus for BOTH targets and compares a hash of
 * (code + warnings) per entry against a committed golden file:
 *
 *   - every `packages/native/compiler/src/fixtures/*.tsx`
 *   - every `packages/native/compiler/src/golden-fixtures/*.tsx` and `packages/fundamentals/charts/native-golden/*.tsx`
 *     (shapes that warn by design; the chart ones are owned by `@pyreon/charts`, whose plugin they exercise)
 *   - every shared example source `examples/native-STAR/src/*.tsx` (the
 *     `entry-client.tsx` web bootstraps are not PMTC input)
 *   - every `REGISTRY` snippet in `check-native-coverage.ts` (one per package
 *     that crosses to native — the widest library-lowering coverage in the repo)
 *
 * It also compiles each entry TWICE and requires equal output, because an
 * emitter that leaks module-level state between calls (the determinism class
 * fixed in the plain-mode hardening) would otherwise make a golden hash a
 * coin flip rather than a lock.
 *
 * A diff here is not necessarily a bug: an intentional emit change updates the
 * golden with `--update`, and the diff of `native-golden.json` in the PR is
 * the review surface. A refactor PR must show NO golden diff.
 *
 * Usage:
 *   bun scripts/check-native-golden.ts              # gate
 *   bun scripts/check-native-golden.ts --update     # regenerate the golden
 *   bun scripts/check-native-golden.ts --dump <dir> # write actual outputs for diffing
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// `import.meta.dir` is Bun-only; tests import these scripts under vitest, so derive it portably.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
import { transform } from './native-first-party-plugins'
import type { TargetLanguage } from '../packages/native/compiler/src/types'
import { REGISTRY } from './check-native-coverage'

const REPO_ROOT = resolve(SCRIPT_DIR, '..')
export const GOLDEN_PATH = join(SCRIPT_DIR, 'native-golden.json')
const TARGETS: readonly TargetLanguage[] = ['swift', 'kotlin']

/** `readdirSync` that treats a missing directory as empty (no separate exists-then-read race). */
function readdirOrEmpty(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export interface GoldenEntry {
  sha: string
  bytes: number
  warnings: number
}
export interface GoldenFile {
  description: string
  entries: Record<string, GoldenEntry>
}
export interface CorpusSource {
  key: string
  source: string
  filename: string
}

/** Pure: the hash of one compile result. Code AND warnings, so a lost or new warning is a diff. */
export function digestResult(result: { code: string; warnings: readonly string[] }): GoldenEntry {
  const sha = createHash('sha256')
    .update(result.code)
    .update('\0')
    .update(JSON.stringify(result.warnings))
    .digest('hex')
  return { sha, bytes: result.code.length, warnings: result.warnings.length }
}

export interface Drift {
  key: string
  kind: 'changed' | 'added' | 'removed'
  detail: string
}

/** Pure: compare an actual digest map to the golden, naming every entry that moved. */
export function diffGolden(
  golden: Record<string, GoldenEntry>,
  actual: Record<string, GoldenEntry>,
): Drift[] {
  const drift: Drift[] = []
  for (const [key, a] of Object.entries(actual)) {
    const g = golden[key]
    if (!g) {
      drift.push({ key, kind: 'added', detail: 'not in the golden (run --update if intentional)' })
    } else if (g.sha !== a.sha) {
      drift.push({
        key,
        kind: 'changed',
        detail: `bytes ${g.bytes} -> ${a.bytes}, warnings ${g.warnings} -> ${a.warnings}`,
      })
    }
  }
  for (const key of Object.keys(golden)) {
    if (!(key in actual)) drift.push({ key, kind: 'removed', detail: 'in the golden, not compiled now' })
  }
  return drift.sort((x, y) => x.key.localeCompare(y.key))
}

export function collectCorpus(root = REPO_ROOT): CorpusSource[] {
  const out: CorpusSource[] = []
  const fixtures = join(root, 'packages/native/compiler/src/fixtures')
  for (const f of readdirSync(fixtures).filter((n) => n.endsWith('.tsx')).sort()) {
    out.push({
      key: `fixture:${f}`,
      source: readFileSync(join(fixtures, f), 'utf8'),
      filename: `fixtures/${f}`,
    })
  }
  // Golden-only sources: shapes that warn by design (non-literal sizes) or lean on
  // an unresolvable import, so the zero-warning fixtures gate cannot hold them.
  // A fixture's key and compile filename do not name its directory (`golden-fixtures/…` for both), so
  // moving a fixture between the two owners never moves its hash.
  const goldenOnlyDirs = [
    join(root, 'packages/native/compiler/src/golden-fixtures'),
    join(root, 'packages/fundamentals/charts/native-golden'),
  ]
  const goldenOnly = goldenOnlyDirs
    .flatMap((dir) => readdirOrEmpty(dir).filter((n) => n.endsWith('.tsx')).map((n) => ({ dir, n })))
    .sort((a, b) => a.n.localeCompare(b.n))
  for (const { dir, n: f } of goldenOnly) {
    out.push({
      key: `golden-fixture:${f}`,
      source: readFileSync(join(dir, f), 'utf8'),
      filename: `golden-fixtures/${f}`,
    })
  }
  const examples = join(root, 'examples')
  for (const dir of readdirSync(examples).filter((n) => n.startsWith('native-')).sort()) {
    const src = join(examples, dir, 'src')
    for (const f of readdirOrEmpty(src).filter((n) => n.endsWith('.tsx') && n !== 'entry-client.tsx').sort()) {
      out.push({
        key: `example:${dir}/${f}`,
        source: readFileSync(join(src, f), 'utf8'),
        filename: `${dir}/src/${f}`,
      })
    }
  }
  for (const entry of REGISTRY) {
    if (entry.snippet) {
      out.push({ key: `registry:${entry.name}`, source: entry.snippet, filename: `registry/${entry.name}.tsx` })
    }
  }
  return out
}

export interface CompiledCorpus {
  digests: Record<string, GoldenEntry>
  outputs: Record<string, string>
  nondeterministic: string[]
}

export function compileCorpus(corpus: readonly CorpusSource[]): CompiledCorpus {
  const digests: Record<string, GoldenEntry> = {}
  const outputs: Record<string, string> = {}
  const nondeterministic: string[] = []
  for (const c of corpus) {
    for (const target of TARGETS) {
      const key = `${c.key}|${target}`
      const first = transform(c.source, { target, filename: c.filename })
      const second = transform(c.source, { target, filename: c.filename })
      const d1 = digestResult(first)
      if (d1.sha !== digestResult(second).sha) nondeterministic.push(key)
      digests[key] = d1
      outputs[key] = first.code
    }
  }
  return { digests, outputs, nondeterministic }
}

function main(): number {
  const args = process.argv.slice(2)
  const compiled = compileCorpus(collectCorpus())
  const dumpAt = args.indexOf('--dump')
  if (dumpAt >= 0) {
    const dir = resolve(args[dumpAt + 1] ?? '')
    mkdirSync(dir, { recursive: true })
    for (const [key, code] of Object.entries(compiled.outputs)) {
      writeFileSync(join(dir, `${key.replace(/[^A-Za-z0-9._-]+/g, '_')}.txt`), code)
    }
    console.log(`[check-native-golden] wrote ${Object.keys(compiled.outputs).length} outputs to ${dir}`)
  }
  if (compiled.nondeterministic.length > 0) {
    console.error(
      `[check-native-golden] NON-DETERMINISTIC emit (two compiles of the same source differ):\n  ${compiled.nondeterministic.join('\n  ')}\n` +
        'An emitter is leaking module-level state between calls. Reset it per emit; a golden hash is meaningless until this is fixed.',
    )
    return 1
  }
  if (args.includes('--update')) {
    const file: GoldenFile = {
      description:
        'Hash of (code + warnings) per corpus entry and target. Regenerate with `bun scripts/check-native-golden.ts --update`; a refactor PR must show no diff here.',
      entries: compiled.digests,
    }
    writeFileSync(GOLDEN_PATH, `${JSON.stringify(file, null, 2)}\n`)
    console.log(`[check-native-golden] wrote ${Object.keys(compiled.digests).length} entries to ${GOLDEN_PATH}`)
    return 0
  }
  let goldenText: string
  try {
    goldenText = readFileSync(GOLDEN_PATH, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    console.error('[check-native-golden] no golden file; run with --update')
    return 1
  }
  const golden = JSON.parse(goldenText) as GoldenFile
  const drift = diffGolden(golden.entries, compiled.digests)
  if (drift.length === 0) {
    console.log(`[check-native-golden] OK — ${Object.keys(compiled.digests).length} entries byte-identical to the golden`)
    return 0
  }
  console.error(`[check-native-golden] ${drift.length} entr${drift.length === 1 ? 'y' : 'ies'} changed:`)
  for (const d of drift.slice(0, 40)) console.error(`  ${d.kind.padEnd(7)} ${d.key}  (${d.detail})`)
  if (drift.length > 40) console.error(`  … and ${drift.length - 40} more`)
  console.error(
    '\nA refactor must not change emitted output. If this change is INTENTIONAL, run `bun scripts/check-native-golden.ts --update` and review the diff of scripts/native-golden.json. Use --dump <dir> before and after to diff the actual code.',
  )
  return 1
}

if (import.meta.main) process.exit(main())
